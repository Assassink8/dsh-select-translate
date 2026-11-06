/** 按划词落点识别来源应用；不根据窗口标题或进程 PID 持久化规则。 */
import { win32 } from 'node:path'
import { normalizeApplicationPath } from '../settings.mjs'

export function applicationName(path) {
  return win32.basename(path || '')
}

export function isApplicationDisabled(path, disabledApps) {
  const normalized = normalizeApplicationPath(path)
  return normalized !== null && disabledApps.includes(normalized)
}

/** 可注入 Win32 调用，测试不依赖真实 Windows 桌面。 */
export function readApplication(api, point) {
  let processHandle = null
  try {
    const child = api.WindowFromPoint(point)
    if (child === null) return null
    const window = api.GetAncestor(child, 2 /* GA_ROOT */) || child
    const pid = [0]
    api.GetWindowThreadProcessId(window, pid)
    if (!pid[0]) return null
    processHandle = api.OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid[0])
    if (processHandle === null) return null
    const buffer = Buffer.alloc(32768 * 2)
    const length = [32768]
    if (!api.QueryFullProcessImageNameW(processHandle, 0, buffer, length)) return null
    return normalizeApplicationPath(buffer.subarray(0, length[0] * 2).toString('utf16le'))
  } catch {
    return null
  } finally {
    if (processHandle !== null) {
      try { api.CloseHandle(processHandle) } catch {}
    }
  }
}

export function createApplicationReader(api) {
  const bindings = {
    WindowFromPoint: api.user32.func('void *WindowFromPoint(DST_POINT point)'),
    GetAncestor: api.user32.func('void *GetAncestor(void *hwnd, unsigned int flags)'),
    GetWindowThreadProcessId: api.GetWindowThreadProcessId,
    OpenProcess: api.kernel32.func('void *OpenProcess(uint32 access, bool inherit, uint32 pid)'),
    QueryFullProcessImageNameW: api.kernel32.func('bool QueryFullProcessImageNameW(void *process, uint32 flags, _Out_ uint16_t *name, _Inout_ uint32 *size)'),
    CloseHandle: api.kernel32.func('bool CloseHandle(void *handle)'),
  }
  return (point) => readApplication(bindings, point)
}

/** 禁用应用在进入 UIA 之前拦截；Shift 仅允许打开恢复入口。 */
export async function probeAllowedApplication({ app, disabledApps, shift, probe }) {
  if (isApplicationDisabled(app, disabledApps)) return { blocked: true, manage: shift, result: null }
  return { blocked: false, manage: false, result: await probe() }
}
