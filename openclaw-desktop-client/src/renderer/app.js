const scanButton = document.getElementById('scan');
const importButton = document.getElementById('import-agent');
const resultsEl = document.getElementById('results');
const summaryEl = document.getElementById('summary');
const openWebButton = document.getElementById('open-web');
const backendUrlInput = document.getElementById('backend-url');
const authTokenInput = document.getElementById('auth-token');
const agentNameInput = document.getElementById('agent-name');
const agentDescriptionInput = document.getElementById('agent-description');
const importStatusEl = document.getElementById('import-status');
const runtimeRefreshButton = document.getElementById('runtime-refresh');
const runtimeHealthEl = document.getElementById('runtime-health');
const runtimeReadyEl = document.getElementById('runtime-ready');
const runtimeMissingCliEl = document.getElementById('runtime-missing-cli');
const runtimeMissingProviderEl = document.getElementById('runtime-missing-provider');
const officialAdoptModal = document.getElementById('official-adopt-modal');
const officialAdoptCloseButton = document.getElementById('official-adopt-close');
const officialAdoptLaterButton = document.getElementById('official-adopt-later');
const officialAdoptSubmitButton = document.getElementById('official-adopt-submit');
const officialBackendUrlInput = document.getElementById('official-backend-url');
const officialAuthTokenInput = document.getElementById('official-auth-token');
const officialAgentNameInput = document.getElementById('official-agent-name');
const officialAdoptStatusEl = document.getElementById('official-adopt-status');

const TOKEN_STORAGE_KEY = 'openclaw.desktop.authToken';
const BACKEND_STORAGE_KEY = 'openclaw.desktop.backendUrl';
const OFFICIAL_ADOPT_PROMPT_STORAGE_KEY = 'openclaw.desktop.officialAdoptPrompt.seen';
const OFFICIAL_ADOPTED_STORAGE_KEY = 'openclaw.desktop.officialLobster.adopted';

let selectedAgent = null;
let selectedFolder = null;
let latestAgents = [];

function restoreSettings() {
  backendUrlInput.value = localStorage.getItem(BACKEND_STORAGE_KEY) || backendUrlInput.value || 'http://localhost:3002';
  authTokenInput.value = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  syncOfficialAdoptInputs();
}

