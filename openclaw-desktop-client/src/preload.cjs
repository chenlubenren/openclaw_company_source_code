const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openclawDesktop', {
  isDesktop: true,
  scanLocalAgents: (options) => ipcRenderer.invoke('local-agent:scan', options),
  readLocalAgentFolder: (rootPath, options) => ipcRenderer.invoke('local-agent:read-folder', rootPath, options),
  listLocalAgents: (options) => ipcRenderer.invoke('local-agent:list', options),
  importLocalAgent: (input, options) => ipcRenderer.invoke('local-agent:import', input, options),
  deleteLocalAgent: (agentId, options) => ipcRenderer.invoke('local-agent:delete', agentId, options),
  listLocalProjects: (options) => ipcRenderer.invoke('local-project:list', options),
  createLocalProject: (input, options) => ipcRenderer.invoke('local-project:create', input, options),
  updateLocalProject: (projectId, input, options) => ipcRenderer.invoke('local-project:update', projectId, input, options),
  openLocalProject: (projectId, options) => ipcRenderer.invoke('local-project:open', projectId, options),
  deleteLocalProject: (projectId, options) => ipcRenderer.invoke('local-project:delete', projectId, options),
  readLocalProjectTree: (projectId, relativePath, options) =>
    ipcRenderer.invoke('local-project:read-tree', projectId, relativePath, options),
  readLocalProjectFile: (projectId, relativePath, options) =>
    ipcRenderer.invoke('local-project:read-file', projectId, relativePath, options),
});
