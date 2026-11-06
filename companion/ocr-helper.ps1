# dsh-select-translate：截图 OCR 辅助进程
#
# 常驻进程，按行读写 JSON：
#   {"id":1,"cmd":"ping"}
#   {"id":2,"cmd":"capture"}                 → 把整个虚拟屏幕抓进内存（必须在按下鼠标时调用，
#                                              这样拖拽过程中应用自己画的选区高亮不会进图）
#   {"id":3,"cmd":"ocr","x":..,"y":..,"w":..,"h":..} → 从快照里裁一块，Windows OCR 识别
#   {"id":4,"cmd":"quit"}
#
# 输出统一为 {"id":N,"ok":true,...} 或 {"id":N,"ok":false,"message":"..."}。
# 用 Windows 自带的 Windows.Media.Ocr（需要系统里有对应语言的 OCR 语言包）。

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# 物理像素：PowerShell 默认是 DPI 不感知的，不设置的话 150% 缩放会把坐标当逻辑像素
Add-Type -Namespace DshOcr -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@
[void][DshOcr.Native]::SetProcessDPIAware()

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, $type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  try { $task.Wait(20000) | Out-Null } catch { throw $task.Exception.GetBaseException().Message }
  if ($task.IsFaulted) { throw $task.Exception.GetBaseException().Message }
  return $task.Result
}

function Get-OcrEngine {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) {
    foreach ($tag in @('zh-Hans-CN', 'zh-Hans', 'en-US')) {
      try {
        $lang = New-Object Windows.Globalization.Language $tag
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
        if ($null -ne $engine) { break }
      } catch { }
    }
  }
  return $engine
}

function Convert-BitmapToSoftwareBitmap($bmp) {
  $ms = New-Object System.IO.MemoryStream
  try {
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $ms.Position = 0
    $ras = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras)) ([Windows.Graphics.Imaging.BitmapDecoder])
    return Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  } finally {
    $ms.Dispose()
  }
}

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:shot = $null
$script:shotLeft = 0
$script:shotTop = 0
$script:engine = Get-OcrEngine

while ($null -ne ($line = [Console]::In.ReadLine())) {
  $req = $null
  try {
    $req = $line | ConvertFrom-Json
    switch ($req.cmd) {
      'ping' {
        $lang = if ($null -eq $script:engine) { '' } else { $script:engine.RecognizerLanguage.LanguageTag }
        $reply = @{ id = $req.id; ok = $true; engine = ($null -ne $script:engine); lang = $lang }
      }
      'capture' {
        $screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
        if ($null -ne $script:shot) { $script:shot.Dispose() }
        $bmp = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
          $g.CopyFromScreen($screen.Left, $screen.Top, 0, 0, $bmp.Size)
        } finally {
          $g.Dispose()
        }
        $script:shot = $bmp
        $script:shotLeft = $screen.Left
        $script:shotTop = $screen.Top
        $reply = @{ id = $req.id; ok = $true; width = $bmp.Width; height = $bmp.Height; left = $screen.Left; top = $screen.Top }
      }
      'ocr' {
        if ($null -eq $script:shot) { throw 'capture first' }
        if ($null -eq $script:engine) { throw 'no OCR language pack' }
        $x = [int]$req.x - $script:shotLeft
        $y = [int]$req.y - $script:shotTop
        $w = [int]$req.w
        $h = [int]$req.h
        if ($x -lt 0) { $w += $x; $x = 0 }
        if ($y -lt 0) { $h += $y; $y = 0 }
        if ($x + $w -gt $script:shot.Width) { $w = $script:shot.Width - $x }
        if ($y + $h -gt $script:shot.Height) { $h = $script:shot.Height - $y }
        if ($w -lt 2 -or $h -lt 2) { throw 'region too small' }
        $crop = New-Object System.Drawing.Bitmap $w, $h
        try {
          $g = [System.Drawing.Graphics]::FromImage($crop)
          try {
            $g.DrawImage($script:shot, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), (New-Object System.Drawing.Rectangle $x, $y, $w, $h), [System.Drawing.GraphicsUnit]::Pixel)
          } finally {
            $g.Dispose()
          }
          $sw = Convert-BitmapToSoftwareBitmap $crop
          $result = Await ($script:engine.RecognizeAsync($sw)) ([Windows.Media.Ocr.OcrResult])
          $reply = @{ id = $req.id; ok = $true; text = [string]$result.Text }
        } finally {
          $crop.Dispose()
        }
      }
      'quit' { break }
      default { throw "unknown cmd: $($req.cmd)" }
    }
  } catch {
    $id = if ($null -eq $req) { 0 } else { $req.id }
    $reply = @{ id = $id; ok = $false; message = $_.Exception.Message }
  }
  if ($null -ne $req -and $req.cmd -eq 'quit') { break }
  [Console]::Out.WriteLine(($reply | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
