'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { BackButton } from '@/components/ui/BackButton';
import {
  UploadAgentSetupDialog,
  type UploadSetupPayload,
} from '@/components/agent/UploadAgentSetupDialog';
import { useAuthStore } from '@/store/useAuthStore';
import {
  AGENT_TYPE_OPTIONS,
  detectAgentTypeFromFiles,
  getAgentTypeLabel,
  type AgentPlatformType,
  type DetectionResult,
} from '@/lib/agentTypeDetect';
import {
  getOpenClawDesktop,
  type DesktopAgentCandidate,
  type DesktopFolderPayload,
  type OpenClawDesktopBridge,
} from '@/lib/desktop';
import { API_BASE } from '@/lib/runtime';

const BASE_URL = API_BASE;

type FileUploadMode = 'folder' | 'zip';
type UploadMode = FileUploadMode | 'coze';

const SENSITIVE_PATTERNS = [
  { name: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}/g },
  { name: 'Anthropic API Key', pattern: /sk-ant-[a-zA-Z0-9-]{50,}/g },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g },
  { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
];

interface SensitiveFile {
  path: string;
  type: string;
}

interface CozeMarketAgent {
  id: string;
  botId: string;
  name: string;
  description: string;
  icon: string;
  coverImage?: string;
  tags: string[];
  category: string;
  creator: string;
  rating: number;
  deployCount: number;
  sourceUrl: string;
  featured?: boolean;
}

interface CozeRuntimeInfo {
  apiBase: string;
  configured: boolean;
}

function isKnownAgentType(type: string | null | undefined): type is AgentPlatformType {
  return type === 'unknown' || AGENT_TYPE_OPTIONS.some((option) => option.id === type);
}

function normalizeDesktopAgentType(type: string | null | undefined): AgentPlatformType | null {
  return isKnownAgentType(type) ? type : null;
}

function buildDesktopDetection(agent: DesktopAgentCandidate | null): DetectionResult | null {
  if (!agent) return null;
  return {
    detected: normalizeDesktopAgentType(agent.type),
    confidence: agent.confidence,
    scores: agent.scores || { [agent.type]: agent.confidence === 'high' ? 100 : 3 },
    reason: agent.reason,
  };
}

function getCozeAvatar(agent: Pick<CozeMarketAgent, 'icon'>): string {
  return agent.icon || '/lobsters/lobster-merchant.png';
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 5).map((tag) => (
        <span key={tag} className="bg-pixel-black/10 px-2 py-1 font-pixel text-[10px] text-pixel-black/70">
          #{tag}
        </span>
      ))}
    </div>
  );
}

