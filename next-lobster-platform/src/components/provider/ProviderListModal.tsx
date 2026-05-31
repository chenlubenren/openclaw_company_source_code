'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { useAuthStore } from '@/store/useAuthStore';

const API_BASE = 'http://localhost:3002';

interface ProviderModel {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  name: string;
  type: 'claude' | 'openai' | 'gemini' | 'openclaw';
  apiKey: string;
  baseUrl?: string;
  models: ProviderModel[];
  isDefault: boolean;
}

interface ProviderModalProps {
  onClose: () => void;
  onSaved: () => void;
  editProvider?: Provider | null;
}

const PROVIDER_TYPES = [
  { value: 'claude', label: 'Claude', icon: '🧠', url: 'https://console.anthropic.com/settings/keys', keyField: 'ANTHROPIC_API_KEY' },
  { value: 'openai', label: 'OpenAI', icon: '🤖', url: 'https://platform.openai.com/api-keys', keyField: 'OPENAI_API_KEY' },
  { value: 'gemini', label: 'Gemini', icon: '✨', url: 'https://aistudio.google.com/app/apikey', keyField: 'GEMINI_API_KEY' },
  { value: 'openclaw', label: 'OpenClaw', icon: '🦞', url: '', keyField: 'OPENCLAW_API_KEY' },
];

