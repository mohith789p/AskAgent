const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('askAgentDesktop', {
  platform: process.platform,
  invokeTool: (name, input) => ipcRenderer.invoke('desktop-tool:invoke', { name, input }),
})