function persistSettings() {
  localStorage.setItem(BACKEND_STORAGE_KEY, backendUrlInput.value.trim() || 'http://localhost:3002');
  const token = normalizeToken(authTokenInput.value);
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

function normalizeToken(value) {
  return String(value || '').trim().replace(/^Bearer\s+/i, '');
}

function syncOfficialAdoptInputs() {
  if (!officialBackendUrlInput || !officialAuthTokenInput) return;
  officialBackendUrlInput.value = backendUrlInput.value.trim() || 'http://localhost:3002';
  officialAuthTokenInput.value = normalizeToken(authTokenInput.value);
}

function syncSettingsFromOfficialAdopt() {
  backendUrlInput.value = officialBackendUrlInput.value.trim() || 'http://localhost:3002';
  authTokenInput.value = normalizeToken(officialAuthTokenInput.value);
  persistSettings();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setImportStatus(message, tone = 'muted') {
  importStatusEl.textContent = message;
  importStatusEl.className = `import-status ${tone}`;
}

function setOfficialAdoptStatus(message, tone = 'muted') {
  officialAdoptStatusEl.textContent = message;
  officialAdoptStatusEl.className = `official-adopt-status ${tone}`;
}

function setImportReady(ready) {
  importButton.disabled = !ready;
}

function markOfficialAdoptPromptSeen() {
  localStorage.setItem(OFFICIAL_ADOPT_PROMPT_STORAGE_KEY, new Date().toISOString());
}

function showOfficialAdoptPrompt() {
  if (!officialAdoptModal || localStorage.getItem(OFFICIAL_ADOPT_PROMPT_STORAGE_KEY)) return;
  syncOfficialAdoptInputs();
  setOfficialAdoptStatus('填写 Token 后即可领养官方龙虾。');
  officialAdoptModal.classList.remove('hidden');
  window.setTimeout(() => officialAgentNameInput?.focus(), 80);
}

function hideOfficialAdoptPrompt(markSeen = true) {
  if (markSeen) markOfficialAdoptPromptSeen();
  officialAdoptModal.classList.add('hidden');
}

async function adoptOfficialLobsterFromDesktop() {
  const backendUrl = (officialBackendUrlInput.value.trim() || 'http://localhost:3002').replace(/\/+$/, '');
  const token = normalizeToken(officialAuthTokenInput.value);
  const name = officialAgentNameInput.value.trim() || '官方龙虾';

  if (!token) {
    setOfficialAdoptStatus('请先填写 Auth Token，当前桌面端还未接管网页登录态。', 'error');
    officialAuthTokenInput.focus();
    return;
  }

  syncSettingsFromOfficialAdopt();
  officialAdoptSubmitButton.disabled = true;
  officialAdoptLaterButton.disabled = true;
  setOfficialAdoptStatus('正在创建官方龙虾 Agent...');

  try {
    const response = await fetch(`${backendUrl}/api/agents/official-lobster/adopt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.agent) {
      throw new Error(payload.message || '领取官方龙虾失败');
    }

    localStorage.setItem(OFFICIAL_ADOPTED_STORAGE_KEY, payload.agent.id || new Date().toISOString());
    markOfficialAdoptPromptSeen();
    setOfficialAdoptStatus('领取成功，正在打开网页端 Agent 窝...', 'ok');
    window.setTimeout(() => {
      window.location.href = 'http://localhost:3000/my-den';
    }, 450);
  } catch (error) {
    setOfficialAdoptStatus(error.message || '领取官方龙虾失败', 'error');
    officialAdoptSubmitButton.disabled = false;
    officialAdoptLaterButton.disabled = false;
  }
}

function setRuntimeSummary(summary) {
  runtimeReadyEl.textContent = summary ? `${summary.ready}/${summary.total}` : '--';
  runtimeMissingCliEl.textContent = summary ? String(summary.missingCli) : '--';
  runtimeMissingProviderEl.textContent = summary ? String(summary.missingProvider) : '--';
}

function renderRuntimeHealth(health) {
  setRuntimeSummary(health?.summary);
  const platforms = Array.isArray(health?.platforms) ? health.platforms : [];
  if (!platforms.length) {
    runtimeHealthEl.innerHTML = '<div class="empty">暂无预检结果。</div>';
    return;
  }

  runtimeHealthEl.innerHTML = platforms.map((item) => {
    const providerReady = item.provider?.configuredCount > 0 || item.provider?.envConfigured;
    const issue = Array.isArray(item.issues) && item.issues.length ? item.issues[0] : item.installHint || '';
    const version = item.cli?.version ? `<div class="runtime-version">${escapeHtml(item.cli.version)}</div>` : '';
    const issueLine = issue ? `<div class="runtime-issue" title="${escapeHtml(issue)}">${escapeHtml(issue)}</div>` : '';
    return `
      <div class="runtime-card ${item.ready ? 'ready' : 'check'}">
        <div class="runtime-card-header">
          <div class="runtime-card-title">${escapeHtml(item.label || item.platform)}</div>
          <div class="runtime-badge ${item.ready ? 'ready' : 'check'}">${item.ready ? 'READY' : 'CHECK'}</div>
        </div>
        <div class="runtime-pills">
          <span class="runtime-pill ${item.cli?.available ? 'ok' : ''}">CLI ${item.cli?.available ? 'OK' : '缺失'}</span>
          <span class="runtime-pill ${providerReady ? 'ok' : ''}">供应商 ${item.provider?.configuredCount || (item.provider?.envConfigured ? 'ENV' : 0)}</span>
        </div>
        ${version}
        ${issueLine}
      </div>
    `;
  }).join('');
}

async function refreshRuntimeHealth() {
  const backendUrl = (backendUrlInput.value.trim() || 'http://localhost:3002').replace(/\/+$/, '');
  const token = normalizeToken(authTokenInput.value);
  if (!token) {
    setRuntimeSummary(null);
    runtimeHealthEl.innerHTML = '<div class="empty">填写 Auth Token 后才能检查运行时。</div>';
    return;
  }

  runtimeRefreshButton.disabled = true;
  runtimeRefreshButton.textContent = '检查中...';
  runtimeHealthEl.innerHTML = '<div class="empty">正在检查 CLI 与供应商配置...</div>';

  try {
    const response = await fetch(`${backendUrl}/api/providers/runtime-health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || '运行时预检失败');
    }
    renderRuntimeHealth(payload.health);
  } catch (error) {
    setRuntimeSummary(null);
    runtimeHealthEl.innerHTML = `<div class="empty">运行时预检失败：${escapeHtml(error.message || '未知错误')}</div>`;
  } finally {
    runtimeRefreshButton.disabled = false;
    runtimeRefreshButton.textContent = '重新检查';
  }
}

function renderSkippedFiles(folder) {
  if (!folder?.skippedCount) return '';
  const samples = Array.isArray(folder.skippedSamples) ? folder.skippedSamples : [];
  const sampleItems = samples.slice(0, 6).map((item) => `
    <li title="${escapeHtml(item.reason || '')}">${escapeHtml(item.path)}</li>
  `).join('');
  return `
    <div class="skip-summary">
      <div class="skip-title">已自动过滤 ${folder.skippedCount} 个敏感配置、密钥、缓存或运行态条目。</div>
      ${sampleItems ? `<ul>${sampleItems}</ul>` : ''}
    </div>
  `;
}

function renderResults(agents) {
  latestAgents = agents;
  selectedAgent = null;
  selectedFolder = null;
  setImportReady(false);

  if (!agents.length) {
    resultsEl.innerHTML = '<div class="empty">没有发现可导入的本地 Agent。</div>';
    setImportStatus('没有扫描结果。可以缩小目录后再试，或直接在网页端上传文件夹。');
    return;
  }

  resultsEl.innerHTML = agents.map((agent, index) => `
    <button class="agent-card" data-index="${index}">
      <div class="agent-type">${escapeHtml(agent.type)} · ${escapeHtml(agent.confidence)}</div>
      <div class="agent-name">${escapeHtml(agent.name)}</div>
      <div class="agent-path">${escapeHtml(agent.path)}</div>
      <div class="agent-reason">${escapeHtml(agent.reason)}</div>
    </button>
  `).join('');

  for (const button of resultsEl.querySelectorAll('.agent-card')) {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      selectedAgent = latestAgents[index];
      selectedFolder = null;
      for (const item of resultsEl.querySelectorAll('.agent-card')) item.classList.remove('selected');
      button.classList.add('selected');
      void prepareImport(selectedAgent);
    });
  }
}

