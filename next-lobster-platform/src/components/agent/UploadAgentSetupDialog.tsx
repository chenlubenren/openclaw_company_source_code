'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  PixelCanvas,
  EMPTY_PIXEL,
  DEFAULT_GRID,
  GRID_SIZE_OPTIONS,
} from '@/components/pixel/PixelCanvas';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import {
  AGENT_TYPE_OPTIONS,
  getAgentTypeLabel,
  type AgentPlatformType,
  type DetectionResult,
} from '@/lib/agentTypeDetect';
import { pickProfileAvatar } from '@/lib/profileAvatars';

type UploadMode = 'folder' | 'zip';
type AvatarMode = 'random' | 'pixel';

export interface UploadSetupPayload {
  description: string;
  avatar: string;
}

interface SensitiveFile {
  path: string;
  type: string;
}

interface UploadAgentSetupDialogProps {
  open: boolean;
  uploadMode: UploadMode;
  selectedLabel: string;
  agentName: string;
  onAgentNameChange: (value: string) => void;
  detection: DetectionResult | null;
  selectedAgentType: AgentPlatformType | null;
  onSelectedAgentTypeChange: (value: AgentPlatformType | null) => void;
  effectiveAgentType: AgentPlatformType | null;
  forceManualType: boolean;
  onForceManualTypeChange: (value: boolean) => void;
  showTypePicker: boolean;
  isDetecting: boolean;
  marketPublishEnabled?: boolean;
  publishToMarket: boolean;
  onPublishToMarketChange: (value: boolean) => void;
  isScanning: boolean;
  sensitiveFiles: SensitiveFile[];
  showSensitiveWarning: boolean;
  hasBlockingMarketRisks: boolean;
  isUploading: boolean;
  uploadProgress: number;
  error: string;
  submitLabel?: string;
  uploadingLabel?: string;
  onClose: () => void;
  onSubmit: (payload: UploadSetupPayload) => void;
}

const OUTPUT_SIZES = [64, 96, 128, 192];

function createEmptyPixels(size: number): string[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => EMPTY_PIXEL)
  );
}