const DEFAULT_MODELS: Record<string, ProviderModel[]> = {
  claude: [
    { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
    { id: 'claude-sonnet-4-7', name: 'Claude Sonnet 4.7' },
    { id: 'claude-haiku-4-7', name: 'Claude Haiku 4.7' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'o1', name: 'o1' },
    { id: 'o1-mini', name: 'o1 Mini' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  ],
  openclaw: [
    { id: 'claude-sonnet', name: 'Claude Sonnet (OpenClaw)' },
    { id: 'claude-opus', name: 'Claude Opus (OpenClaw)' },
  ],
};

export function ProviderModal({ onClose, onSaved, editProvider }: ProviderModalProps) {
  const { token } = useAuthStore();
  const [name, setName] = useState(editProvider?.name || '');
  const [type, setType] = useState<string>(editProvider?.type || 'claude');
  const [apiKey, setApiKey] = useState(editProvider?.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(editProvider?.baseUrl || '');
  const [selectedModels, setSelectedModels] = useState<string[]>(
    editProvider?.models.map(m => m.id) || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const providerType = PROVIDER_TYPES.find(p => p.value === type);

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId) ? prev.filter(m => m !== modelId) : [...prev, modelId]
    );
  };

  const handleSave = async () => {
    if (!name.trim() || !apiKey.trim()) {
      setError('请填写名称和 API Key');
      return;
    }
    if (selectedModels.length === 0) {
      setError('请至少选择一个模型');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        type,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        models: selectedModels,
      };
      const res = await fetch(`${API_BASE}/api/providers${editProvider ? `/${editProvider.id}` : ''}`, {
        method: editProvider ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('保存失败');
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-pixel-black/50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          className="bg-pixel-white border-8 border-pixel-black w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
          style={{ boxShadow: '8px 8px 0px 0px #101010' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-pixel-yellow border-b-4 border-pixel-black px-6 py-4 flex items-center justify-between">
            <h2 className="font-pixel text-xl text-pixel-black flex items-center gap-2">
              <span>{providerType?.icon}</span> {editProvider ? '编辑供应商' : '新增供应商'}
            </h2>
            <button onClick={onClose} className="font-pixel text-pixel-black hover:text-pixel-red text-2xl leading-none">×</button>
          </div>

          <div className="p-6 space-y-5">
            {/* Provider Type */}
            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-2 block">供应商类型</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDER_TYPES.map(pt => (
                  <button
                    key={pt.value}
                    onClick={() => { setType(pt.value); setSelectedModels([]); }}
                    className={`px-4 py-3 border-4 font-pixel text-sm flex items-center gap-2 transition-colors ${
                      type === pt.value
                        ? 'border-pixel-black bg-pixel-yellow'
                        : 'border-pixel-black/30 bg-pixel-white hover:bg-pixel-yellow/30'
                    }`}
                  >
                    <span>{pt.icon}</span> {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">供应商名称</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="例如：我的 Claude"
                className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">
                {providerType?.keyField}
              </label>
              <input
                type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
              />
              {providerType?.url && (
                <a href={providerType.url} target="_blank" rel="noopener noreferrer"
                   className="font-pixel text-xs text-pixel-blue hover:underline mt-1 inline-block">
                  获取 API Key →
                </a>
              )}
            </div>

            {/* Base URL */}
            {(type === 'openclaw' || type === 'openai') && (
              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">自定义 Base URL（可选）</label>
                <input
                  type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                  placeholder={type === 'openclaw' ? 'https://api.openclaw.com/v1' : 'https://api.openai.com/v1'}
                  className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
                />
              </div>
            )}

            {/* Models */}
            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-2 block">支持的模型（可多选）</label>
              <div className="space-y-1">
                {(DEFAULT_MODELS[type] || []).map(model => (
                  <label key={model.id} className="flex items-center gap-2 px-3 py-2 border-2 border-pixel-black/20 hover:border-pixel-black cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(model.id)}
                      onChange={() => toggleModel(model.id)}
                      className="w-4 h-4"
                    />
                    <span className="font-pixel text-sm">{model.name}</span>
                    <span className="font-mono text-xs text-pixel-black/40 ml-auto">{model.id}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-pixel-red/20 border-4 border-pixel-red px-4 py-2 font-pixel text-sm text-pixel-red">
                {error}
              </div>
            )}
          </div>

          <div className="bg-pixel-white border-t-4 border-pixel-black px-6 py-4 flex gap-3 justify-end">
            <PixelButton variant="secondary" onClick={onClose}>取消</PixelButton>
            <PixelButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </PixelButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface ProviderListModalProps {
  onClose: () => void;
}

export function ProviderListModal({ onClose }: ProviderListModalProps) {
  const { token } = useAuthStore();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { fetchProviders(); }, []);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/providers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProviders(data.providers.map((p: any) => ({
        ...p,
        models: JSON.parse(p.models || '[]'),
      })));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个供应商吗？')) return;
    setDeletingId(id);
    try {
      await fetch(`${API_BASE}/api/providers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setProviders(prev => prev.filter(p => p.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const typeIcons: Record<string, string> = {
    claude: '🧠', openai: '🤖', gemini: '✨', openclaw: '🦞',
  };

  const typeLabels: Record<string, string> = {
    claude: 'Claude', openai: 'OpenAI', gemini: 'Gemini', openclaw: 'OpenClaw',
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-pixel-black/50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          className="bg-pixel-white border-8 border-pixel-black w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
          style={{ boxShadow: '8px 8px 0px 0px #101010' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-pixel-yellow border-b-4 border-pixel-black px-6 py-4 flex items-center justify-between">
            <h2 className="font-pixel text-xl text-pixel-black flex items-center gap-2">
              <span>🔑</span> 供应商配置
            </h2>
            <div className="flex items-center gap-2">
              <PixelButton variant="primary" size="sm" onClick={() => { setEditProvider(null); setShowAdd(true); }}>
                + 新增
              </PixelButton>
              <button onClick={onClose} className="font-pixel text-pixel-black hover:text-pixel-red text-2xl leading-none">×</button>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-8 font-pixel text-pixel-black/50">加载中...</div>
            ) : providers.length === 0 ? (
              <div className="text-center py-8">
                <p className="font-pixel text-pixel-black/50 mb-3">还没有配置供应商</p>
                <PixelButton variant="primary" onClick={() => setShowAdd(true)}>+ 添加第一个供应商</PixelButton>
              </div>
            ) : (
              <div className="space-y-3">
                {['claude', 'openai', 'gemini', 'openclaw'].map(type => {
                  const typeProviders = providers.filter(p => p.type === type);
                  if (typeProviders.length === 0) return null;
                  return (
                    <div key={type}>
                      <h3 className="font-pixel text-sm text-pixel-black/60 border-b-2 border-pixel-black/20 pb-1 mb-2 flex items-center gap-1">
                        <span>{typeIcons[type]}</span> {typeLabels[type]}
                      </h3>
                      <div className="space-y-2">
                        {typeProviders.map(p => (
                          <div key={p.id} className="border-4 border-pixel-black bg-pixel-white p-3 flex items-start gap-3" style={{ boxShadow: '3px 3px 0px 0px #101010' }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-pixel text-sm font-bold">{p.name}</span>
                                {p.isDefault && <span className="px-1.5 py-0.5 bg-pixel-green text-pixel-white font-pixel text-xs">默认</span>}
                              </div>
                              <div className="font-mono text-xs text-pixel-black/50 mt-1 truncate">
                                {p.apiKey.substring(0, 8)}...{p.apiKey.substring(p.apiKey.length - 4)}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {(Array.isArray(p.models) ? p.models : []).slice(0, 3).map((m: any) => (
                                  <span key={m.id || m} className="px-2 py-0.5 bg-pixel-black/5 border border-pixel-black/20 font-mono text-xs">
                                    {m.name || m}
                                  </span>
                                ))}
                                {(Array.isArray(p.models) ? p.models : []).length > 3 && (
                                  <span className="px-2 py-0.5 bg-pixel-black/5 border border-pixel-black/20 font-mono text-xs">
                                    +{(Array.isArray(p.models) ? p.models : []).length - 3}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => { setEditProvider(p); setShowAdd(true); }} className="px-2 py-1 bg-pixel-yellow border-2 border-pixel-black font-pixel text-xs hover:bg-pixel-yellow/80 transition-colors" style={{ boxShadow: '2px 2px 0 #101010' }}>编辑</button>
                              <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="px-2 py-1 bg-pixel-red border-2 border-pixel-black font-pixel text-xs text-pixel-white hover:bg-pixel-red/80 transition-colors disabled:opacity-50" style={{ boxShadow: '2px 2px 0 #101010' }}>删除</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {showAdd && (
        <ProviderModal
          editProvider={editProvider}
          onClose={() => { setShowAdd(false); setEditProvider(null); }}
          onSaved={fetchProviders}
        />
      )}
    </AnimatePresence>
  );
}
