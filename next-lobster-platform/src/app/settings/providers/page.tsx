'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { BackButton } from '@/components/ui/BackButton';
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
  type: string;
  apiKey: string;
  baseUrl?: string;
  models: ProviderModel[];
  isDefault: boolean;
}

const TABS = [
  { key: 'claude', label: 'Claude', icon: '🧠' },
  { key: 'codex', label: 'Codex', icon: '💻' },
  { key: 'opencode', label: 'OpenCode', icon: '🔧' },
  { key: 'openclaw', label: 'OpenClaw', icon: '🦞' },
  { key: 'hermes', label: 'Hermes', icon: '🛡️' },
];

const DEFAULT_MODELS: Record<string, ProviderModel[]> = {
  claude: [
    { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
    { id: 'claude-sonnet-4-7', name: 'Claude Sonnet 4.7' },
    { id: 'claude-haiku-4-7', name: 'Claude Haiku 4.7' },
    { id: 'claude-3-5-sonnet-20250514', name: 'Claude 3.5 Sonnet (Latest)' },
    { id: 'claude-3-5-haiku-20250514', name: 'Claude 3.5 Haiku (Latest)' },
  ],
  codex: [
    // GPT-5 系列 (2026年最新)
    { id: 'gpt-5.5', name: 'GPT-5.5' },
    { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro' },
    { id: 'gpt-5.4', name: 'GPT-5.4' },
    { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
    // GPT-5 Thinking 系列
    { id: 'gpt-5-thinking', name: 'GPT-5 Thinking' },
    { id: 'gpt-5-thinking-pro', name: 'GPT-5 Thinking Pro' },
    { id: 'gpt-5-thinking-mini', name: 'GPT-5 Thinking Mini' },
    // o 系列
    { id: 'o3', name: 'o3' },
    { id: 'o3-pro', name: 'o3 Pro' },
    { id: 'o4-mini', name: 'o4 Mini' },
    { id: 'o4-mini-high', name: 'o4 Mini High' },
    // GPT-4o
    { id: 'gpt-4o', name: 'GPT-4o' },
  ],
  opencode: [
    // DeepSeek V4 系列 (2026年4月最新)
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat (兼容)' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (兼容)' },
    // Kimi K2 系列 (2026年4月最新)
    { id: 'kimi-k2.6', name: 'Kimi K2.6' },
    { id: 'kimi-k2.5', name: 'Kimi K2.5' },
    { id: 'moonshot-v1-128k', name: 'Kimi V1 128K' },
    // GLM-5 系列 (2026年4月最新)
    { id: 'glm-5.1', name: 'GLM-5.1' },
    { id: 'glm-5', name: 'GLM-5' },
    { id: 'glm-4.7', name: 'GLM-4.7' },
    { id: 'glm-4.6', name: 'GLM-4.6' },
    // Qwen3.6 系列 (2026年4月最新)
    { id: 'qwen3.6-27b', name: 'Qwen3.6 27B' },
    { id: 'qwen3.6-35b-a3b', name: 'Qwen3.6 35B' },
    { id: 'qwen3.5-397b-a17b', name: 'Qwen3.5 397B' },
    { id: 'qwen2.5-72b', name: 'Qwen2.5 72B' },
    // 百川
    { id: 'baichuan4', name: '百川4' },
    { id: 'baichuan3-turbo', name: '百川3 Turbo' },
    // Yi
    { id: 'yi-large', name: 'Yi Large' },
    { id: 'yi-medium', name: 'Yi Medium' },
  ],
  openclaw: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    { id: 'glm-5.1', name: 'GLM-5.1' },
    { id: 'kimi-k2.6', name: 'Kimi K2.6' },
    { id: 'qwen3.6-27b', name: 'Qwen3.6 27B' },
    { id: 'gpt-5.4', name: 'GPT-5.4' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
  ],
  hermes: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    { id: 'glm-5.1', name: 'GLM-5.1' },
    { id: 'kimi-k2.6', name: 'Kimi K2.6' },
    { id: 'qwen3.6-27b', name: 'Qwen3.6 27B' },
    { id: 'gpt-5.4', name: 'GPT-5.4' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
  ],
};

const PROVIDER_INFO: Record<string, { url: string; keyField: string; hint: string }> = {
  claude: {
    url: 'https://console.anthropic.com/settings/keys',
    keyField: 'ANTHROPIC_API_KEY',
    hint: '从 Anthropic Console 获取 API Key',
  },
  codex: {
    url: 'https://platform.openai.com/api-keys',
    keyField: 'OPENAI_API_KEY',
    hint: 'GitHub Copilot 使用此 Key',
  },
  opencode: {
    url: 'https://platform.openai.com/api-keys',
    keyField: 'OPENAI_API_KEY',
    hint: 'OpenAI 或兼容 API Key',
  },
  openclaw: {
    url: '',
    keyField: 'OPENCLAW_API_KEY',
    hint: 'OpenClaw 兼容 API Key',
  },
  hermes: {
    url: '',
    keyField: 'HERMES_API_KEY',
    hint: 'Hermes Agent API Key',
  },
};

export default function ProviderSettingsPage() {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState('claude');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formModels, setFormModels] = useState<string[]>([]);
  const [customModel, setCustomModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const tabProviders = providers.filter(p => p.type === activeTab);

  const openAddForm = () => {
    setEditingProvider(null);
    setFormName('');
    setFormApiKey('');
    setFormBaseUrl('');
    setFormModels([]);
    setCustomModel('');
    setError('');
    setShowForm(true);
  };

  const openEditForm = (p: Provider) => {
    setEditingProvider(p);
    setFormName(p.name);
    setFormApiKey(p.apiKey);
    setFormBaseUrl(p.baseUrl || '');
    setFormModels(p.models.map((m: any) => m.id || m));
    setCustomModel('');
    setError('');
    setShowForm(true);
  };

  const toggleModel = (modelId: string) => {
    setFormModels(prev =>
      prev.includes(modelId) ? prev.filter(m => m !== modelId) : [...prev, modelId]
    );
  };

  const addCustomModel = () => {
    const trimmed = customModel.trim();
    if (trimmed && !formModels.includes(trimmed)) {
      setFormModels(prev => [...prev, trimmed]);
      setCustomModel('');
    }
  };

  const removeCustomModel = (modelId: string) => {
    const defaultIds = DEFAULT_MODELS[activeTab]?.map(m => m.id) || [];
    if (!defaultIds.includes(modelId)) {
      setFormModels(prev => prev.filter(m => m !== modelId));
    }
  };

  const handleSave = async () => {
    if (!formName.trim() || !formApiKey.trim()) {
      setError('请填写名称和 API Key');
      return;
    }
    if (formModels.length === 0) {
      setError('请至少选择一个模型');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: formName.trim(),
        type: activeTab,
        apiKey: formApiKey.trim(),
        baseUrl: formBaseUrl.trim() || undefined,
        models: formModels,
      };
      const res = await fetch(
        `${API_BASE}/api/providers${editingProvider ? `/${editingProvider.id}` : ''}`,
        {
          method: editingProvider ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error('保存失败');
      setShowForm(false);
      fetchProviders();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个供应商吗？')) return;
    await fetch(`${API_BASE}/api/providers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchProviders();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <BackButton />

      {/* Page Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="font-pixel text-2xl text-pixel-black mb-2 flex items-center gap-2">
          <span>🔑</span> 供应商配置
        </h1>
        <p className="font-pixel text-sm text-pixel-black/60">
          配置各平台的 API Key，每个 Agent 可以从这里选择供应商
        </p>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
        className="flex gap-1 mb-6 overflow-x-auto pb-2"
      >
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setShowForm(false); }}
            className={`px-4 py-2 border-4 font-pixel text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'border-pixel-black bg-pixel-yellow'
                : 'border-pixel-black/30 bg-pixel-white hover:bg-pixel-yellow/30'
            }`}
            style={{ boxShadow: activeTab === tab.key ? '3px 3px 0 #101010' : '2px 2px 0 #101010' }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </motion.div>

      {/* Provider List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
        className="bg-pixel-white border-4 border-pixel-black p-6"
        style={{ boxShadow: '6px 6px 0 #101010' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="font-pixel text-sm text-pixel-black/60 flex items-center gap-2">
            <span>{TABS.find(t => t.key === activeTab)?.icon}</span>
            <span>{TABS.find(t => t.key === activeTab)?.label} 供应商</span>
          </div>
          <PixelButton variant="primary" size="sm" onClick={openAddForm}>
            + 新增供应商
          </PixelButton>
        </div>

        {loading ? (
          <div className="text-center py-8 font-pixel text-pixel-black/50">加载中...</div>
        ) : tabProviders.length === 0 ? (
          <div className="text-center py-8">
            <div className="font-pixel text-4xl mb-3">🔑</div>
            <p className="font-pixel text-pixel-black/50 mb-4">还没有配置 {TABS.find(t => t.key === activeTab)?.label} 供应商</p>
            <PixelButton variant="primary" onClick={openAddForm}>+ 添加第一个供应商</PixelButton>
          </div>
        ) : (
          <div className="space-y-3">
            {tabProviders.map(p => (
              <div
                key={p.id}
                className="border-4 border-pixel-black bg-pixel-cream p-4 flex items-start gap-4"
                style={{ boxShadow: '4px 4px 0 #101010' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-pixel text-base font-bold">{p.name}</span>
                    {p.isDefault && (
                      <span className="px-2 py-0.5 bg-pixel-green text-pixel-white font-pixel text-xs">默认</span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-pixel-black/50 mb-2 truncate">
                    {p.apiKey.substring(0, 8)}...{p.apiKey.substring(p.apiKey.length - 4)}
                  </div>
                  {p.baseUrl && (
                    <div className="font-mono text-xs text-pixel-black/40 mb-2 truncate">
                      Base: {p.baseUrl}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {(p.models || []).slice(0, 5).map((m: any) => (
                      <span
                        key={m.id || m}
                        className="px-2 py-0.5 bg-pixel-black/5 border border-pixel-black/20 font-mono text-xs"
                      >
                        {m.name || m}
                      </span>
                    ))}
                    {(p.models || []).length > 5 && (
                      <span className="px-2 py-0.5 bg-pixel-black/5 border border-pixel-black/20 font-mono text-xs">
                        +{(p.models || []).length - 5}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openEditForm(p)}
                    className="px-3 py-1.5 bg-pixel-yellow border-2 border-pixel-black font-pixel text-xs hover:bg-pixel-yellow/80 transition-colors"
                    style={{ boxShadow: '2px 2px 0 #101010' }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="px-3 py-1.5 bg-pixel-red border-2 border-pixel-black font-pixel text-xs text-pixel-white hover:bg-pixel-red/80 transition-colors"
                    style={{ boxShadow: '2px 2px 0 #101010' }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-pixel-black/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-pixel-white border-8 border-pixel-black w-full max-w-lg max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: '8px 8px 0 #101010' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-pixel-yellow border-b-4 border-pixel-black px-6 py-4 flex items-center justify-between">
              <h2 className="font-pixel text-xl text-pixel-black flex items-center gap-2">
                <span>{TABS.find(t => t.key === activeTab)?.icon}</span>
                {editingProvider ? '编辑供应商' : '新增供应商'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="font-pixel text-pixel-black hover:text-pixel-red text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">供应商名称</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="例如：我的 Claude"
                  className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
                />
              </div>

              {/* API Key */}
              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">
                  {PROVIDER_INFO[activeTab]?.keyField}
                </label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={e => setFormApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
                />
                {PROVIDER_INFO[activeTab]?.url && (
                  <a
                    href={PROVIDER_INFO[activeTab].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-pixel text-xs text-pixel-blue hover:underline mt-1 inline-block"
                  >
                    获取 API Key →
                  </a>
                )}
                <p className="font-pixel text-xs text-pixel-black/40 mt-1">
                  {PROVIDER_INFO[activeTab]?.hint}
                </p>
              </div>

              {/* Base URL */}
              {(activeTab === 'opencode' || activeTab === 'openclaw' || activeTab === 'hermes') && (
                <div>
                  <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">自定义 Base URL（可选）</label>
                  <input
                    type="text"
                    value={formBaseUrl}
                    onChange={e => setFormBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
                  />
                </div>
              )}

              {/* Models */}
              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-2 block">支持的模型（可多选）</label>
                <div className="space-y-1 max-h-48 overflow-y-auto border-4 border-pixel-black/20 p-2">
                  {(DEFAULT_MODELS[activeTab] || []).map(model => (
                    <label
                      key={model.id}
                      className="flex items-center gap-2 px-3 py-2 border-2 border-pixel-black/10 hover:border-pixel-black cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={formModels.includes(model.id)}
                        onChange={() => toggleModel(model.id)}
                        className="w-4 h-4"
                      />
                      <span className="font-pixel text-sm">{model.name}</span>
                      <span className="font-mono text-xs text-pixel-black/40 ml-auto">{model.id}</span>
                    </label>
                  ))}

                  {/* Custom Models */}
                  {formModels.filter(m => !(DEFAULT_MODELS[activeTab] || []).some(dm => dm.id === m)).map(modelId => (
                    <div
                      key={modelId}
                      className="flex items-center gap-2 px-3 py-2 border-2 border-pixel-yellow bg-pixel-yellow/10"
                    >
                      <span className="w-4 h-4 bg-pixel-yellow flex items-center justify-center font-pixel text-xs">✓</span>
                      <span className="font-pixel text-sm text-pixel-black">{modelId}</span>
                      <button
                        type="button"
                        onClick={() => removeCustomModel(modelId)}
                        className="ml-auto px-2 py-0.5 bg-pixel-red border border-pixel-black font-pixel text-xs text-pixel-white hover:bg-pixel-red/80"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Custom Model */}
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomModel()}
                    placeholder="输入自定义模型 ID"
                    className="flex-1 px-3 py-2 border-4 border-pixel-black font-mono text-sm bg-pixel-white"
                  />
                  <button
                    type="button"
                    onClick={addCustomModel}
                    className="px-4 py-2 bg-pixel-blue border-4 border-pixel-black font-pixel text-sm text-pixel-white hover:bg-pixel-blue/80 transition-colors"
                    style={{ boxShadow: '3px 3px 0 #101010' }}
                  >
                    + 添加
                  </button>
                </div>
                <p className="font-pixel text-xs text-pixel-black/40 mt-1">
                  可输入模型 ID（如 deepseek-chat）添加列表中没有的模型
                </p>
              </div>

              {error && (
                <div className="bg-pixel-red/20 border-4 border-pixel-red px-4 py-2 font-pixel text-sm text-pixel-red">
                  {error}
                </div>
              )}
            </div>

            <div className="bg-pixel-white border-t-4 border-pixel-black px-6 py-4 flex gap-3 justify-end">
              <PixelButton variant="secondary" onClick={() => setShowForm(false)}>取消</PixelButton>
              <PixelButton variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </PixelButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
