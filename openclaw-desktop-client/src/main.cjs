const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { scanLocalAgents, collectFolderForUpload } = require('./local-agent-scanner.cjs');
const { deleteLocalAgent, importLocalAgent, listLocalAgents } = require('./local-agent-registry.cjs');
const {
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  openLocalProject,
  readLocalProjectFile,
  readLocalProjectTree,
  updateLocalProject,
} = require('./local-project-service.cjs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'OpenClaw Desktop',
    backgroundColor: '#E8E8E8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const webUrl = process.env.OPENCLAW_DESKTOP_WEB_URL || 'http://127.0.0.1:3000';
  const useLegacyRenderer = process.env.OPENCLAW_DESKTOP_LEGACY_RENDERER === '1';

  if (useLegacyRenderer) {
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  } else {
    win.loadURL(webUrl);
    win.webContents.once('did-fail-load', () => {
      if (!win.isDestroyed()) {
        win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
      }
    });
  }
}

app.whenReady().then(() => {
  ipcMain.handle('local-agent:scan', (_event, options) => scanLocalAgents(options || {}));
  ipcMain.handle('local-agent:read-folder', (_event, rootPath, options) => collectFolderForUpload(rootPath, options || {}));
  ipcMain.handle('local-agent:list', (_event, options) => listLocalAgents(options || {}));
  ipcMain.handle('local-agent:import', (_event, input, options) => importLocalAgent(input || {}, options || {}));
  ipcMain.handle('local-agent:delete', (_event, agentId, options) => deleteLocalAgent(agentId, options || {}));
  ipcMain.handle('local-project:list', (_event, options) => listLocalProjects(options || {}));
  ipcMain.handle('local-project:create', (_event, input, options) => createLocalProject(input || {}, options || {}));
  ipcMain.handle('local-project:update', (_event, projectId, input, options) => updateLocalProject(projectId, input || {}, options || {}));
  ipcMain.handle('local-project:open', (_event, projectId, options) => openLocalProject(projectId, options || {}));
  ipcMain.handle('local-project:delete', (_event, projectId, options) => deleteLocalProject(projectId, options || {}));
  ipcMain.handle('local-project:read-tree', (_event, projectId, relativePath, options) =>
    readLocalProjectTree(projectId, relativePath || '', options || {})
  );
  ipcMain.handle('local-project:read-file', (_event, projectId, relativePath, options) =>
    readLocalProjectFile(projectId, relativePath || '', options || {})
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