async function prepareImport(agent) {
  summaryEl.textContent = `正在读取 ${agent.name}`;
  setImportReady(false);
  setImportStatus(`正在读取本地文件夹：${agent.path}`);
  agentNameInput.value = agent.name || '';
  agentDescriptionInput.value = `${agent.type} local agent imported from ${agent.path}`;

  try {
    selectedFolder = await window.openclawDesktop.readLocalAgentFolder(agent.path);
    const skippedText = selectedFolder.skippedCount ? ` · 已过滤 ${selectedFolder.skippedCount} 个本地敏感/运行态条目` : '';
    summaryEl.textContent = `${agent.type} · ${selectedFolder.fileCount} 个文件 · ${Math.round(selectedFolder.totalBytes / 1024)} KB${skippedText}`;
    setImportStatus(`已准备 ${selectedFolder.fileCount} 个文件，可安全导入到后端。${selectedFolder.skippedCount ? `已过滤 ${selectedFolder.skippedCount} 个本地敏感/运行态条目。` : ''}`, 'ok');
    const skippedEl = document.getElementById('skip-summary');
    if (skippedEl) skippedEl.innerHTML = renderSkippedFiles(selectedFolder);
    setImportReady(true);
  } catch (error) {
    selectedFolder = null;
    const skippedEl = document.getElementById('skip-summary');
    if (skippedEl) skippedEl.innerHTML = '';
    setImportStatus(error.message || '读取失败', 'error');
  }
}

