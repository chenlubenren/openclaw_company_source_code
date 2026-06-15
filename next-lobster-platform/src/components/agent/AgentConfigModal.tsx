'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { FeishuIntegrationCard } from '@/components/integration/FeishuIntegrationCard';
import { useAuthStore } from '@/store/useAuthStore';
import { Lobster } from '@/types';
import { API_BASE } from '@/lib/runtime';

interface AgentConfigModalProps {
  agent: Lobster;
  onClose: () => void;
  onSave: () => void;
}

interface Provider {
  id: string;
  name: string;
  type: 'claude' | 'openai' | 'gemini' | 'openclaw';
  apiKey: string;
  baseUrl?: string;
  models: string[];
  isDefault: boolean;
}

interface AgentUserConfig {
  name: string;
  description: string;
  platform: string;
  avatar?: string;
  providerId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const PLATFORMS = [
  { value: 'openclaw', label: 'OpenClaw' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'codex', label: 'Codex' },
];

const PLATFORM_TO_PROVIDER_TYPE: Record<string, string> = {
  'openclaw': 'openclaw',
  'claude-code': 'claude',
  'opencode': 'opencode',
  'codex': 'codex',
};

export function AgentConfigModal({ agent, onClose, onSave }: AgentConfigModalProps) {
  const { token } = useAuthStore();
  const router = useRouter();
  const [config, setConfig] = useState<AgentUserConfig>({
    name: agent.name || '',
    description: agent.description || '',
    platform: agent.platform || 'openclaw',
    avatar: agent.avatar || '',
    providerId: (agent as any).providerId || '',
    model: agent.config?.model || '',
    temperature: agent.config?.temperature ?? 0.7,
    maxTokens: agent.config?.maxTokens ?? 8192,
  });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(agent.avatar || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canEditProfile = agent.canEditProfile !== false;

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch(`${API_BASE}/api/providers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers.map((p: any) => ({
          ...p,
          models: JSON.parse(p.models || '[]'),
        })));
      }
    } finally {
      setLoadingProviders(false);
    }
  };

  const filteredProviders = providers.filter(p => {
    const neededType = PLATFORM_TO_PROVIDER_TYPE[config.platform];
    return p.type === neededType;
  });

  const selectedProvider = providers.find(p => p.id === config.providerId);
  const availableModels = selectedProvider?.models || [];
  const platformLabel = PLATFORMS.find((p) => p.value === config.platform)?.label || config.platform || 'OpenClaw';

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const payload = canEditProfile
        ? { ...config, platform: undefined }
        : { ...config, name: undefined, description: undefined, platform: undefined };
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('保存失败');
      onSave();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSelect = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('图片大小不能超过 2MB');
      return;
    }
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('上传失败');
      const data = await res.json();
      const avatarUrl = data.avatarUrl;
      setAvatarPreview(avatarUrl);
      setConfig({ ...config, avatar: avatarUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    }
  };

  return (
    <AnimatePresence>
      <ModalPortal>
        <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-pixel-black/50 p-4"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden border-8 border-pixel-black bg-pixel-white"
          style={{ boxShadow: '8px 8px 0px 0px #101010' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b-4 border-pixel-black bg-pixel-yellow px-6 py-4">
            <h2 className="font-pixel text-xl text-pixel-black flex items-center gap-2">
              <span>⚙️</span> Agent 配置
            </h2>
            <button onClick={onClose} className="font-pixel text-pixel-black hover:text-pixel-red transition-colors text-2xl leading-none">×</button>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-pixel-black bg-pixel-white overflow-hidden" style={{ boxShadow: '4px 4px 0px 0px #101010' }}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt={config.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-pixel-yellow flex items-center justify-center font-pixel text-4xl">?</div>
                  )}
                </div>
                <button
                  onClick={handleAvatarSelect}
                  className="absolute -bottom-2 -right-2 w-8 h-8 bg-pixel-black border-2 border-pixel-white rounded-full flex items-center justify-center text-white font-bold text-lg hover:bg-pixel-green transition-colors"
                  title="上传头像"
                >
                  +
                </button>
              </div>
              <p className="font-pixel text-xs text-pixel-black/50">点击 + 上传头像</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="font-pixel text-sm text-pixel-black/60 border-b-2 border-pixel-black/20 pb-1">基本信息</h3>
              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">Agent 名称</label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  disabled={!canEditProfile}
                  className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="输入 Agent 名称"
                />
                {!canEditProfile && (
                  <p className="mt-2 font-pixel text-xs text-pixel-black/50">
                    从市场召唤的他人 Agent 不能修改名称和介绍。
                  </p>
                )}
              </div>
              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">Agent 介绍</label>
                <textarea
                  value={config.description}
                  onChange={(e) => setConfig({ ...config, description: e.target.value })}
                  disabled={!canEditProfile}
                  rows={4}
                  className="w-full resize-none px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="写一句清楚的介绍，让用户知道这个 Agent 擅长什么。"
                />
              </div>
              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">平台</label>
                <select
                  value={config.platform}
                  onChange={(e) => setConfig({ ...config, platform: e.target.value, providerId: '', model: '' })}
                  disabled
                  className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-black/5 text-pixel-black disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <p className="mt-2 font-pixel text-xs text-pixel-black/50">
                  Agent 类型由创建或上传时确定，不能在配置中修改。
                </p>
              </div>
            </div>

            {/* Provider Selection */}
            <div className="space-y-4">
              <h3 className="font-pixel text-sm text-pixel-black/60 border-b-2 border-pixel-black/20 pb-1">供应商与模型</h3>
              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">选择供应商</label>
                {loadingProviders ? (
                  <div className="px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white/50">加载中...</div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={config.providerId}
                      onChange={(e) => setConfig({ ...config, providerId: e.target.value, model: '' })}
                      className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
                    >
                      <option value="">-- 选择供应商 --</option>
                      {filteredProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} {p.isDefault ? '(默认)' : ''}</option>
                      ))}
                    </select>
                    {filteredProviders.length === 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 border-4 border-pixel-black/20 bg-pixel-red/10">
                        <span className="font-pixel text-sm text-pixel-red">没有找到匹配的供应商</span>
                        <button
                          onClick={() => { onClose(); router.push('/settings/providers'); }}
                          className="px-3 py-1 bg-pixel-yellow border-2 border-pixel-black font-pixel text-xs hover:bg-pixel-yellow/80 transition-colors"
                          style={{ boxShadow: '2px 2px 0 #101010' }}
                        >
                          去配置 →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {config.providerId && availableModels.length > 0 && (
                <div>
                  <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">选择模型</label>
                  <select
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
                  >
                    <option value="">-- 选择模型 --</option>
                    {availableModels.map((m: any) => (
                      <option key={m.id || m} value={m.id || m}>{m.name || m}</option>
                    ))}
                  </select>
                </div>
              )}

              {config.providerId && (
                <div>
                  <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">
                    Temperature: {config.temperature}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            <FeishuIntegrationCard
              scope="agent"
              subjectId={agent.id}
              subjectName={config.name || agent.name}
            />

            {error && (
              <div className="bg-pixel-red/20 border-4 border-pixel-red px-4 py-2 font-pixel text-sm text-pixel-red">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 gap-3 justify-end border-t-4 border-pixel-black bg-pixel-white px-6 py-4">
            <PixelButton variant="secondary" onClick={onClose}>取消</PixelButton>
            <PixelButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </PixelButton>
          </div>
        </motion.div>
        </motion.div>
      </ModalPortal>
    </AnimatePresence>
  );
}
