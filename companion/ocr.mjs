/**
 * 截图 OCR：常驻一个 PowerShell 辅助进程（companion/ocr-helper.ps1）。
 *
 * 时序很重要：**按下鼠标时就要抓屏**（capture），松手后再按拖拽矩形裁切识别（ocr）。
 * 松手时再抓的话，应用自己画的选区高亮会一起进图。
 *
 * 协议：每行一个 JSON。详见 ocr-helper.ps1 顶部注释。
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HELPER = path.join(HERE, 'ocr-helper.ps1')

const POWERSHELL = 'powershell.exe'
const SPAWN_ARGS = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', HELPER]

export function createOcr({ onError } = {}) {
  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null
  let seq = 0
  /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void, timer: any }>} */
  const pending = new Map()

  const failPending = (message) => {
    for (const [id, waiter] of pending) {
      clearTimeout(waiter.timer)
      pending.delete(id)
      waiter.reject(new Error(message))
    }
  }

  function start() {
    if (child !== null) return
    let proc
    try {
      proc = spawn(POWERSHELL, SPAWN_ARGS, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    } catch (error) {
      onError?.('ocr-spawn', error)
      return
    }
    child = proc
    proc.stdout.setEncoding('utf8')
    const lines = createInterface({ input: proc.stdout })
    lines.on('line', (line) => {
      let reply
      try {
        reply = JSON.parse(line)
      } catch {
        return // 辅助进程理论上只输出 JSON；偶发的杂音直接忽略
      }
      const waiter = pending.get(reply.id)
      if (waiter === undefined) return
      pending.delete(reply.id)
      clearTimeout(waiter.timer)
      if (reply.ok === true) waiter.resolve(reply)
      else waiter.reject(new Error(reply.message ?? 'ocr failed'))
    })
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', () => {}) // PowerShell 的启动噪音不要塞进日志
    proc.stdin.on('error', () => {})
    proc.on('error', (error) => {
      if (child === proc) child = null
      failPending('ocr helper failed to start: ' + (error instanceof Error ? error.message : String(error)))
      onError?.('ocr-spawn', error)
    })
    proc.on('exit', () => {
      if (child === proc) child = null
      failPending('ocr helper exited')
    })
  }

  function call(cmd, params, timeoutMs) {
    start()
    if (child === null) return Promise.reject(new Error('ocr helper unavailable'))
    const id = ++seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`ocr helper timeout (${cmd})`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      try {
        child.stdin.write(JSON.stringify({ id, cmd, ...params }) + '\n')
      } catch (error) {
        pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  return {
    /** 抓整个虚拟屏幕到辅助进程内存（必须在鼠标按下时调用）。 */
    capture: () => call('capture', {}, 8_000),
    /** 从刚才的快照里裁 rect（屏幕物理坐标）并识别。 */
    recognize: (rect) => call('ocr', rect, 25_000),
    dispose() {
      const proc = child
      child = null
      if (proc === null) return
      try {
        proc.stdin.write('{"id":0,"cmd":"quit"}\n')
        proc.stdin.end()
      } catch {
        /* 已经退了就算了 */
      }
      setTimeout(() => {
        try {
          proc.kill()
        } catch {
          /* ignore */
        }
      }, 300).unref?.()
    },
  }
}
