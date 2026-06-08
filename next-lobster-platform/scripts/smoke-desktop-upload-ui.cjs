const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const uploadPage = fs.readFileSync(path.join(root, 'src', 'app', 'upload', 'page.tsx'), 'utf8');
const desktopLib = fs.readFileSync(path.join(root, 'src', 'lib', 'desktop.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesAll(source, values, label) {
  for (const value of values) {
    assert(source.includes(value), `${label} missing "${value}"`);
  }
}

function matchesAll(source, patterns, label) {
  for (const pattern of patterns) {
    assert(pattern.test(source), `${label} missing pattern ${pattern}`);
  }
}

includesAll(desktopLib, [
  'OpenClawDesktopBridge',
  'scanLocalAgents',
  'readLocalAgentFolder',
  'listLocalAgents',
  'importLocalAgent',
  'listLocalProjects',
  'DesktopFolderPayload',
  'getOpenClawDesktop',
  'window.openclawDesktop',
], 'desktop bridge lib');

includesAll(uploadPage, [
  'DesktopLocalAgentUpload',
  'getOpenClawDesktop',
  'bridge.scanLocalAgents',
  'bridge.readLocalAgentFolder',
  '扫描本地 Agent',
  '重新扫描',
  '打开 Agent 形象设置',
  'UploadAgentSetupDialog',
  'WebUploadPage',
], 'upload page desktop branch');

matchesAll(uploadPage, [
  /if \(desktopBridge\) \{\s*return <DesktopLocalAgentUpload bridge=\{desktopBridge\} \/>;\s*\}/s,
  /bridge\.importLocalAgent\(\{/,
  /rootPath:\s*selectedFolder\.rootPath/,
  /agentType:\s*effectiveAgentType/,
  /marketPublishEnabled=\{false\}/,
  /router\.push\('\/my-den'\)/,
], 'desktop upload flow');

console.log(JSON.stringify({
  desktopBridgeTyped: true,
  uploadPageDesktopBranch: true,
  localScanUploadFlow: true,
  webUploadFallbackPreserved: true,
}, null, 2));
