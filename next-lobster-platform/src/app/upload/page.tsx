'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { BackButton } from '@/components/ui/BackButton';
import { useAuthStore } from '@/store/useAuthStore';
import {
  AGENT_TYPE_OPTIONS,
  detectAgentTypeFromFiles,
  getAgentTypeLabel,
  type AgentPlatformType,
  type DetectionResult,
} from '@/lib/agentTypeDetect';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type UploadMode = 'folder' | 'zip';

// Sensitive patterns to detect API keys, tokens, etc.
// Only include high-specificity patterns to avoid false positives
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

// Scan files for sensitive information
async function scanForSensitiveInfo(files: File[]): Promise<SensitiveFile[]> {
  const sensitiveFiles: SensitiveFile[] = [];
  const sensitiveFileNames = [
    '.env',
  ];

  for (const file of files) {
    // Check filename first
    const fileName = file.name.toLowerCase();
    if (sensitiveFileNames.some(name => fileName.includes(name.toLowerCase()))) {
      sensitiveFiles.push({ path: file.webkitRelativePath || file.name, type: '文件名包含敏感关键词' });
      continue;
    }

    // Check file extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['env', 'pem', 'key', 'pkcs8'].includes(ext || '')) {
      sensitiveFiles.push({ path: file.webkitRelativePath || file.name, type: '敏感文件类型' });
      continue;
    }

    // For smaller text files, scan content
    if (file.size < 100 * 1024 && ['ts', 'tsx', 'js', 'jsx', 'json', 'txt', 'md', 'yml', 'yaml', 'toml', 'ini', 'conf'].includes(ext || '')) {
      try {
        const content = await file.text();
        for (const { name, pattern } of SENSITIVE_PATTERNS) {
          if (pattern.test(content)) {
            sensitiveFiles.push({ path: file.webkitRelativePath || file.name, type: `可能包含 ${name}` });
            pattern.lastIndex = 0; // Reset regex
            break;
          }
        }
      } catch {
        // Skip files that can't be read as text
      }
    }
  }

  return sensitiveFiles;
}