function renderPixelAvatar(grid: string[][], gridSize: number, finalSize: number): string {
  if (typeof document === 'undefined') return '';
  const scale = Math.max(1, Math.ceil(finalSize / gridSize));
  const canvas = document.createElement('canvas');
  canvas.width = finalSize;
  canvas.height = finalSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, finalSize, finalSize);

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const color = grid[row]?.[col];
      if (color && color !== EMPTY_PIXEL) {
        ctx.fillStyle = color;
        ctx.fillRect(col * scale, row * scale, scale, scale);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

export function UploadAgentSetupDialog({
  open,
  uploadMode,
  selectedLabel,
  agentName,
  onAgentNameChange,
  detection,
  selectedAgentType,
  onSelectedAgentTypeChange,
  effectiveAgentType,
  forceManualType,
  onForceManualTypeChange,
  showTypePicker,
  isDetecting,
  marketPublishEnabled = true,
  publishToMarket,
  onPublishToMarketChange,
  isScanning,
  sensitiveFiles,
  showSensitiveWarning,
  hasBlockingMarketRisks,
  isUploading,
  uploadProgress,
  error,
  submitLabel,
  uploadingLabel,
  onClose,
  onSubmit,
}: UploadAgentSetupDialogProps) {
  const [avatarMode, setAvatarMode] = useState<AvatarMode>('random');
  const [randomSeed, setRandomSeed] = useState(() => Date.now());
  const [description, setDescription] = useState('');
  const [gridSize, setGridSize] = useState(DEFAULT_GRID);
  const [outputSize, setOutputSize] = useState(128);
  const [pixels, setPixels] = useState<string[][]>(() => createEmptyPixels(DEFAULT_GRID));
  const [setupError, setSetupError] = useState('');

  const randomAvatarUrl = useMemo(
    () => pickProfileAvatar(randomSeed, agentName),
    [agentName, randomSeed]
  );
  const pixelPreviewUrl = useMemo(
    () => renderPixelAvatar(pixels, gridSize, outputSize),
    [gridSize, outputSize, pixels]
  );
  const hasPaintedPixels = useMemo(
    () => pixels.some((row) => row.some((cell) => cell !== EMPTY_PIXEL)),
    [pixels]
  );
  const currentPreviewUrl = avatarMode === 'pixel' ? pixelPreviewUrl : randomAvatarUrl;
  const finalError = setupError || error;
  const effectiveSubmitLabel = submitLabel || (publishToMarket ? '完成设置并上传上架' : '完成设置并上传');
  const effectiveUploadingLabel = uploadingLabel || '上传中';

  if (!open) return null;

  const submitDisabled =
    isUploading ||
    isDetecting ||
    isScanning ||
    !agentName.trim() ||
    !effectiveAgentType;

  const handleSubmit = () => {
    setSetupError('');
    if (avatarMode === 'pixel' && !hasPaintedPixels) {
      setSetupError('请先绘制头像，或切换到随机形象。');
      return;
    }

    onSubmit({
      description: description.trim(),
      avatar: avatarMode === 'pixel' ? pixelPreviewUrl : randomAvatarUrl,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-pixel-black/70 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex max-h-[90vh] w-full max-w-6xl flex-col border-4 border-pixel-black bg-pixel-white"
        style={{ boxShadow: '10px 10px 0 #101010' }}
      >
        <div className="flex items-start justify-between gap-4 border-b-4 border-pixel-black bg-pixel-yellow px-4 py-3">
          <div>
            <p className="font-pixel text-sm font-bold text-pixel-black">Agent形象设置</p>
            <p className="mt-1 font-pixel text-xs text-pixel-black/60">
              {selectedLabel || (uploadMode === 'folder' ? '已选择文件夹' : '已选择 zip')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="border-4 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-xs text-pixel-black hover:bg-pixel-red hover:text-pixel-white disabled:opacity-50"
            style={{ boxShadow: '3px 3px 0 #101010' }}
          >
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {finalError && (
            <div className="mb-5 border-4 border-pixel-red bg-pixel-red/10 px-4 py-3">
              <p className="font-pixel text-sm text-pixel-red">{finalError}</p>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <section className="border-4 border-pixel-black bg-pixel-white p-5" style={{ boxShadow: '5px 5px 0 #101010' }}>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'random', label: '随机形象' },
                  { id: 'pixel', label: '手动画像素' },
                ] as Array<{ id: AvatarMode; label: string }>).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setAvatarMode(mode.id)}
                    className={`border-4 border-pixel-black px-3 py-2 font-pixel text-xs ${
                      avatarMode === mode.id
                        ? 'bg-pixel-black text-pixel-white'
                        : 'bg-pixel-white text-pixel-black hover:bg-pixel-black/5'
                    }`}
                    style={{ boxShadow: avatarMode === mode.id ? 'none' : '3px 3px 0 #101010' }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {avatarMode === 'random' && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-4 border-pixel-black bg-pixel-blue/10 px-4 py-4">
                  <div>
                    <p className="font-pixel text-sm text-pixel-black">生成一个新的随机像素形象</p>
                    <p className="mt-1 font-pixel text-xs text-pixel-black/55">
                      每次点击都会生成新的像素形象。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRandomSeed(Date.now())}
                    className="border-4 border-pixel-black bg-pixel-yellow px-3 py-2 font-pixel text-xs text-pixel-black"
                    style={{ boxShadow: '3px 3px 0 #101010' }}
                  >
                    随机一个
                  </button>
                </div>
              )}

              {avatarMode === 'pixel' && (
                <div className="mt-5 space-y-5">
                  <div>
                    <p className="mb-2 font-pixel text-xs text-pixel-black/60">像素分辨率</p>
                    <div className="flex flex-wrap gap-2">
                      {GRID_SIZE_OPTIONS.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            setGridSize(size);
                            setPixels(createEmptyPixels(size));
                          }}
                          className={`border-4 border-pixel-black px-3 py-1.5 font-pixel text-xs ${
                            gridSize === size
                              ? 'bg-pixel-blue text-pixel-white'
                              : 'bg-pixel-white text-pixel-black hover:bg-pixel-black/5'
                          }`}
                          style={{ boxShadow: gridSize === size ? 'none' : '3px 3px 0 #101010' }}
                        >
                          {size}x{size}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 font-pixel text-xs text-pixel-black/60">导出尺寸</p>
                    <div className="flex flex-wrap gap-2">
                      {OUTPUT_SIZES.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setOutputSize(size)}
                          className={`border-4 border-pixel-black px-3 py-1.5 font-pixel text-xs ${
                            outputSize === size
                              ? 'bg-pixel-green text-pixel-white'
                              : 'bg-pixel-white text-pixel-black hover:bg-pixel-black/5'
                          }`}
                          style={{ boxShadow: outputSize === size ? 'none' : '3px 3px 0 #101010' }}
                        >
                          {size}px
                        </button>
                      ))}
                    </div>
                  </div>

                  <PixelCanvas gridSize={gridSize} initialPixels={pixels} onPixelsChange={setPixels} />
                </div>
              )}
            </section>

            <section className="border-4 border-pixel-black bg-pixel-white p-5" style={{ boxShadow: '5px 5px 0 #101010' }}>
              <div className="flex flex-col items-center border-b-4 border-pixel-black pb-5">
                <p className="font-pixel text-sm text-pixel-black/60">当前预览</p>
                <div className="mt-3 overflow-hidden border-4 border-pixel-black bg-pixel-white" style={{ boxShadow: '4px 4px 0 #101010' }}>
                  {currentPreviewUrl ? (
                    <img
                      src={currentPreviewUrl}
                      alt={`${agentName || 'Agent'} avatar preview`}
                      className="block h-40 w-40 object-cover"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  ) : (
                    <div className="flex h-40 w-40 items-center justify-center font-pixel text-xs text-pixel-black/40">
                      暂无头像
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <label className="mb-2 block font-pixel text-sm text-pixel-black">Agent 名称</label>
                  <PixelInput
                    value={agentName}
                    onChange={onAgentNameChange}
                    placeholder="给你的 Agent 起个名字..."
                    className="w-full"
                    disabled={isUploading}
                  />
                </div>

                <div>
                  <p className="mb-2 font-pixel text-sm font-bold text-pixel-black">Agent 平台类型</p>
                  {isDetecting ? (
                    <p className="font-pixel text-xs text-pixel-black/60">正在识别工作区类型...</p>
                  ) : effectiveAgentType && !forceManualType ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-pixel text-sm text-pixel-green">
                        已识别：{getAgentTypeLabel(effectiveAgentType)}
                        {detection?.confidence === 'high' && !selectedAgentType ? '（自动）' : ''}
                      </span>
                      <button
                        type="button"
                        className="font-pixel text-xs text-pixel-blue underline"
                        onClick={() => {
                          onForceManualTypeChange(true);
                          onSelectedAgentTypeChange(null);
                        }}
                      >
                        更改
                      </button>
                    </div>
                  ) : (
                    <p className="mb-3 font-pixel text-xs text-pixel-black/60">
                      {uploadMode === 'zip'
                        ? 'zip 包无法可靠自动识别，请手动选择平台类型。'
                        : '未能自动锁定平台类型，请手动选择。'}
                    </p>
                  )}

                  {showTypePicker && !isDetecting && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {AGENT_TYPE_OPTIONS.map((option) => {
                        const isSelected =
                          selectedAgentType === option.id ||
                          (!selectedAgentType && detection?.detected === option.id && detection.confidence === 'low');

                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => onSelectedAgentTypeChange(option.id)}
                            className={`border-4 border-pixel-black px-2 py-2 font-pixel text-xs ${
                              isSelected
                                ? 'bg-pixel-yellow text-pixel-black'
                                : 'bg-pixel-white text-pixel-black hover:bg-pixel-gray/30'
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

                <div>
                  <label className="mb-2 block font-pixel text-sm text-pixel-black">Agent 介绍</label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={5}
                    className="w-full resize-none border-4 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-sm text-pixel-black focus:outline-none focus:border-pixel-blue"
                    style={{ boxShadow: '3px 3px 0 #101010' }}
                    placeholder="写一句清楚的介绍，让用户知道这个 Agent 擅长什么。"
                    disabled={isUploading}
                  />
                </div>

                {marketPublishEnabled && (
                <div className="border-4 border-pixel-black bg-pixel-cream/50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-pixel text-sm font-bold text-pixel-black">发布到 Agent 市场</p>
                      <p className="mt-1 font-pixel text-xs text-pixel-black/60">
                        开启后最终上传会直接上架。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPublishToMarketChange(!publishToMarket)}
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
                    <div className="mt-4 border-4 border-pixel-yellow bg-pixel-yellow/20 p-3">
                        <p className="font-pixel text-sm font-bold text-pixel-black">市场副本将自动脱敏</p>
                        <p className="mt-1 font-pixel text-xs text-pixel-black/70">
                          上架时会跳过敏感路径，并替换疑似密钥内容；你的本地 Agent 文件不会被删除。
                        </p>
                        <ul className="mt-2 space-y-1">
                        {sensitiveFiles.slice(0, 4).map((file) => (
                          <li key={`${file.path}-${file.type}`} className="font-mono text-xs text-pixel-black/80">
                            - {file.path} ({file.type})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                )}

                {isUploading && (
                  <div>
                    <div className="h-4 border-2 border-pixel-black bg-pixel-black">
                      <motion.div className="h-full bg-pixel-green" animate={{ width: `${uploadProgress}%` }} />
                    </div>
                    <p className="mt-2 text-center font-pixel text-sm text-pixel-black/70">
                      {effectiveUploadingLabel}... {uploadProgress}%
                    </p>
                  </div>
                )}

                <PixelButton
                  onClick={handleSubmit}
                  disabled={submitDisabled}
                  variant="primary"
                  size="lg"
                  className="w-full"
                >
                  {isUploading
                    ? `${effectiveUploadingLabel}... ${uploadProgress}%`
                    : effectiveSubmitLabel}
                </PixelButton>
              </div>
            </section>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