function CozeSummonTab({ token }: { token: string | null }) {
  const router = useRouter();
  const [agents, setAgents] = useState<CozeMarketAgent[]>([]);
  const [runtime, setRuntime] = useState<CozeRuntimeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<CozeMarketAgent | null>(null);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchAgents = useCallback(async (query = search) => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: '50' });
      if (query.trim()) params.set('search', query.trim());
      const res = await fetch(`${BASE_URL}/api/market/coze?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || '加载跨次元召唤列表失败');
      setAgents(Array.isArray(data.agents) ? data.agents : []);
      setRuntime(data.runtime || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载跨次元召唤列表失败');
    } finally {
      setLoading(false);
    }
  }, [search, token]);

  useEffect(() => {
    void fetchAgents('');
    // Search uses the explicit button below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDeploy = async (agent: CozeMarketAgent) => {
    if (!token) return;

    try {
      setDeploying(agent.botId);
      const res = await fetch(`${BASE_URL}/api/market/coze/${encodeURIComponent(agent.botId)}/deploy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || '召唤 Coze Agent 失败');
      setSelectedAgent(null);
      if (!data.runtime?.configured) {
        alert('已召唤。当前后端还未配置 COZE_API_TOKEN，配置后即可真实调用 Coze。');
      }
      if (typeof data.agentId === 'string') {
        router.push(`/agent/${data.agentId}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '召唤 Coze Agent 失败');
    } finally {
      setDeploying(null);
    }
  };

  if (!token) {
    return (
      <div className="border-4 border-pixel-black bg-pixel-black/5 p-8 text-center">
        <p className="font-pixel text-lg text-pixel-black">请先登录</p>
        <p className="mt-2 font-pixel text-sm text-pixel-black/60">
          登录后可以把 Coze 等平台的 API Agent 召唤成本平台可部署 Agent。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-4 border-pixel-black bg-pixel-white p-4" style={{ boxShadow: '4px 4px 0 #101010' }}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void fetchAgents();
              }}
              placeholder="搜索 Coze Agent"
              className="min-w-0 flex-1 border-2 border-pixel-black px-3 py-2 font-pixel text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void fetchAgents()}
              className="border-y-2 border-r-2 border-pixel-black bg-pixel-black px-4 py-2 font-pixel text-sm text-pixel-white"
            >
              搜索
            </button>
          </div>
          <div className={`border-2 px-3 py-2 font-pixel text-xs ${runtime?.configured ? 'border-pixel-green text-pixel-green' : 'border-pixel-black text-pixel-black/60'}`}>
            {runtime?.configured ? 'Coze API 已连接' : '待配置 COZE_API_TOKEN'}
          </div>
        </div>
      </div>

    </div>
  );
}

function UploadGlyph({ mode, selected = false }: { mode: FileUploadMode; selected?: boolean }) {
  const className = selected
    ? 'h-16 w-16 text-pixel-black'
    : 'h-16 w-16 text-pixel-black/50';

  if (mode === 'folder') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path
          fill="currentColor"
          d="M3 6h7l2 2h9v10c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V6zm2 4v8h14v-8H5z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h9l5 5v15H6V2zm8 1v5h5M9 12h6v2H9v-2zm0 4h6v2H9v-2z"
      />
    </svg>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function scanForSensitiveInfo(files: File[]): Promise<SensitiveFile[]> {
  const sensitiveFiles: SensitiveFile[] = [];
  const sensitivePathPatterns = [
    { type: 'Environment file', pattern: /(^|\/)\.env($|[./])/i },
    { type: 'Git history folder', pattern: /(^|\/)\.git($|\/)/i },
    { type: 'Private key file', pattern: /(^|\/)(id_rsa|id_ed25519|id_ecdsa|.*\.(pem|key|p12|pfx|pkcs8))$/i },
    { type: 'Credential file', pattern: /(^|\/)(secrets?|credentials?|tokens?|api[_-]?keys?)\.(json|ya?ml|toml|ini|env|txt)$/i },
    { type: 'Agent config may contain secrets', pattern: /(^|\/)agent\.config\.json$/i },
    { type: 'OpenClaw auth profile', pattern: /(^|\/)auth-profiles\.json$/i },
    { type: 'Codex auth config', pattern: /(^|\/)\.codex\/(auth|credentials)\.(json|toml)$/i },
    { type: 'Claude local settings', pattern: /(^|\/)\.claude\/settings\.local\.json$/i },
  ];

  for (const file of files) {
    const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const fileName = file.name.toLowerCase();
    const lowerPath = relativePath.toLowerCase();

    const pathRisk = sensitivePathPatterns.find(({ pattern }) => pattern.test(lowerPath));
    if (pathRisk) {
      sensitiveFiles.push({ path: relativePath, type: pathRisk.type });
      continue;
    }

    const ext = fileName.split('.').pop()?.toLowerCase();
    if (
      file.size < 100 * 1024 &&
      ['ts', 'tsx', 'js', 'jsx', 'json', 'txt', 'md', 'yml', 'yaml', 'toml', 'ini', 'conf'].includes(ext || '')
    ) {
      try {
        const content = await file.text();
        for (const { name, pattern } of SENSITIVE_PATTERNS) {
          if (pattern.test(content)) {
            sensitiveFiles.push({ path: relativePath, type: `May contain ${name}` });
            pattern.lastIndex = 0;
            break;
          }
        }
      } catch {
        // ignore read errors
      }
    }
  }

  return sensitiveFiles;
}

function DesktopLocalAgentUpload({
  bridge,
}: {
  bridge: OpenClawDesktopBridge;
}) {
  const router = useRouter();
  const didAutoScanRef = useRef(false);
  const [agents, setAgents] = useState<DesktopAgentCandidate[]>([]);
  const [scanSummary, setScanSummary] = useState('准备扫描');
  const [scanLimitReached, setScanLimitReached] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<DesktopAgentCandidate | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<DesktopFolderPayload | null>(null);
  const [isScanningLocal, setIsScanningLocal] = useState(false);
  const [isReadingFolder, setIsReadingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lobsterName, setLobsterName] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [setupPanelOpen, setSetupPanelOpen] = useState(false);
  const [publishToMarket, setPublishToMarket] = useState(false);
  const [showSensitiveWarning, setShowSensitiveWarning] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedAgentType, setSelectedAgentType] = useState<AgentPlatformType | null>(null);
  const [forceManualType, setForceManualType] = useState(false);

  const hasSelection = Boolean(selectedAgent && selectedFolder);
  const autoDetectedType =
    !forceManualType && detection?.confidence === 'high' && detection.detected !== 'unknown'
      ? detection.detected
      : null;
  const effectiveAgentType = selectedAgentType || autoDetectedType || null;
  const showTypePicker =
    hasSelection &&
    (forceManualType || !effectiveAgentType || detection?.confidence !== 'high');
  const sensitiveFiles: SensitiveFile[] = (selectedFolder?.skippedSamples || []).map((file) => ({
    path: file.path,
    type: file.reason,
  }));

  const resetSelectedAgent = useCallback(() => {
    setSelectedAgent(null);
    setSelectedFolder(null);
    setLobsterName('');
    setDetection(null);
    setSelectedAgentType(null);
    setForceManualType(false);
    setSetupPanelOpen(false);
    setShowSensitiveWarning(false);
    setSuccessMessage('');
  }, []);

  const scanLocalAgents = useCallback(async () => {
    setIsScanningLocal(true);
    setError('');
    resetSelectedAgent();
    setScanSummary('正在扫描本地 Agent...');
    try {
      const result = await bridge.scanLocalAgents();
      setAgents(result.agents);
      setScanLimitReached(result.scanLimitReached);
      setScanSummary(`扫描 ${result.scannedDirs} 个目录，发现 ${result.agents.length} 个 Agent`);
      if (result.scanLimitReached) {
        setError('扫描达到目录上限，结果可能不完整。');
      }
    } catch (scanError) {
      setAgents([]);
      setScanSummary('扫描失败');
      setError(scanError instanceof Error ? scanError.message : '扫描本地 Agent 失败。');
    } finally {
      setIsScanningLocal(false);
    }
  }, [bridge, resetSelectedAgent]);

  useEffect(() => {
    if (didAutoScanRef.current) return;
    didAutoScanRef.current = true;
    void scanLocalAgents();
  }, [scanLocalAgents]);

  const selectAgent = async (agent: DesktopAgentCandidate) => {
    setSelectedAgent(agent);
    setSelectedFolder(null);
    setError('');
    setSuccessMessage('');
    setSetupPanelOpen(false);
    setForceManualType(false);
    setShowSensitiveWarning(false);
    setLobsterName(agent.name || 'local-agent');

    const initialDetection = buildDesktopDetection(agent);
    setDetection(initialDetection);
    setSelectedAgentType(
      initialDetection?.confidence === 'high' && initialDetection.detected !== 'unknown'
        ? initialDetection.detected
        : null
    );

    setIsReadingFolder(true);
    try {
      const folder = await bridge.readLocalAgentFolder(agent.path);
      const folderType = normalizeDesktopAgentType(folder.agentType);
      const finalDetection: DetectionResult =
        folderType && folderType !== 'unknown'
          ? {
              detected: folderType,
              confidence: agent.confidence,
              scores: agent.scores || { [folderType]: agent.confidence === 'high' ? 100 : 3 },
              reason: agent.reason,
            }
          : initialDetection || { detected: null, confidence: 'none', scores: {} };

      setSelectedFolder(folder);
      setDetection(finalDetection);
      setSelectedAgentType(
        finalDetection.confidence === 'high' && finalDetection.detected !== 'unknown'
          ? finalDetection.detected
          : null
      );
      setShowSensitiveWarning(publishToMarket && folder.skippedCount > 0);
      setSetupPanelOpen(true);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : '读取本地 Agent 文件夹失败。');
    } finally {
      setIsReadingFolder(false);
    }
  };

  const handlePublishToggle = (checked: boolean) => {
    setPublishToMarket(checked);
    setShowSensitiveWarning(checked && (selectedFolder?.skippedCount || 0) > 0);
  };

  const handleUpload = async (setup?: UploadSetupPayload) => {
    if (isUploading || isReadingFolder || isScanningLocal) return;
    if (!selectedFolder || !selectedAgent) {
      setError('请先选择一个本地 Agent。');
      return;
    }
    if (!lobsterName.trim()) {
      setError('请填写 Agent 名称。');
      return;
    }
    if (!effectiveAgentType) {
      setError('请选择 Agent 平台类型。');
      return;
    }
    if (!bridge.importLocalAgent) {
      setError('当前桌面桥暂不支持本地 Agent 导入。');
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccessMessage('');
    setUploadProgress(15);

    try {
      const result = await bridge.importLocalAgent({
        rootPath: selectedFolder.rootPath,
        name: lobsterName.trim(),
        agentType: effectiveAgentType,
        description: setup?.description,
        avatar: setup?.avatar,
      });

      setUploadProgress(90);
      if (!result.success) {
        throw new Error('本地 Agent 导入失败。');
      }

      setUploadProgress(100);
      setSuccessMessage('本地 Agent 已导入。');
      setSetupPanelOpen(false);
      router.push('/my-den');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '导入失败，请重试。');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl pb-16"
    >
      <BackButton href="/" />

      <div
        className="mt-6 border-4 border-pixel-black bg-pixel-white p-6"
        style={{ boxShadow: '8px 8px 0px 0px #101010' }}
      >
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-pixel text-3xl text-pixel-black">导入 Agent</h1>
            <p className="mt-2 font-pixel text-sm text-pixel-black/60">
              {scanSummary}
            </p>
          </div>
          <PixelButton
            onClick={() => void scanLocalAgents()}
            disabled={isScanningLocal || isUploading}
            variant="primary"
            size="sm"
          >
            {isScanningLocal ? '扫描中...' : '重新扫描'}
          </PixelButton>
        </div>

        {error && (
          <div className="mb-6 border-4 border-pixel-red bg-pixel-red/10 p-3">
            <p className="font-pixel text-sm text-pixel-red">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 border-4 border-pixel-green bg-pixel-green/10 p-3">
            <p className="font-pixel text-sm text-pixel-green">{successMessage}</p>
          </div>
        )}

        {scanLimitReached && !error && (
          <div className="mb-6 border-4 border-pixel-yellow bg-pixel-yellow/20 p-3">
            <p className="font-pixel text-sm text-pixel-black">
              扫描达到目录上限，结果可能不完整。
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((agent) => {
            const selected = selectedAgent?.path === agent.path;
            return (
              <button
                key={agent.path}
                type="button"
                onClick={() => void selectAgent(agent)}
                disabled={isReadingFolder || isUploading}
                className={`min-h-[150px] border-4 border-pixel-black p-4 text-left transition-colors ${
                  selected ? 'bg-pixel-green/15' : 'bg-pixel-white hover:bg-pixel-yellow/20'
                } disabled:opacity-60`}
                style={{ boxShadow: selected ? '4px 4px 0 #101010' : '3px 3px 0 #101010' }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-pixel text-xs text-pixel-blue">
                    {getAgentTypeLabel(agent.type)} · {agent.confidence === 'high' ? '高置信' : '待确认'}
                  </span>
                  {selected && isReadingFolder && (
                    <span className="font-pixel text-xs text-pixel-black/60">读取中...</span>
                  )}
                </div>
                <p className="truncate font-pixel text-lg text-pixel-black">{agent.name}</p>
                <p className="mt-2 line-clamp-2 font-pixel text-xs text-pixel-black/55">{agent.reason}</p>
                <p className="mt-3 truncate font-mono text-[11px] text-pixel-black/45">{agent.path}</p>
              </button>
            );
          })}
        </div>

        {!isScanningLocal && agents.length === 0 && (
          <div className="border-4 border-dashed border-pixel-black p-8 text-center">
            <p className="font-pixel text-sm text-pixel-black/60">
              没有发现可导入的本地 Agent。
            </p>
          </div>
        )}

        {selectedAgent && selectedFolder && (
          <div
            className="mt-6 border-4 border-pixel-black bg-pixel-cream/50 p-4"
            style={{ boxShadow: '4px 4px 0 #101010' }}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-pixel text-sm font-bold text-pixel-black">
                  {selectedAgent.name} · {selectedFolder.fileCount} 个文件 · {(selectedFolder.totalBytes / 1024).toFixed(1)} KB
                </p>
                <p className="mt-1 truncate font-mono text-xs text-pixel-black/45">
                  {selectedFolder.rootPath}
                </p>
                {selectedFolder.skippedCount > 0 && (
                  <p className="mt-2 font-pixel text-xs text-pixel-black/60">
                    已过滤 {selectedFolder.skippedCount} 个敏感配置或运行态条目。
                  </p>
                )}
              </div>
              <PixelButton
                onClick={() => setSetupPanelOpen(true)}
                disabled={isUploading}
                variant="primary"
                size="sm"
              >
                设置介绍和头像
              </PixelButton>
            </div>
          </div>
        )}
      </div>

      {isUploading && (
        <div className="mt-4 h-4 border-2 border-pixel-black bg-pixel-black">
          <motion.div className="h-full bg-pixel-green" animate={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      <UploadAgentSetupDialog
        key={`${selectedFolder?.rootPath || 'desktop'}-${selectedAgent?.path || ''}`}
        open={setupPanelOpen && hasSelection}
        uploadMode="folder"
        selectedLabel={selectedAgent?.name || ''}
        agentName={lobsterName}
        onAgentNameChange={setLobsterName}
        detection={detection}
        selectedAgentType={selectedAgentType}
        onSelectedAgentTypeChange={setSelectedAgentType}
        effectiveAgentType={effectiveAgentType}
        forceManualType={forceManualType}
        onForceManualTypeChange={setForceManualType}
        showTypePicker={showTypePicker}
        isDetecting={isReadingFolder}
        marketPublishEnabled={false}
        publishToMarket={publishToMarket}
        onPublishToMarketChange={handlePublishToggle}
        isScanning={isReadingFolder}
        sensitiveFiles={sensitiveFiles}
        showSensitiveWarning={showSensitiveWarning}
        hasBlockingMarketRisks={false}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        error={error}
        submitLabel="完成设置并导入本地 Agent"
        uploadingLabel="导入中"
        onClose={() => setSetupPanelOpen(false)}
        onSubmit={(payload) => void handleUpload(payload)}
      />
    </motion.div>
  );
}

function WebUploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const cozeOnly = searchParams.get('mode') === 'coze';

  const [uploadMode, setUploadMode] = useState<UploadMode>(() => (cozeOnly ? 'coze' : 'folder'));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderFiles, setSelectedFolderFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lobsterName, setLobsterName] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [setupPanelOpen, setSetupPanelOpen] = useState(false);

  const [publishToMarket, setPublishToMarket] = useState(false);
  const [sensitiveFiles, setSensitiveFiles] = useState<SensitiveFile[]>([]);
  const [showSensitiveWarning, setShowSensitiveWarning] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedAgentType, setSelectedAgentType] = useState<AgentPlatformType | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [forceManualType, setForceManualType] = useState(false);

  const fileUploadMode: FileUploadMode | null =
    uploadMode === 'folder' || uploadMode === 'zip' ? uploadMode : null;
  const isFileUploadMode = fileUploadMode !== null;
  const hasSelection = uploadMode === 'folder'
    ? selectedFolderFiles.length > 0
    : uploadMode === 'zip'
      ? !!selectedFile
      : false;
  const totalFolderSize = selectedFolderFiles.reduce((sum, file) => sum + file.size, 0);

  const resetTypeState = useCallback(() => {
    setDetection(null);
    setSelectedAgentType(null);
    setForceManualType(false);
  }, []);

  const resetSetupLaunchState = useCallback(() => {
    setSetupPanelOpen(false);
    setSuccessMessage('');
  }, []);

  const resetSelectionState = useCallback(() => {
    setSelectedFile(null);
    setSelectedFolderFiles([]);
    setFolderName('');
    setError('');
    setSensitiveFiles([]);
    setShowSensitiveWarning(false);
    resetTypeState();
    resetSetupLaunchState();
  }, [resetSetupLaunchState, resetTypeState]);

  useEffect(() => {
    if (!cozeOnly || uploadMode === 'coze') return;
    setUploadMode('coze');
    resetSelectionState();
  }, [cozeOnly, resetSelectionState, uploadMode]);

  const effectiveAgentType: AgentPlatformType | null =
    selectedAgentType ||
    (!forceManualType && detection?.confidence === 'high' ? detection.detected : null);

  const showTypePicker =
    hasSelection &&
    (forceManualType ||
      uploadMode === 'zip' ||
      (isDetecting === false && (detection?.confidence !== 'high' || !effectiveAgentType)));

  const hasMarketSanitizationNotice = publishToMarket && sensitiveFiles.length > 0;

  const runDetection = useCallback(async (files: File[]) => {
    setIsDetecting(true);
    try {
      const result = await detectAgentTypeFromFiles(files);
      setDetection(result);
      if (result.confidence === 'high' && result.detected) {
        setSelectedAgentType(result.detected);
      } else {
        setSelectedAgentType(null);
      }
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const handleZipSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('zip 模式只支持 .zip 文件。');
      return;
    }

    setSelectedFile(file);
    setSelectedFolderFiles([]);
    setError('');
    setSuccessMessage('');
    setSensitiveFiles([]);
    setShowSensitiveWarning(false);
    resetTypeState();
    resetSetupLaunchState();
    setDetection({ detected: null, confidence: 'none', scores: {} });

    setLobsterName(file.name.replace(/\.[^/.]+$/, ''));
    setSetupPanelOpen(true);
  };

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setSelectedFolderFiles(files);
    setSelectedFile(null);
    setError('');
    setSuccessMessage('');
    setSensitiveFiles([]);
    setShowSensitiveWarning(false);
    resetTypeState();
    resetSetupLaunchState();

    const firstPath = files[0].webkitRelativePath || files[0].name;
    const rootFolder = firstPath.split('/')[0] || 'my-agent';
    setFolderName(rootFolder);

    setLobsterName(rootFolder);

    setSetupPanelOpen(true);
    await runDetection(files);

    if (publishToMarket) {
      setIsScanning(true);
      const sensitive = await scanForSensitiveInfo(files);
      setSensitiveFiles(sensitive);
      setShowSensitiveWarning(sensitive.length > 0);
      setIsScanning(false);
    }
  };

  const handlePublishToggle = async (checked: boolean) => {
    setPublishToMarket(checked);

    if (checked && selectedFolderFiles.length > 0) {
      setIsScanning(true);
      const sensitive = await scanForSensitiveInfo(selectedFolderFiles);
      setSensitiveFiles(sensitive);
      setShowSensitiveWarning(sensitive.length > 0);
      setIsScanning(false);
      return;
    }

    setSensitiveFiles([]);
    setShowSensitiveWarning(false);
  };

  const handleUpload = async (setup?: UploadSetupPayload) => {
    if (isUploading || isDetecting || isScanning) return;
    if (uploadMode === 'coze') return;
    if (!lobsterName.trim()) {
      setError('请填写 Agent 名称。');
      return;
    }
    if (uploadMode === 'folder' && selectedFolderFiles.length === 0) {
      setError('请选择要上传的文件夹。');
      return;
    }
    if (uploadMode === 'zip' && !selectedFile) {
      setError('请选择要上传的 zip 文件。');
      return;
    }

    if (!effectiveAgentType) {
      setError('请选择 Agent 平台类型。');
      return;
    }
    if (!token) {
      setError('请先登录。');
      return;
    }
    setIsUploading(true);
    setError('');
    setSuccessMessage('');
    setUploadProgress(0);

    try {
      let body: Record<string, unknown>;

      if (uploadMode === 'folder') {
        setUploadProgress(10);
        const files: { path: string; content: string }[] = [];

        for (let index = 0; index < selectedFolderFiles.length; index += 1) {
          const file = selectedFolderFiles[index];
          files.push({
            path: file.webkitRelativePath || file.name,
            content: await fileToBase64(file),
          });
          setUploadProgress(10 + Math.floor((index / selectedFolderFiles.length) * 50));
        }

        body = {
          uploadType: 'folder',
          name: lobsterName.trim(),
          agentType: effectiveAgentType,
          files,
          publishToMarket,
          deferMarketPublish: false,
          description: setup?.description,
          avatar: setup?.avatar,
        };
      } else {
        body = {
          uploadType: 'zip',
          name: lobsterName.trim(),
          agentType: effectiveAgentType,
          file: await fileToBase64(selectedFile!),
          fileName: selectedFile!.name,
          publishToMarket,
          deferMarketPublish: false,
          description: setup?.description,
          avatar: setup?.avatar,
        };
        setUploadProgress(40);
      }

      setUploadProgress(70);

      const response = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      setUploadProgress(90);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || '上传失败。');
      }

      setUploadProgress(100);

      const nextPath = data.agentId ? `/agent/${data.agentId}` : '/my-den';

      if (data.agentId) {
        setSuccessMessage('上传完成。');
        setSetupPanelOpen(false);
      }
      router.push(nextPath);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败，请重试。');
    } finally {
      setIsUploading(false);
    }
  };

  const setupButtonLabel = 'Agent形象设置';
  const setupButtonDisabled = !hasSelection || isUploading;
  const handleSetupButtonClick = () => {
    if (setupButtonDisabled) return;
    setSetupPanelOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mx-auto pb-16 ${uploadMode === 'coze' ? 'max-w-5xl' : 'max-w-2xl'}`}
    >
      <BackButton href="/" />

      <div
        className="mt-6 border-4 border-pixel-black bg-pixel-white p-6"
        style={{ boxShadow: '8px 8px 0px 0px #101010' }}
      >
        <h1 className="mb-2 text-center font-pixel text-3xl text-pixel-black">
          {cozeOnly ? '跨次元召唤' : '上传 Agent'}
        </h1>
        <p className="mb-6 text-center font-pixel text-sm text-pixel-black/60">
          {cozeOnly
            ? '从 Coze 等平台接入 API Agent，召唤后即可在平台中使用。'
            : '选择文件夹或 zip 包后会先打开 Agent 形象设置，完成设置后再上传到后端。'}
        </p>

        {!cozeOnly && (
          <motion.div className="mb-6 flex gap-2">
            {(['folder', 'zip', 'coze'] as UploadMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setUploadMode(mode);
                  resetSelectionState();
                }}
                disabled={isUploading}
                className={`flex-1 border-4 border-pixel-black py-2 font-pixel text-sm ${
                  uploadMode === mode
                    ? mode === 'folder'
                      ? 'bg-pixel-green text-pixel-white'
                      : mode === 'zip'
                        ? 'bg-pixel-blue text-pixel-white'
                        : 'bg-pixel-yellow text-pixel-black'
                    : 'bg-pixel-white text-pixel-black'
                }`}
                style={{ boxShadow: '3px 3px 0 #101010' }}
              >
                {mode === 'folder' ? '上传文件夹' : mode === 'zip' ? '上传 zip' : '跨次元召唤'}
              </button>
            ))}
          </motion.div>
        )}

        {error && (
          <div className="mb-6 border-4 border-pixel-red bg-pixel-red/10 p-3">
            <p className="font-pixel text-sm text-pixel-red">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 border-4 border-pixel-green bg-pixel-green/10 p-3">
            <p className="font-pixel text-sm text-pixel-green">{successMessage}</p>
          </div>
        )}

        {uploadMode === 'coze' ? (
          <CozeSummonTab token={token} />
        ) : (
          <div
            className={`mb-6 cursor-pointer border-4 border-dashed p-8 text-center ${
              hasSelection ? 'border-pixel-green bg-pixel-green/10' : 'border-pixel-black'
            } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => {
              if (isUploading) return;
              (uploadMode === 'folder' ? folderInputRef : fileInputRef).current?.click();
            }}
          >
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleZipSelect}
              className="hidden"
            />

            {uploadMode === 'folder' ? (
              selectedFolderFiles.length > 0 ? (
                <div>
                  <motion.div
                    className="mb-3 flex justify-center"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <UploadGlyph mode="folder" selected />
                  </motion.div>
                  <p className="font-pixel text-lg text-pixel-black">{folderName}</p>
                  <p className="mt-2 font-pixel text-sm text-pixel-black/60">
                    {selectedFolderFiles.length} 个文件 · {(totalFolderSize / 1024).toFixed(1)} KB · 点击更换文件夹
                  </p>
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex justify-center">
                    <UploadGlyph mode="folder" />
                  </div>
                  <p className="mb-1 font-pixel font-bold text-pixel-black">点击选择文件夹</p>
                  <p className="font-pixel text-sm text-pixel-black/60">
                    支持 Claude Code / Codex / OpenCode / OpenClaw / Hermes 工作区
                  </p>
                </div>
              )
            ) : selectedFile ? (
              <div>
                <motion.div
                  className="mb-3 flex justify-center"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <UploadGlyph mode="zip" selected />
                </motion.div>
                <p className="font-pixel text-lg text-pixel-black">{selectedFile.name}</p>
                <p className="mt-2 font-pixel text-sm text-pixel-black/60">
                  {(selectedFile.size / 1024).toFixed(1)} KB · 点击更换文件
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex justify-center">
                  <UploadGlyph mode="zip" />
                </div>
                <p className="mb-1 font-pixel font-bold text-pixel-black">点击选择 zip</p>
                <p className="font-pixel text-sm text-pixel-black/60">
                  支持 .zip 格式
                </p>
              </div>
            )}
          </div>
        )}

        {hasSelection && (
          <div
            className="mb-6 border-4 border-pixel-black bg-pixel-white/80 p-4"
            style={{ boxShadow: '4px 4px 0 #101010' }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-pixel text-sm font-bold text-pixel-black">Agent形象设置</p>
                <p className="mt-1 font-pixel text-xs text-pixel-black/60">
                  选择文件后会自动打开。关闭后，也可以点击右侧按钮继续设置。
                </p>
              </div>
              <button
                type="button"
                onClick={handleSetupButtonClick}
                disabled={setupButtonDisabled}
                aria-label="打开 Agent 形象设置"
                className={`border-4 border-pixel-black px-4 py-2 font-pixel text-xs ${
                  setupButtonDisabled
                    ? 'bg-pixel-black/10 text-pixel-black/50'
                    : 'bg-pixel-yellow text-pixel-black hover:bg-pixel-orange'
                }`}
                style={{ boxShadow: '3px 3px 0 #101010' }}
              >
                {setupButtonLabel}
              </button>
            </div>
          </div>
        )}

        {hasSelection && (
          <div
            className="mb-6 border-4 border-pixel-black bg-pixel-white/80 p-4"
            style={{ boxShadow: '4px 4px 0 #101010' }}
          >
            <p className="mb-3 font-pixel text-sm font-bold text-pixel-black">Agent 平台类型</p>

            {isDetecting ? (
              <p className="font-pixel text-xs text-pixel-black/60">正在识别工作区类型...</p>
            ) : effectiveAgentType && !forceManualType ? (
              <motion.div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-pixel text-sm text-pixel-green">
                  已识别：{getAgentTypeLabel(effectiveAgentType)}
                  {detection?.confidence === 'high' && !selectedAgentType ? '（自动）' : ''}
                </span>
                <button
                  type="button"
                  className="font-pixel text-xs text-pixel-blue underline"
                  onClick={() => {
                    setForceManualType(true);
                    setSelectedAgentType(null);
                  }}
                >
                  更改
                </button>
              </motion.div>
            ) : (
              <p className="mb-3 font-pixel text-xs text-pixel-black/60">
                {detection?.confidence === 'low' && detection.detected
                  ? `疑似 ${getAgentTypeLabel(detection.detected)}，请确认类型。`
                  : uploadMode === 'zip'
                    ? 'zip 包无法可靠自动识别，请手动选择平台类型。'
                    : '未能自动锁定平台类型，请手动选择。'}
              </p>
            )}

            {showTypePicker && !isDetecting && (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {AGENT_TYPE_OPTIONS.map((option) => {
                  const isSelected =
                    selectedAgentType === option.id ||
                    (!selectedAgentType && detection?.detected === option.id && detection.confidence === 'low');

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedAgentType(option.id)}
                      className={`border-4 border-pixel-black px-2 py-2 font-pixel text-xs ${
                        isSelected ? 'bg-pixel-yellow text-pixel-black' : 'bg-pixel-white text-pixel-black hover:bg-pixel-gray/30'
                      }`}
                      style={{ boxShadow: isSelected ? '3px 3px 0 #101010' : '2px 2px 0 #101010' }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {hasSelection && (
          <div
            className="mb-6 border-4 border-pixel-black bg-pixel-cream/50 p-4"
            style={{ boxShadow: '4px 4px 0 #101010' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-pixel text-sm font-bold text-pixel-black">发布到 Agent 市场</p>
                <p className="mt-1 font-pixel text-xs text-pixel-black/60">
                  公开你的 Agent，让其他用户可以发现并使用。市场副本会自动跳过或脱敏敏感配置。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handlePublishToggle(!publishToMarket)}
                disabled={isUploading || isScanning}
                className={`relative h-7 w-14 border-4 border-pixel-black transition-colors ${
                  publishToMarket ? 'bg-pixel-green' : 'bg-pixel-black/20'
                }`}
                style={{ boxShadow: '2px 2px 0 #101010' }}
              >
                <motion.div
                  className="absolute top-0 h-5 w-5 border-2 border-pixel-black bg-pixel-white"
                  animate={{ left: publishToMarket ? 28 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  style={{ top: '50%', transform: 'translateY(-50%)' }}
                />
              </button>
            </div>

            {isScanning && (
              <div className="mt-3 flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-pixel-black border-t-transparent" />
                <span className="font-pixel text-xs text-pixel-black/60">正在扫描敏感文件...</span>
              </div>
            )}

            {showSensitiveWarning && sensitiveFiles.length > 0 && publishToMarket && !isScanning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 border-4 border-pixel-yellow bg-pixel-yellow/20 p-3"
              >
                <p className="font-pixel text-sm font-bold text-pixel-black">检测到可能包含敏感信息的文件</p>
                <p className="mt-1 font-pixel text-xs text-pixel-black/70">
                  上架时会只处理市场副本：敏感路径会跳过，疑似密钥内容会替换为脱敏占位，不会删除你的本地 Agent 文件。
                </p>
                <ul className="mt-2 space-y-1">
                  {sensitiveFiles.slice(0, 5).map((file) => (
                    <li key={`${file.path}-${file.type}`} className="font-mono text-xs text-pixel-black/80">
                      - {file.path} ({file.type})
                    </li>
                  ))}
                  {sensitiveFiles.length > 5 && (
                    <li className="font-pixel text-xs text-pixel-black/60">
                      ...还有 {sensitiveFiles.length - 5} 个文件
                    </li>
                  )}
                </ul>
              </motion.div>
            )}

            {publishToMarket && uploadMode === 'zip' && !isScanning && (
              <div className="mt-4 border-4 border-pixel-blue bg-pixel-blue/10 p-3">
                <p className="font-pixel text-xs text-pixel-black/70">
                  zip 包会在后端解压后继续做安全处理；市场副本会自动跳过或脱敏高风险内容。
                </p>
              </div>
            )}
          </div>
        )}

        {isFileUploadMode && (
          <PixelButton
            onClick={() => setSetupPanelOpen(true)}
            disabled={!hasSelection || isUploading}
            variant="primary"
            size="lg"
            className="w-full"
          >
            {isUploading ? `上传中... ${uploadProgress}%` : '打开 Agent 形象设置'}
          </PixelButton>
        )}
      </div>

      {isUploading && (
        <div className="mt-4 h-4 border-2 border-pixel-black bg-pixel-black">
          <motion.div className="h-full bg-pixel-green" animate={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {isFileUploadMode && (
        <UploadAgentSetupDialog
          key={`${fileUploadMode}-${folderName}-${selectedFile?.name || ''}`}
          open={setupPanelOpen && hasSelection}
          uploadMode={fileUploadMode}
          selectedLabel={uploadMode === 'folder' ? folderName : selectedFile?.name || ''}
          agentName={lobsterName}
          onAgentNameChange={setLobsterName}
          detection={detection}
          selectedAgentType={selectedAgentType}
          onSelectedAgentTypeChange={setSelectedAgentType}
          effectiveAgentType={effectiveAgentType}
          forceManualType={forceManualType}
          onForceManualTypeChange={setForceManualType}
          showTypePicker={showTypePicker}
          isDetecting={isDetecting}
          publishToMarket={publishToMarket}
          onPublishToMarketChange={(value) => void handlePublishToggle(value)}
          isScanning={isScanning}
          sensitiveFiles={sensitiveFiles}
          showSensitiveWarning={showSensitiveWarning}
          hasBlockingMarketRisks={hasMarketSanitizationNotice}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          error={error}
          onClose={() => setSetupPanelOpen(false)}
          onSubmit={(payload) => void handleUpload(payload)}
        />
      )}
    </motion.div>
  );
}

export default function UploadPage() {
  const [desktopBridge, setDesktopBridge] = useState<OpenClawDesktopBridge | null>(() => getOpenClawDesktop());

  useEffect(() => {
    setDesktopBridge(getOpenClawDesktop());
  }, []);

  if (desktopBridge) {
    return <DesktopLocalAgentUpload bridge={desktopBridge} />;
  }

  return (
    <Suspense fallback={<div className="p-8 text-center font-pixel text-pixel-black/50">加载中...</div>}>
      <WebUploadPage />
    </Suspense>
  );
}
