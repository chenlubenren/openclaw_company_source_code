'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BackButton } from '@/components/ui/BackButton';
import { PixelButton } from '@/components/ui/PixelButton';
import { useAuthStore } from '@/store/useAuthStore';
import { API_BASE } from '@/lib/runtime';
import {
  PROVIDER_TYPES,
  findPresetForProvider,
  getModelDisplayName,
  getPresetByKey,
  getPresetsForType,
  getProviderTypeLabel,
  normalizeProviderModels,
  type ProviderPreset,
  type ProviderType,
} from '@/lib/providerPresets';

interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string | null;
  models: unknown[];
  isDefault: boolean;
}

function parseModels(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function maskKey(apiKey: string): string {
  if (!apiKey) return 'not set';
  if (apiKey.length <= 12) return `${apiKey.slice(0, 4)}...`;
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

function getEquivalentPreset(provider: Provider, targetType: ProviderType): ProviderPreset | undefined {
  const sourcePreset = findPresetForProvider(provider.type, provider.baseUrl, provider.models);
  const presetSuffix = sourcePreset?.key.split(':')[1];
  return presetSuffix ? getPresetByKey(`${targetType}:${presetSuffix}`) : undefined;
}

function buildCopiedProvider(provider: Provider, targetType: ProviderType) {
  const targetPreset = getEquivalentPreset(provider, targetType);
  const copiedModels = targetPreset?.models.length
    ? targetPreset.models.map((model) => model.id)
    : normalizeProviderModels(provider.models);

  return {
    name: `${provider.name} (${getProviderTypeLabel(targetType)})`,
    type: targetType,
    apiKey: provider.apiKey,
    baseUrl: targetPreset?.baseUrl ?? provider.baseUrl ?? undefined,
    models: copiedModels,
  };
}

export default function ProviderSettingsPage() {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ProviderType>('claude');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [formName, setFormName] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formModels, setFormModels] = useState<string[]>([]);
  const [customModel, setCustomModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copyProvider, setCopyProvider] = useState<Provider | null>(null);
  const [copyTargetTypes, setCopyTargetTypes] = useState<ProviderType[]>([]);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');

  const tabPresets = useMemo(() => getPresetsForType(activeTab), [activeTab]);
  const selectedPreset = getPresetByKey(selectedPresetKey) || tabPresets[0];
  const baseUrlEditable = Boolean(selectedPreset?.isCustom);
  const presetModelIds = new Set((selectedPreset?.models || []).map((model) => model.id));
  const tabProviders = providers.filter((provider) => provider.type === activeTab);

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
        setProviders((data.providers || []).map((provider: any) => ({
          ...provider,
          models: parseModels(provider.models),
        })));
      }
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: ProviderPreset, keepName = false) => {
    setSelectedPresetKey(preset.key);
    setFormBaseUrl(preset.baseUrl || '');
    setFormModels(preset.models.map((model) => model.id));
    if (!keepName) setFormName(preset.label);
    setError('');
  };

  const openAddForm = () => {
    const firstPreset = getPresetsForType(activeTab)[0];
    setEditingProvider(null);
    setFormApiKey('');
    setCustomModel('');
    if (firstPreset) {
      applyPreset(firstPreset);
    } else {
      setSelectedPresetKey('');
      setFormName('');
      setFormBaseUrl('');
      setFormModels([]);
    }
    setShowForm(true);
  };

  const openEditForm = (provider: Provider) => {
    const preset = findPresetForProvider(provider.type, provider.baseUrl, provider.models);
    setEditingProvider(provider);
    setSelectedPresetKey(preset?.key || '');
    setFormName(provider.name);
    setFormApiKey(provider.apiKey);
    setFormBaseUrl(provider.baseUrl || preset?.baseUrl || '');
    setFormModels(normalizeProviderModels(provider.models));
    setCustomModel('');
    setError('');
    setShowForm(true);
  };

  const toggleModel = (modelId: string) => {
    setFormModels((prev) =>
      prev.includes(modelId) ? prev.filter((item) => item !== modelId) : [...prev, modelId]
    );
  };

  const addCustomModel = () => {
    const trimmed = customModel.trim();
    if (trimmed && !formModels.includes(trimmed)) {
      setFormModels((prev) => [...prev, trimmed]);
      setCustomModel('');
    }
  };

  const removeModel = (modelId: string) => {
    setFormModels((prev) => prev.filter((item) => item !== modelId));
  };

  const handleSave = async () => {
    if (!formName.trim() || !formApiKey.trim()) {
      setError('请填写供应商名称和 API Key');
      return;
    }
    if (formModels.length === 0) {
      setError('请至少选择或添加一个模型');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const effectiveBaseUrl = baseUrlEditable
        ? formBaseUrl.trim()
        : (selectedPreset?.baseUrl || formBaseUrl).trim();
      const body = {
        name: formName.trim(),
        type: editingProvider?.type || activeTab,
        apiKey: formApiKey.trim(),
        baseUrl: effectiveBaseUrl || undefined,
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
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || '保存失败');
      if (data?.provider) {
        const savedProvider = {
          ...data.provider,
          models: parseModels(data.provider.models),
        };
        setProviders((prev) => {
          const exists = prev.some((provider) => provider.id === savedProvider.id);
          return exists
            ? prev.map((provider) => (provider.id === savedProvider.id ? savedProvider : provider))
            : [savedProvider, ...prev];
        });
      }
      await fetchProviders();
      setEditingProvider(null);
      setShowForm(false);
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

  const openCopyForm = (provider: Provider) => {
    setCopyProvider(provider);
    setCopyTargetTypes([]);
    setCopyError('');
  };

  const toggleCopyTarget = (targetType: ProviderType) => {
    setCopyTargetTypes((prev) =>
      prev.includes(targetType)
        ? prev.filter((item) => item !== targetType)
        : [...prev, targetType]
    );
  };

  const handleCopyProvider = async () => {
    if (!copyProvider) return;
    if (copyTargetTypes.length === 0) {
      setCopyError('请选择至少一个目标模型');
      return;
    }

    setCopying(true);
    setCopyError('');
    try {
      for (const targetType of copyTargetTypes) {
        const body = buildCopiedProvider(copyProvider, targetType);
        const res = await fetch(`${API_BASE}/api/providers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.message || `复制到 ${getProviderTypeLabel(targetType)} 失败`);
        }
      }
      await fetchProviders();
      setCopyProvider(null);
      setCopyTargetTypes([]);
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : '复制失败');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <BackButton />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-pixel text-2xl text-pixel-black mb-2">供应商配置</h1>
        <p className="font-pixel text-sm text-pixel-black/60">
          先选择 Agent 平台，再从常用官方供应商卡片里创建可用的 API Key、Base URL 和模型集合。
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
        className="flex gap-2 mb-6 overflow-x-auto pb-2"
      >
        {PROVIDER_TYPES.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setShowForm(false);
            }}
            className={`px-4 py-2 border-4 font-pixel text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'border-pixel-black bg-pixel-yellow'
                : 'border-pixel-black/30 bg-pixel-white hover:bg-pixel-yellow/30'
            }`}
            style={{ boxShadow: activeTab === tab.key ? '3px 3px 0 #101010' : '2px 2px 0 #101010' }}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
        className="bg-pixel-white border-4 border-pixel-black p-6"
        style={{ boxShadow: '6px 6px 0 #101010' }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <div className="font-pixel text-sm text-pixel-black/60 flex items-center gap-2">
              <span>{getProviderTypeLabel(activeTab)} 供应商</span>
            </div>
            <p className="font-pixel text-xs text-pixel-black/40 mt-1">
              当前平台只能被对应类型的 Agent 选择，避免 Claude Code 误选 OpenClaw/Codex 配置。
            </p>
          </div>
          <PixelButton variant="primary" size="sm" onClick={openAddForm}>
            + 新增供应商
          </PixelButton>
        </div>

        {loading ? (
          <div className="text-center py-8 font-pixel text-pixel-black/50">加载中...</div>
        ) : tabProviders.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-pixel text-pixel-black/50 mb-4">
              还没有配置 {getProviderTypeLabel(activeTab)} 供应商
            </p>
            <PixelButton variant="primary" onClick={openAddForm}>添加第一个供应商</PixelButton>
          </div>
        ) : (
          <div className="space-y-3">
            {tabProviders.map((provider) => {
              const modelIds = normalizeProviderModels(provider.models);
              const preset = findPresetForProvider(provider.type, provider.baseUrl, provider.models);
              return (
                <div
                  key={provider.id}
                  className="border-4 border-pixel-black bg-pixel-cream p-4 flex flex-col sm:flex-row sm:items-start gap-4"
                  style={{ boxShadow: '4px 4px 0 #101010' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-pixel text-base font-bold">{provider.name}</span>
                      {preset && (
                        <span className="px-2 py-0.5 bg-pixel-black text-pixel-white font-pixel text-xs">
                          {preset.shortLabel}
                        </span>
                      )}
                      {provider.isDefault && (
                        <span className="px-2 py-0.5 bg-pixel-green text-pixel-white font-pixel text-xs">默认</span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-pixel-black/50 mb-2 truncate">
                      {maskKey(provider.apiKey)}
                    </div>
                    {provider.baseUrl && (
                      <div className="font-mono text-xs text-pixel-black/40 mb-2 truncate">
                        Base: {provider.baseUrl}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {modelIds.slice(0, 5).map((modelId) => (
                        <span
                          key={modelId}
                          className="px-2 py-0.5 bg-pixel-black/5 border border-pixel-black/20 font-mono text-xs"
                        >
                          {getModelDisplayName(modelId)}
                        </span>
                      ))}
                      {modelIds.length > 5 && (
                        <span className="px-2 py-0.5 bg-pixel-black/5 border border-pixel-black/20 font-mono text-xs">
                          +{modelIds.length - 5}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0 sm:justify-end">
                    <button
                      onClick={() => openCopyForm(provider)}
                      className="px-3 py-1.5 bg-pixel-blue border-2 border-pixel-black font-pixel text-xs text-pixel-white hover:bg-pixel-blue/80 transition-colors"
                      style={{ boxShadow: '2px 2px 0 #101010' }}
                    >
                      复制到其他模型
                    </button>
                    <button
                      onClick={() => openEditForm(provider)}
                      className="px-3 py-1.5 bg-pixel-yellow border-2 border-pixel-black font-pixel text-xs hover:bg-pixel-yellow/80 transition-colors"
                      style={{ boxShadow: '2px 2px 0 #101010' }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(provider.id)}
                      className="px-3 py-1.5 bg-pixel-red border-2 border-pixel-black font-pixel text-xs text-pixel-white hover:bg-pixel-red/80 transition-colors"
                      style={{ boxShadow: '2px 2px 0 #101010' }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {copyProvider && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-pixel-black/50 p-4"
          onClick={() => setCopyProvider(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-pixel-white border-8 border-pixel-black w-full max-w-lg"
            style={{ boxShadow: '8px 8px 0 #101010' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-pixel-blue border-b-4 border-pixel-black px-6 py-4 flex items-center justify-between">
              <h2 className="font-pixel text-lg text-pixel-white">复制到其他模型</h2>
              <button
                onClick={() => setCopyProvider(null)}
                className="font-pixel text-pixel-white hover:text-pixel-yellow text-2xl leading-none"
              >
                x
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="font-pixel text-sm text-pixel-black/70">
                将 {copyProvider.name} 的 API Key、Base URL 和模型配置复制到所选 Agent 类型。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PROVIDER_TYPES.filter((type) => type.key !== copyProvider.type).map((type) => (
                  <label
                    key={type.key}
                    className="flex items-center gap-2 border-4 border-pixel-black/25 px-3 py-2 cursor-pointer hover:border-pixel-black"
                  >
                    <input
                      type="checkbox"
                      checked={copyTargetTypes.includes(type.key)}
                      onChange={() => toggleCopyTarget(type.key)}
                      className="w-4 h-4"
                    />
                    <span className="font-pixel text-sm">{type.label}</span>
                  </label>
                ))}
              </div>
              {copyError && (
                <div className="bg-pixel-red/20 border-4 border-pixel-red px-4 py-2 font-pixel text-sm text-pixel-red">
                  {copyError}
                </div>
              )}
            </div>

            <div className="bg-pixel-white border-t-4 border-pixel-black px-6 py-4 flex gap-3 justify-end">
              <PixelButton variant="secondary" onClick={() => setCopyProvider(null)}>取消</PixelButton>
              <PixelButton variant="primary" onClick={handleCopyProvider} disabled={copying}>
                {copying ? '复制中...' : '复制'}
              </PixelButton>
            </div>
          </motion.div>
        </motion.div>
      )}

      {showForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-pixel-black/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-pixel-white border-8 border-pixel-black w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: '8px 8px 0 #101010' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-pixel-yellow border-b-4 border-pixel-black px-6 py-4 flex items-center justify-between">
              <h2 className="font-pixel text-xl text-pixel-black">
                {editingProvider ? '编辑供应商' : '新增供应商'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="font-pixel text-pixel-black hover:text-pixel-red text-2xl leading-none"
              >
                x
              </button>
            </div>

            <div className="p-6 space-y-5">
              <section>
                <label className="font-pixel text-xs text-pixel-black/60 mb-2 block">
                  常用供应商
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tabPresets.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => applyPreset(preset, Boolean(editingProvider))}
                      className={`text-left border-4 p-3 transition-colors ${
                        selectedPresetKey === preset.key
                          ? 'border-pixel-black bg-pixel-yellow/30'
                          : 'border-pixel-black/25 bg-pixel-white hover:border-pixel-black'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="font-pixel text-base font-bold">{preset.label}</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 bg-pixel-black/10">
                          {preset.protocol}
                        </span>
                      </div>
                      <p className="font-pixel text-xs text-pixel-black/55 leading-relaxed">
                        {preset.description}
                      </p>
                      {preset.baseUrl && (
                        <div className="font-mono text-[11px] text-pixel-black/45 mt-2 truncate">
                          {preset.baseUrl}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">供应商名称</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如：我的 Kimi Coding"
                  className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
                />
              </div>

              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">
                  {selectedPreset?.apiKeyField || 'API_KEY'}
                </label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder="输入 API Key"
                  className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
                />
                <div className="flex flex-wrap gap-3 mt-1">
                  {selectedPreset?.apiKeyUrl && (
                    <a
                      href={selectedPreset.apiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-pixel text-xs text-pixel-blue hover:underline"
                    >
                      获取 API Key
                    </a>
                  )}
                  {selectedPreset?.docsUrl && (
                    <a
                      href={selectedPreset.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-pixel text-xs text-pixel-blue hover:underline"
                    >
                      官方文档
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">
                  Base URL
                </label>
                <input
                  type="text"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  disabled={!baseUrlEditable}
                  placeholder={selectedPreset?.baseUrlHelp || 'https://api.example.com/v1'}
                  className={`w-full px-4 py-2 border-4 border-pixel-black font-mono text-sm ${
                    baseUrlEditable ? 'bg-pixel-white' : 'bg-pixel-black/5 text-pixel-black/55 cursor-not-allowed'
                  }`}
                />
                <p className="font-pixel text-xs text-pixel-black/40 mt-1">
                  {baseUrlEditable
                    ? selectedPreset?.baseUrlHelp || '按该供应商官方要求填写 Base URL。'
                    : '官方预设的 Base URL 已锁定，避免误改导致供应商不可用。'}
                </p>
              </div>

              <div>
                <label className="font-pixel text-xs text-pixel-black/60 mb-2 block">
                  支持的模型（可多选）
                </label>
                <div className="space-y-1 max-h-56 overflow-y-auto border-4 border-pixel-black/20 p-2">
                  {(selectedPreset?.models || []).length === 0 && (
                    <div className="font-pixel text-xs text-pixel-black/45 p-3 text-center">
                      该预设没有固定模型，请在下方添加模型 ID。
                    </div>
                  )}
                  {(selectedPreset?.models || []).map((model) => (
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
                      <span className="font-mono text-xs text-pixel-black/40 ml-auto truncate">
                        {model.id}
                      </span>
                    </label>
                  ))}

                  {formModels.filter((modelId) => !presetModelIds.has(modelId)).map((modelId) => (
                    <div
                      key={modelId}
                      className="flex items-center gap-2 px-3 py-2 border-2 border-pixel-yellow bg-pixel-yellow/10"
                    >
                      <span className="font-pixel text-sm text-pixel-black">{modelId}</span>
                      <button
                        type="button"
                        onClick={() => removeModel(modelId)}
                        className="ml-auto px-2 py-0.5 bg-pixel-red border border-pixel-black font-pixel text-xs text-pixel-white hover:bg-pixel-red/80"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomModel();
                      }
                    }}
                    placeholder="输入自定义模型 ID"
                    className="flex-1 px-3 py-2 border-4 border-pixel-black font-mono text-sm bg-pixel-white min-w-0"
                  />
                  <button
                    type="button"
                    onClick={addCustomModel}
                    className="px-4 py-2 bg-pixel-blue border-4 border-pixel-black font-pixel text-sm text-pixel-white hover:bg-pixel-blue/80 transition-colors"
                    style={{ boxShadow: '3px 3px 0 #101010' }}
                  >
                    添加
                  </button>
                </div>
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
