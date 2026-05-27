const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { exec } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const util = require('node:util')

const isDevelopment = !app.isPackaged
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
const execAsync = util.promisify(exec)
const defaultWorkspace = process.cwd()
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'build', 'icon.ico')
  : path.join(__dirname, '..', 'build', 'icon.ico')

let mainWindow

function resolveUserPath(userPath = '.') {
  if (path.isAbsolute(userPath)) {
    return path.normalize(userPath)
  }

  return path.resolve(defaultWorkspace, userPath)
}

function truncate(value, maxLength = 12000) {
  if (typeof value !== 'string' || value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}\n\n[truncated ${value.length - maxLength} characters]`
}

async function askPermission({ title, message, detail }) {
  const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow
  const response = await dialog.showMessageBox(focusedWindow, {
    type: 'warning',
    buttons: ['Allow once', 'Deny'],
    cancelId: 1,
    defaultId: 1,
    title,
    message,
    detail,
    noLink: true,
  })

  return response.response === 0
}

async function requirePermission(request) {
  const allowed = await askPermission(request)

  if (!allowed) {
    return {
      ok: false,
      error: 'Permission denied by the user before the action was performed.',
    }
  }

  return null
}

async function invokeDesktopTool(name, input = {}) {
  switch (name) {
    case 'file_list_directory': {
      const targetPath = resolveUserPath(input.path)
      const entries = await fs.readdir(targetPath, { withFileTypes: true })

      return {
        ok: true,
        path: targetPath,
        entries: entries.map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        })),
      }
    }

    case 'file_read': {
      const targetPath = resolveUserPath(input.path)
      const content = await fs.readFile(targetPath, 'utf8')

      return {
        ok: true,
        path: targetPath,
        content: truncate(content),
      }
    }

    case 'file_write': {
      const targetPath = resolveUserPath(input.path)
      const denied = await requirePermission({
        title: 'Allow File Write?',
        message: 'AskAgent wants to write a file.',
        detail: `Path: ${targetPath}`,
      })

      if (denied) {
        return denied
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, input.content ?? '', input.append ? { flag: 'a' } : undefined)

      return {
        ok: true,
        path: targetPath,
        action: input.append ? 'appended' : 'written',
      }
    }

    case 'file_delete': {
      const targetPath = resolveUserPath(input.path)
      const denied = await requirePermission({
        title: 'Allow File Delete?',
        message: 'AskAgent wants to delete a file or folder.',
        detail: `Path: ${targetPath}`,
      })

      if (denied) {
        return denied
      }

      await fs.rm(targetPath, { recursive: Boolean(input.recursive), force: Boolean(input.force) })

      return {
        ok: true,
        path: targetPath,
        action: 'deleted',
      }
    }

    case 'shell_execute': {
      const command = String(input.command ?? '').trim()

      if (!command) {
        return { ok: false, error: 'No command was provided.' }
      }

      const cwd = resolveUserPath(input.cwd || '.')
      const denied = await requirePermission({
        title: 'Allow Shell Command?',
        message: 'AskAgent wants to run a terminal command.',
        detail: `Command: ${command}\nWorking directory: ${cwd}`,
      })

      if (denied) {
        return denied
      }

      const result = await execAsync(command, {
        cwd,
        timeout: Number(input.timeoutMs ?? 30000),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      })

      return {
        ok: true,
        command,
        cwd,
        stdout: truncate(result.stdout),
        stderr: truncate(result.stderr),
      }
    }

    case 'desktop_screenshot': {
      if (!mainWindow) {
        return { ok: false, error: 'No desktop window is available.' }
      }

      const image = await mainWindow.webContents.capturePage()

      return {
        ok: true,
        format: 'png',
        dataUrl: image.toDataURL(),
      }
    }

    case 'desktop_mouse_click': {
      const x = Number(input.x)
      const y = Number(input.y)
      const denied = await requirePermission({
        title: 'Allow Mouse Control?',
        message: 'AskAgent wants to click inside the AskAgent window.',
        detail: `Coordinates: ${x}, ${y}`,
      })

      if (denied) {
        return denied
      }

      mainWindow.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      mainWindow.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })

      return { ok: true, action: 'clicked', x, y }
    }

    case 'desktop_keyboard_type': {
      const text = String(input.text ?? '')
      const denied = await requirePermission({
        title: 'Allow Keyboard Control?',
        message: 'AskAgent wants to type inside the AskAgent window.',
        detail: text,
      })

      if (denied) {
        return denied
      }

      mainWindow.webContents.insertText(text)

      return { ok: true, action: 'typed', characterCount: text.length }
    }

    case 'app_open': {
      const target = String(input.target ?? '').trim()

      if (!target) {
        return { ok: false, error: 'No app, path, or URL was provided.' }
      }

      const denied = await requirePermission({
        title: 'Allow App Launch?',
        message: 'AskAgent wants to open an app, path, or URL.',
        detail: target,
      })

      if (denied) {
        return denied
      }

      const errorMessage = target.startsWith('http://') || target.startsWith('https://')
        ? await shell.openExternal(target)
        : await shell.openPath(target)

      return errorMessage ? { ok: false, error: errorMessage } : { ok: true, target }
    }

    case 'playwright_browser':
      return {
        ok: false,
        error:
          'Playwright toolkit is registered, but Playwright is not wired yet. Install browser binaries and add the requested browser actions before using it.',
      }

    case 'e2b_sandbox':
      return {
        ok: false,
        error:
          'E2B sandbox toolkit is registered, but it needs an E2B API key and SDK wiring before it can create remote sandboxes.',
      }

    case 'permission_request':
      return {
        ok: await askPermission({
          title: input.title || 'Allow Action?',
          message: input.message || 'AskAgent is requesting permission.',
          detail: input.detail || '',
        }),
      }

    default:
      return { ok: false, error: `Unknown desktop tool: ${name}` }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#f7f5ef',
    icon: appIconPath,
    title: 'AskAgent',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDevelopment) {
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('desktop-tool:invoke', async (_event, request) => {
    try {
      return await invokeDesktopTool(request.name, request.input)
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Desktop tool failed.',
      }
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
