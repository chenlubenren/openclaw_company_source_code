'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { useAuthStore } from '@/store/useAuthStore';
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
import { API_BASE } from '@/lib/runtime';

interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string | null;
  models: unknown[];
  isDefault: boolean;
}

interface ProviderModalProps {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  editProvider?: Provider | null;
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

export function ProviderModal({ onClose, onSaved, editProvider }: ProviderModalProps) {
  const { token } = useAuthStore();
  const [type, setType] = useState<ProviderType>(editProvider?.type || 'claude');
  const presets = useMemo(() => getPresetsForType(type), [type]);
  const initialPreset = editProvider
    ? findPresetForProvider(editProvider.type, editProvider.baseUrl, editProvider.models)
    : presets[0];

  const [selectedPresetKey, setSelectedPresetKey] = useState(initialPreset?.key || '');
  const selectedPreset = getPresetByKey(selectedPresetKey) || presets[0];
  const baseUrlEditable = Boolean(selectedPreset?.isCustom);
  const presetModelIds = new Set((selectedPreset?.models || []).map((model) => model.id));

  const [name, setName] = useState(editProvider?.name || selectedPreset?.label || '');
  const [apiKey, setApiKey] = useState(editProvider?.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(editProvider?.baseUrl || selectedPreset?.baseUrl || '');
  const [selectedModels, setSelectedModels] = useState<string[]>(
    editProvider ? normalizeProviderModels(editProvider.models) : (selectedPreset?.models || []).map((model) => model.id)
  );
  const [customModel, setCustomModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const applyPreset = (preset: ProviderPreset, keepName = false) => {
    setSelectedPresetKey(preset.key);
    setBaseUrl(preset.baseUrl || '');
    setSelectedModels(preset.models.map((model) => model.id));
    if (!keepName) setName(preset.label);
  };

  const changeType = (nextType: ProviderType) => {
    setType(nextType);
    const firstPreset = getPresetsForType(nextType)[0];
    if (firstPreset) applyPreset(firstPreset);
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((item) => item !== modelId) : [...prev, modelId]
    );
  };

  const addCustomModel = () => {
    const trimmed = customModel.trim();
    if (trimmed && !selectedModels.includes(trimmed)) {
      setSelectedModels((prev) => [...prev, trimmed]);
      setCustomModel('');
    }
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
      const effectiveBaseUrl = baseUrlEditable
        ? baseUrl.trim()
        : (selectedPreset?.baseUrl || baseUrl).trim();
      const body = {
        name: name.trim(),
        type: editProvider?.type || type,
        apiKey: apiKey.trim(),
        baseUrl: effectiveBaseUrl || undefined,
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
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || '保存失败');
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
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
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden border-8 border-pixel-black bg-pixel-white"
          style={{ boxShadow: '8px 8px 0px 0px #101010' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b-4 border-pixel-black bg-pixel-yellow px-6 py-4">
            <h2 className="font-pixel text-xl text-pixel-black">
              {editProvider ? '编辑供应商' : '新增供应商'}
            </h2>
            <button onClick={onClose} className="font-pixel text-pixel-black hover:text-pixel-red text-2xl leading-none">
              x
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-2 block">Agent 平台</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {PROVIDER_TYPES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => changeType(item.key)}
                    disabled={Boolean(editProvider)}
                    className={`px-3 py-2 border-4 font-pixel text-xs transition-colors ${
                      type === item.key
                        ? 'border-pixel-black bg-pixel-yellow'
                        : 'border-pixel-black/30 bg-pixel-white hover:bg-pixel-yellow/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-2 block">常用供应商</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {presets.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset, Boolean(editProvider))}
                    className={`text-left border-4 p-3 transition-colors ${
                      selectedPresetKey === preset.key
                        ? 'border-pixel-black bg-pixel-yellow/30'
                        : 'border-pixel-black/25 bg-pixel-white hover:border-pixel-black'
                  }`}
                >
                  <div className="font-pixel text-base font-bold mb-1">{preset.label}</div>
                  <div className="font-pixel text-xs text-pixel-black/55">{preset.description}</div>
                    {preset.baseUrl && (
                      <div className="font-mono text-[11px] text-pixel-black/45 mt-2 truncate">
                        {preset.baseUrl}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">供应商名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我的 Kimi"
                className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
              />
            </div>

            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">
                {selectedPreset?.apiKeyField || 'API_KEY'}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 API Key"
                className="w-full px-4 py-2 border-4 border-pixel-black font-pixel bg-pixel-white"
              />
              <div className="flex flex-wrap gap-3 mt-1">
                {selectedPreset?.apiKeyUrl && (
                  <a href={selectedPreset.apiKeyUrl} target="_blank" rel="noopener noreferrer" className="font-pixel text-xs text-pixel-blue hover:underline">
                    获取 API Key
                  </a>
                )}
                {selectedPreset?.docsUrl && (
                  <a href={selectedPreset.docsUrl} target="_blank" rel="noopener noreferrer" className="font-pixel text-xs text-pixel-blue hover:underline">
                    官方文档
                  </a>
                )}
              </div>
            </div>

            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-1 block">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={!baseUrlEditable}
                placeholder={selectedPreset?.baseUrlHelp || 'https://api.example.com/v1'}
                className={`w-full px-4 py-2 border-4 border-pixel-black font-mono text-sm ${
                  baseUrlEditable ? 'bg-pixel-white' : 'bg-pixel-black/5 text-pixel-black/55 cursor-not-allowed'
                }`}
              />
              <p className="font-pixel text-xs text-pixel-black/40 mt-1">
                {baseUrlEditable
                  ? selectedPreset?.baseUrlHelp || '按供应商官方要求填写。'
                  : '官方预设的 Base URL 已锁定，避免误改导致供应商不可用。'}
              </p>
            </div>

            <div>
              <label className="font-pixel text-xs text-pixel-black/60 mb-2 block">支持的模型（可多选）</label>
              <div className="space-y-1 max-h-56 overflow-y-auto border-4 border-pixel-black/20 p-2">
                {(selectedPreset?.models || []).map((model) => (
                  <label key={model.id} className="flex items-center gap-2 px-3 py-2 border-2 border-pixel-black/20 hover:border-pixel-black cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(model.id)}
                      onChange={() => toggleModel(model.id)}
                      className="w-4 h-4"
                    />
                    <span className="font-pixel text-sm">{model.name}</span>
                    <span className="font-mono text-xs text-pixel-black/40 ml-auto truncate">{model.id}</span>
                  </label>
                ))}
                {selectedModels.filter((modelId) => !presetModelIds.has(modelId)).map((modelId) => (
                  <div key={modelId} className="flex items-center gap-2 px-3 py-2 border-2 border-pixel-yellow bg-pixel-yellow/10">
                    <span className="font-pixel text-sm text-pixel-black">{modelId}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedModels((prev) => prev.filter((item) => item !== modelId))}
                      className="ml-auto px-2 py-0.5 bg-pixel-red border border-pixel-black font-pixel text-xs text-pixel-white"
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
                  className="flex-1 min-w-0 px-3 py-2 border-4 border-pixel-black font-mono text-sm bg-pixel-white"
                />
                <button
                  type="button"
                  onClick={addCustomModel}
                  className="px-4 py-2 bg-pixel-blue border-4 border-pixel-black font-pixel text-sm text-pixel-white"
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

          <div className="flex shrink-0 gap-3 justify-end border-t-4 border-pixel-black bg-pixel-white px-6 py-4">
            <PixelButton variant="secondary" onClick={onClose}>取消</PixelButton>
            <PixelButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </PixelButton>
          </div>
        </motion.div>
      </motion.div>
      </ModalPortal>
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
  const [copyProvider, setCopyProvider] = useState<Provider | null>(null);
  const [copyTargetTypes, setCopyTargetTypes] = useState<ProviderType[]>([]);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');

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

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个供应商吗？')) return;
    setDeletingId(id);
    try {
      await fetch(`${API_BASE}/api/providers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setProviders((prev) => prev.filter((provider) => provider.id !== id));
    } finally {
      setDeletingId(null);
    }
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
    <AnimatePresence>
      <ModalPortal>
        <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-pixel-black/50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden border-8 border-pixel-black bg-pixel-white"
          style={{ boxShadow: '8px 8px 0px 0px #101010' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b-4 border-pixel-black bg-pixel-yellow px-6 py-4">
            <h2 className="font-pixel text-xl text-pixel-black">供应商配置</h2>
            <div className="flex items-center gap-2">
              <PixelButton variant="primary" size="sm" onClick={() => { setEditProvider(null); setShowAdd(true); }}>
                + 新增
              </PixelButton>
              <button onClick={onClose} className="font-pixel text-pixel-black hover:text-pixel-red text-2xl leading-none">
                x
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="text-center py-8 font-pixel text-pixel-black/50">加载中...</div>
            ) : providers.length === 0 ? (
              <div className="text-center py-8">
                <p className="font-pixel text-pixel-black/50 mb-3">还没有配置供应商</p>
                <PixelButton variant="primary" onClick={() => setShowAdd(true)}>添加第一个供应商</PixelButton>
              </div>
            ) : (
              <div className="space-y-3">
                {PROVIDER_TYPES.map((type) => {
                  const typeProviders = providers.filter((provider) => provider.type === type.key);
                  if (typeProviders.length === 0) return null;
                  return (
                    <div key={type.key}>
                      <h3 className="font-pixel text-sm text-pixel-black/60 border-b-2 border-pixel-black/20 pb-1 mb-2 flex items-center gap-2">
                        {getProviderTypeLabel(type.key)}
                      </h3>
                      <div className="space-y-2">
                        {typeProviders.map((provider) => {
                          const modelIds = normalizeProviderModels(provider.models);
                          return (
                            <div key={provider.id} className="border-4 border-pixel-black bg-pixel-white p-3 flex flex-col sm:flex-row sm:items-start gap-3" style={{ boxShadow: '3px 3px 0px 0px #101010' }}>
                              <div className="flex-1 min-w-0">
                                <div className="font-pixel text-sm font-bold">{provider.name}</div>
                                <div className="font-mono text-xs text-pixel-black/50 mt-1 truncate">
                                  {maskKey(provider.apiKey)}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {modelIds.slice(0, 3).map((modelId) => (
                                    <span key={modelId} className="px-2 py-0.5 bg-pixel-black/5 border border-pixel-black/20 font-mono text-xs">
                                      {getModelDisplayName(modelId)}
                                    </span>
                                  ))}
                                  {modelIds.length > 3 && (
                                    <span className="px-2 py-0.5 bg-pixel-black/5 border border-pixel-black/20 font-mono text-xs">
                                      +{modelIds.length - 3}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1 sm:justify-end">
                                <button onClick={() => openCopyForm(provider)} className="px-2 py-1 bg-pixel-blue border-2 border-pixel-black font-pixel text-xs text-pixel-white" style={{ boxShadow: '2px 2px 0 #101010' }}>复制到其他模型</button>
                                <button onClick={() => { setEditProvider(provider); setShowAdd(true); }} className="px-2 py-1 bg-pixel-yellow border-2 border-pixel-black font-pixel text-xs" style={{ boxShadow: '2px 2px 0 #101010' }}>编辑</button>
                                <button onClick={() => handleDelete(provider.id)} disabled={deletingId === provider.id} className="px-2 py-1 bg-pixel-red border-2 border-pixel-black font-pixel text-xs text-pixel-white disabled:opacity-50" style={{ boxShadow: '2px 2px 0 #101010' }}>删除</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
      </ModalPortal>

      {copyProvider && (
        <ModalPortal>
          <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[210] flex items-center justify-center overflow-y-auto bg-pixel-black/50 p-4"
          onClick={() => setCopyProvider(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden border-8 border-pixel-black bg-pixel-white"
            style={{ boxShadow: '8px 8px 0px 0px #101010' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b-4 border-pixel-black bg-pixel-blue px-6 py-4">
              <h2 className="font-pixel text-lg text-pixel-white">复制到其他模型</h2>
              <button onClick={() => setCopyProvider(null)} className="font-pixel text-pixel-white hover:text-pixel-yellow text-2xl leading-none">
                x
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              <p className="font-pixel text-sm text-pixel-black/70">
                将 {copyProvider.name} 的 API Key、Base URL 和模型配置复制到所选 Agent 类型。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PROVIDER_TYPES.filter((type) => type.key !== copyProvider.type).map((type) => (
                  <label key={type.key} className="flex items-center gap-2 border-4 border-pixel-black/25 px-3 py-2 cursor-pointer hover:border-pixel-black">
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

            <div className="flex shrink-0 gap-3 justify-end border-t-4 border-pixel-black bg-pixel-white px-6 py-4">
              <PixelButton variant="secondary" onClick={() => setCopyProvider(null)}>取消</PixelButton>
              <PixelButton variant="primary" onClick={handleCopyProvider} disabled={copying}>
                {copying ? '复制中...' : '复制'}
              </PixelButton>
            </div>
          </motion.div>
          </motion.div>
        </ModalPortal>
      )}

      {showAdd && (
        <ProviderModal
          editProvider={editProvider}
          onClose={() => {
            setShowAdd(false);
            setEditProvider(null);
          }}
          onSaved={fetchProviders}
        />
      )}
    </AnimatePresence>
  );
}