export default function UploadPage() {
  const router = useRouter();
  const { token } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [uploadMode, setUploadMode] = useState<UploadMode>('folder');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderFiles, setSelectedFolderFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lobsterName, setLobsterName] = useState('');
  const [error, setError] = useState('');

  // New: publish to market toggle
  const [publishToMarket, setPublishToMarket] = useState(false);
  const [sensitiveFiles, setSensitiveFiles] = useState<SensitiveFile[]>([]);
  const [showSensitiveWarning, setShowSensitiveWarning] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedAgentType, setSelectedAgentType] = useState<AgentPlatformType | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [forceManualType, setForceManualType] = useState(false);

  const hasSelection =
    uploadMode === 'folder' ? selectedFolderFiles.length > 0 : !!selectedFile;

  const totalFolderSize = selectedFolderFiles.reduce((sum, f) => sum + f.size, 0);

  const resetTypeState = () => {
    setDetection(null);
    setSelectedAgentType(null);
    setForceManualType(false);
  };

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

  const handleZipSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
      setError('zip 模式只支持 .zip 文件');
      return;
    }
    setSelectedFile(file);
    setSelectedFolderFiles([]);
    setError('');
    setSensitiveFiles([]);
    setShowSensitiveWarning(false);
    resetTypeState();
    setDetection({ detected: null, confidence: 'none', scores: {} });
    if (!lobsterName) {
      setLobsterName(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setSelectedFolderFiles(files);
    setSelectedFile(null);
    setError('');
    setSensitiveFiles([]);
    setShowSensitiveWarning(false);
    resetTypeState();

    const firstPath = files[0].webkitRelativePath || files[0].name;
    const rootFolder = firstPath.split('/')[0] || 'my-agent';
    setFolderName(rootFolder);
    if (!lobsterName) {
      setLobsterName(rootFolder);
    }

    await runDetection(files);

    // Scan for sensitive information when publishing to market
    if (publishToMarket) {
      setIsScanning(true);
      const sensitive = await scanForSensitiveInfo(files);
      setSensitiveFiles(sensitive);
      if (sensitive.length > 0) {
        setShowSensitiveWarning(true);
      }
      setIsScanning(false);
    }
  };

  // Scan when publish toggle changes
  const handlePublishToggle = async (checked: boolean) => {
    setPublishToMarket(checked);
    if (checked && selectedFolderFiles.length > 0) {
      setIsScanning(true);
      const sensitive = await scanForSensitiveInfo(selectedFolderFiles);
      setSensitiveFiles(sensitive);
      if (sensitive.length > 0) {
        setShowSensitiveWarning(true);
      }
      setIsScanning(false);
    } else {
      setSensitiveFiles([]);
      setShowSensitiveWarning(false);
    }
  };

  const effectiveAgentType: AgentPlatformType | null =
    selectedAgentType ||
    (!forceManualType && detection?.confidence === 'high' ? detection.detected : null);

  const showTypePicker =
    hasSelection &&
    (forceManualType ||
      uploadMode === 'zip' ||
      (isDetecting === false &&
        (detection?.confidence !== 'high' || !effectiveAgentType)));

  const handleUpload = async () => {
    if (!lobsterName.trim()) return;
    if (uploadMode === 'folder' && selectedFolderFiles.length === 0) return;
    if (uploadMode === 'zip' && !selectedFile) return;
    if (!effectiveAgentType) {
      setError('请选择 Agent 平台类型');
      return;
    }
    if (!token) {
      setError('请先登录');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      let body: Record<string, unknown>;

      if (uploadMode === 'folder') {
        setUploadProgress(10);
        const files: { path: string; content: string }[] = [];
        for (let i = 0; i < selectedFolderFiles.length; i++) {
          const f = selectedFolderFiles[i];
          files.push({
            path: f.webkitRelativePath || f.name,
            content: await fileToBase64(f),
          });
          setUploadProgress(10 + Math.floor((i / selectedFolderFiles.length) * 50));
        }
        body = {
          uploadType: 'folder',
          name: lobsterName.trim(),
          agentType: effectiveAgentType,
          files,
          publishToMarket,
        };
      } else {
        body = {
          uploadType: 'zip',
          name: lobsterName.trim(),
          agentType: effectiveAgentType,
          file: await fileToBase64(selectedFile!),
          fileName: selectedFile!.name,
          publishToMarket,
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
      if (!response.ok) throw new Error(data.message || '上传失败');

      setUploadProgress(100);
      setTimeout(() => router.push('/my-den'), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败，请重试');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto pb-16"
    >
      <BackButton href="/" />

      <div
        className="bg-pixel-white border-4 border-pixel-black p-6 mt-6"
        style={{ boxShadow: '8px 8px 0px 0px #101010' }}
      >
        <h1 className="font-pixel text-3xl text-pixel-black text-center mb-2">上传 Agent</h1>
        <p className="font-pixel text-sm text-pixel-black/60 text-center mb-6">
          支持文件夹上传，自动识别 Claude Code / Codex / OpenCode / OpenClaw / Hermes
        </p>

        <motion.div className="flex gap-2 mb-6">
          {(['folder', 'zip'] as UploadMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setUploadMode(mode);
                setSelectedFile(null);
                setSelectedFolderFiles([]);
                setSensitiveFiles([]);
                setShowSensitiveWarning(false);
                resetTypeState();
                setError('');
              }}
              disabled={isUploading}
              className={`flex-1 py-2 font-pixel text-sm border-4 border-pixel-black ${
                uploadMode === mode
                  ? mode === 'folder'
                    ? 'bg-pixel-green text-pixel-white'
                    : 'bg-pixel-blue text-pixel-white'
                  : 'bg-pixel-white text-pixel-black'
              }`}
              style={{ boxShadow: '3px 3px 0 #101010' }}
            >
              {mode === 'folder' ? '📁 上传文件夹' : '📦 上传 zip'}
            </button>
          ))}
        </motion.div>

        {error && (
          <div className="bg-pixel-red/10 border-4 border-pixel-red p-3 mb-6">
            <p className="font-pixel text-pixel-red text-sm">{error}</p>
          </div>
        )}

        <div
          className={`border-4 border-dashed cursor-pointer p-8 text-center mb-6 ${
            hasSelection ? 'border-pixel-green bg-pixel-green/10' : 'border-pixel-black'
          } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
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
          <input ref={fileInputRef} type="file" accept=".zip" onChange={handleZipSelect} className="hidden" />

          {uploadMode === 'folder' ? (
            selectedFolderFiles.length > 0 ? (
              <div>
                <div className="text-5xl mb-3">📁</div>
                <p className="font-pixel text-lg">{folderName}</p>
                <p className="font-pixel text-sm text-pixel-black/60 mt-2">
                  {selectedFolderFiles.length} 个文件 · {(totalFolderSize / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <div className="text-5xl mb-4">📁</div>
                <p className="font-pixel font-bold">点击选择文件夹</p>
              </div>
            )
          ) : selectedFile ? (
            <div>
              <div className="text-5xl mb-3">📦</div>
              <p className="font-pixel text-lg">{selectedFile.name}</p>
            </div>
          ) : (
            <div>
              <div className="text-5xl mb-4">📦</div>
              <p className="font-pixel font-bold">点击选择 zip</p>
            </div>
          )}
        </div>

        {hasSelection && (
          <div
            className="mb-6 border-4 border-pixel-black p-4 bg-pixel-white/80"
            style={{ boxShadow: '4px 4px 0 #101010' }}
          >
            <p className="font-pixel text-sm font-bold mb-3">Agent 平台类型</p>

            {isDetecting ? (
              <p className="font-pixel text-xs text-pixel-black/60">正在识别...</p>
            ) : effectiveAgentType && !forceManualType ? (
              <motion.div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-pixel text-sm text-pixel-green">
                  ✓ 已识别：{getAgentTypeLabel(effectiveAgentType)}
                  {detection?.confidence === 'high' && !selectedAgentType && '（自动）'}
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
              <p className="font-pixel text-xs text-pixel-black/60 mb-3">
                {detection?.confidence === 'low' && detection.detected
                  ? `疑似 ${getAgentTypeLabel(detection.detected)}，请确认类型`
                  : uploadMode === 'zip'
                    ? 'zip 包无法自动识别，请手动选择类型'
                    : '未能自动识别，请手动选择类型'}
              </p>
            )}

            {showTypePicker && !isDetecting && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {AGENT_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedAgentType(opt.id)}
                    className={`py-2 px-2 font-pixel text-xs border-4 border-pixel-black ${
                      selectedAgentType === opt.id ||
                      (!selectedAgentType &&
                        detection?.detected === opt.id &&
                        detection.confidence === 'low')
                        ? 'bg-pixel-yellow text-pixel-black'
                        : 'bg-pixel-white hover:bg-pixel-gray/30'
                    }`}
                    style={{
                      boxShadow:
                        selectedAgentType === opt.id ? '3px 3px 0 #101010' : '2px 2px 0 #101010',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Publish to Market Toggle */}
        {hasSelection && (
          <div
            className="mb-6 border-4 border-pixel-black p-4 bg-pixel-cream/50"
            style={{ boxShadow: '4px 4px 0 #101010' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-pixel text-sm font-bold flex items-center gap-2">
                  <span className="text-xl">🏪</span>
                  发布到 Agent 市场
                </p>
                <p className="font-pixel text-xs text-pixel-black/60 mt-1">
                  公开你的 Agent，让其他用户可以发现并使用
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePublishToggle(!publishToMarket)}
                disabled={isUploading || isScanning}
                className={`relative w-14 h-7 border-4 border-pixel-black transition-colors ${
                  publishToMarket ? 'bg-pixel-green' : 'bg-pixel-black/20'
                }`}
                style={{ boxShadow: '2px 2px 0 #101010' }}
              >
                <motion.div
                  className="absolute top-0 w-5 h-5 bg-pixel-white border-2 border-pixel-black"
                  animate={{ left: publishToMarket ? 28 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  style={{ top: '50%', transform: 'translateY(-50%)' }}
                />
              </button>
            </div>

            {/* Scanning indicator */}
            {isScanning && (
              <div className="mt-3 flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-pixel-black border-t-transparent rounded-full" />
                <span className="font-pixel text-xs text-pixel-black/60">正在扫描敏感信息...</span>
              </div>
            )}

            {/* Sensitive info warning */}
            {showSensitiveWarning && sensitiveFiles.length > 0 && publishToMarket && !isScanning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 p-3 bg-pixel-yellow/20 border-4 border-pixel-yellow"
              >
                <div className="flex items-start gap-2">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="font-pixel text-sm text-pixel-black font-bold">
                      检测到您上传的文件夹中包含敏感信息
                    </p>
                    <p className="font-pixel text-xs text-pixel-black/70 mt-1">
                      上传到 Agent 市场时，会自动去除这些信息以保障安全：
                    </p>
                    <ul className="mt-2 space-y-1">
                      {sensitiveFiles.slice(0, 5).map((sf, i) => (
                        <li key={i} className="font-mono text-xs text-pixel-black/80">
                          • {sf.path} <span className="text-pixel-yellow">({sf.type})</span>
                        </li>
                      ))}
                      {sensitiveFiles.length > 5 && (
                        <li className="font-pixel text-xs text-pixel-black/60">
                          ...还有 {sensitiveFiles.length - 5} 个文件
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="font-pixel block mb-2">Agent 名称</label>
            <PixelInput
              value={lobsterName}
              onChange={setLobsterName}
              placeholder="给你的 Agent 起个名字..."
              className="w-full"
              disabled={isUploading}
            />
          </div>

          <PixelButton
            onClick={handleUpload}
            disabled={
              !lobsterName.trim() ||
              !hasSelection ||
              !effectiveAgentType ||
              isUploading ||
              isDetecting ||
              isScanning
            }
            variant="primary"
            size="lg"
            className="w-full"
          >
            {isUploading
              ? `上传中... ${uploadProgress}%`
              : isScanning
              ? '扫描中...'
              : publishToMarket
              ? '🚀 上传并发布到市场'
              : '📤 开始上传'}
          </PixelButton>
        </div>
      </div>

      {isUploading && (
        <div className="mt-4 h-4 bg-pixel-black border-2 border-pixel-black">
          <motion.div className="h-full bg-pixel-green" animate={{ width: `${uploadProgress}%` }} />
        </div>
      )}
    </motion.div>
  );
}