async function importSelectedAgent() {
  if (!selectedAgent || !selectedFolder) {
    setImportStatus('请先选择一个扫描结果。', 'error');
    return;
  }

  const backendUrl = (backendUrlInput.value.trim() || 'http://localhost:3002').replace(/\/+$/, '');
  const token = normalizeToken(authTokenInput.value);
  const name = agentNameInput.value.trim() || selectedAgent.name || 'local-agent';
  const description = agentDescriptionInput.value.trim();

  if (!token) {
    setImportStatus('请填写 Auth Token。当前桌面端还未接管网页登录态。', 'error');
    return;
  }

  persistSettings();
  importButton.disabled = true;
  setImportStatus('正在上传到后端，请保持桌面端打开...');

  try {
    const response = await fetch(`${backendUrl}/api/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadType: 'folder',
        name,
        description,
        agentType: selectedAgent.type,
        files: selectedFolder.files,
        publishToMarket: false,
        deferMarketPublish: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || '导入失败');
    }

    const webUrl = `http://localhost:3000/agent/${encodeURIComponent(payload.agentId)}`;
    setImportStatus(`导入成功：${payload.agentType} · ${payload.fileCount} 个文件 · ${payload.agentId}`, 'ok');
    summaryEl.innerHTML = `已导入 <a href="${webUrl}">打开 Agent</a>`;
  } catch (error) {
    setImportStatus(error.message || '导入失败', 'error');
    setImportReady(true);
  }
}

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true;
  summaryEl.textContent = '扫描中...';
  resultsEl.innerHTML = '<div class="empty">正在扫描用户目录，请稍候。</div>';
  setImportStatus('扫描会跳过 AppData、node_modules、.git 等大目录。');
  try {
    const result = await window.openclawDesktop.scanLocalAgents();
    summaryEl.textContent = `扫描 ${result.scannedDirs} 个目录，发现 ${result.agents.length} 个 Agent`;
    if (result.scanLimitReached) {
      setImportStatus('扫描达到目录上限，结果可能不完整。可以把目标 Agent 放到 Desktop、Documents、Downloads 或 ~/.openclaw 下再扫描。', 'error');
    }
    renderResults(result.agents);
  } catch (error) {
    summaryEl.textContent = error.message || '扫描失败';
    resultsEl.innerHTML = '<div class="empty">扫描失败。</div>';
    setImportStatus(error.message || '扫描失败', 'error');
  } finally {
    scanButton.disabled = false;
  }
});

importButton.addEventListener('click', () => {
  void importSelectedAgent();
});

runtimeRefreshButton.addEventListener('click', () => {
  persistSettings();
  syncOfficialAdoptInputs();
  void refreshRuntimeHealth();
});

backendUrlInput.addEventListener('change', syncOfficialAdoptInputs);
authTokenInput.addEventListener('change', syncOfficialAdoptInputs);

officialAdoptCloseButton.addEventListener('click', () => {
  hideOfficialAdoptPrompt(true);
});

officialAdoptLaterButton.addEventListener('click', () => {
  hideOfficialAdoptPrompt(true);
});

officialAdoptSubmitButton.addEventListener('click', () => {
  void adoptOfficialLobsterFromDesktop();
});

officialAdoptModal.addEventListener('click', (event) => {
  if (event.target === officialAdoptModal) {
    hideOfficialAdoptPrompt(true);
  }
});

openWebButton.addEventListener('click', () => {
  window.location.href = 'http://localhost:3000';
});

for (const nav of document.querySelectorAll('[data-href]')) {
  nav.addEventListener('click', () => {
    window.location.href = nav.dataset.href;
  });
}

restoreSettings();
if (normalizeToken(authTokenInput.value)) {
  void refreshRuntimeHealth();
}
window.setTimeout(showOfficialAdoptPrompt, 160);
