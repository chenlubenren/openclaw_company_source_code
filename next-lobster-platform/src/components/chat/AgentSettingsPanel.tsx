'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { FeishuIntegrationCard } from '@/components/integration/FeishuIntegrationCard';
import { getModelDisplayName, normalizeProviderModels } from '@/lib/providerPresets';

interface Provider {
  id: string;
  name: string;
  type: string;
  apiKey: string;
  models: unknown[];
}

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar: string;
  status: 'idle' | 'busy' | 'error' | 'offline';
  platform?: string;
  workspacePath: string;
  providerId?: string | null;
  config?: {
    model?: string;
    [key: string]: unknown;
  };
}

interface AgentSettingsPanelProps {
  agent: Agent;
  token: string;
  onClose: () => void;
  onAgentUpdate?: (updatedAgent: Agent) => void;
}

const API_BASE = 'http://localhost:3002';

const PLATFORM_TO_PROVIDER_TYPE: Record<string, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  hermes: 'hermes',
  opencode: 'opencode',
  openclaw: 'openclaw',
};

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  opencode: 'OpenCode',
  openclaw: 'OpenClaw',
};

export function AgentSettingsPanel({ agent, token, onClose, onAgentUpdate }: AgentSettingsPanelProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(agent.providerId || undefined);
  const [selectedModel, setSelectedModel] = useState(agent.config?.model || '');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const providerType = PLATFORM_TO_PROVIDER_TYPE[agent.platform || ''] || 'openclaw';
  const providerTypeLabel = PROVIDER_TYPE_LABELS[providerType] || providerType;
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId]
  );
  const selectedProviderModelIds = useMemo(
    () => normalizeProviderModels(selectedProvider?.models || []),
    [selectedProvider]
  );

  useEffect(() => {
    fetchProviders();
  }, [agent.id, providerType]);

  useEffect(() => {
    setSelectedProviderId(agent.providerId || undefined);
    setSelectedModel(agent.config?.model || '');
  }, [agent.id, agent.providerId, agent.config?.model]);

  useEffect(() => {
    if (!loadingProviders && selectedProviderId && !providers.some(p => p.id === selectedProviderId)) {
      setSelectedProviderId(undefined);
      setSelectedModel('');
    }
  }, [loadingProviders, providers, selectedProviderId]);

  useEffect(() => {
    if (!selectedProviderId) {
      setSelectedModel('');
      return;
    }

    if (selectedProviderModelIds.length > 0 && !selectedProviderModelIds.includes(selectedModel)) {
      setSelectedModel(selectedProviderModelIds[0]);
    }
  }, [selectedProviderId, selectedProviderModelIds, selectedModel]);

  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch(`${API_BASE}/api/providers?type=${encodeURIComponent(providerType)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers.map((p: any) => ({
          ...p,
          models: parseModels(p.models),
        })));
      }
    } catch (e) {
      console.error('Failed to fetch providers:', e);
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleSave = async () => {
    if (selectedProviderId && selectedProviderModelIds.length > 0 && !selectedModel) {
      setError('请选择一个模型');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          providerId: selectedProviderId || null,
          model: selectedProviderId ? selectedModel : '',
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || '保存配置失败');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      if (onAgentUpdate) {
        onAgentUpdate(data?.agent || {
          ...agent,
          providerId: selectedProviderId || undefined,
          config: {
            ...(agent.config || {}),
            model: selectedProviderId ? selectedModel : undefined,
          },
        });
      }
    } catch (e) {
      console.error('Failed to save config:', e);
      setError(e instanceof Error ? e.message : '保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b-4 border-pixel-black bg-pixel-black/5">
        <div className="flex items-center justify-between">
          <h2 className="font-pixel text-lg flex items-center gap-2">
            <span>⚙️</span> Agent 设置
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border-2 border-pixel-black bg-pixel-white hover:bg-pixel-black/10 font-pixel"
          >
            ✕
          </button>
        </div>
        <p className="font-pixel text-xs text-pixel-black/60 mt-1">
          选择供应商后 Agent 将使用该供应商的 API Key 运行
        </p>
      </div>

      {/* Content - Only Provider Selection */}
      <div className="flex-1 overflow-y-auto p-4">
        <section>
          <h3 className="font-pixel text-sm mb-3 flex items-center gap-2">
            <span>🔗</span> 供应商
          </h3>
          <div className="bg-pixel-white p-4 border-4 border-pixel-black space-y-2">
            {loadingProviders ? (
              <div className="font-pixel text-sm text-pixel-black/50">加载中...</div>
            ) : providers.length === 0 ? (
              <div className="font-pixel text-sm text-pixel-black/50 text-center py-4">
                暂无可用 {providerTypeLabel} 供应商
              </div>
            ) : (
              <>
                <label className="flex items-center gap-3 p-3 border-4 border-pixel-black cursor-pointer transition-colors bg-pixel-cream">
                  <input
                    type="radio"
                    name="provider"
                    value=""
                    checked={!selectedProviderId}
                    onChange={() => {
                      setSelectedProviderId(undefined);
                      setSelectedModel('');
                    }}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="font-pixel text-sm">不使用供应商</div>
                    <div className="font-pixel text-xs text-pixel-black/50">使用系统默认配置</div>
                  </div>
                </label>
                {providers.map((provider) => (
                  <label
                    key={provider.id}
                    className={`flex items-center gap-3 p-3 border-4 border-pixel-black cursor-pointer transition-colors ${
                      selectedProviderId === provider.id
                        ? 'bg-pixel-yellow/30'
                        : 'bg-pixel-white hover:bg-pixel-black/5'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={provider.id}
                      checked={selectedProviderId === provider.id}
                      onChange={() => {
                        const modelIds = normalizeProviderModels(provider.models);
                        setSelectedProviderId(provider.id);
                        setSelectedModel(modelIds[0] || '');
                      }}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-pixel text-sm">{provider.name}</div>
                      <div className="font-pixel text-xs text-pixel-black/50">
                        {providerTypeLabel} · {provider.models?.length || 0} 个模型
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-pixel-black/10 font-mono">
                      {provider.apiKey.substring(0, 8)}...
                    </span>
                  </label>
                ))}
              </>
            )}
          </div>
        </section>

        {selectedProviderId && (
          <section className="mt-4">
            <h3 className="font-pixel text-sm mb-3 flex items-center gap-2">
              <span>▣</span> 模型
            </h3>
            <div className="bg-pixel-white p-4 border-4 border-pixel-black space-y-2">
              {selectedProviderModelIds.length === 0 ? (
                <div className="font-pixel text-sm text-pixel-black/50 text-center py-3">
                  当前供应商没有配置模型，请先到供应商配置页添加模型
                </div>
              ) : (
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className="w-full border-4 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-sm text-pixel-black"
                >
                  {selectedProviderModelIds.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {getModelDisplayName(modelId)}
                    </option>
                  ))}
                </select>
              )}
              {selectedProvider && (
                <p className="font-pixel text-xs text-pixel-black/50">
                  将使用 {selectedProvider.name} 的 API Key 与模型配置。
                </p>
              )}
            </div>
          </section>
        )}

        <div className="mt-4">
          <FeishuIntegrationCard
            scope="agent"
            subjectId={agent.id}
            subjectName={agent.name}
          />
        </div>

        {error && (
          <div className="mt-4 bg-pixel-red/20 border-4 border-pixel-red px-4 py-2 font-pixel text-sm text-pixel-red">
            {error}
          </div>
        )}

        <a
          href="/settings/providers"
          target="_blank"
          className="font-pixel text-xs text-pixel-blue hover:underline flex items-center gap-1 mt-4"
        >
          <span>→</span> 管理供应商
        </a>
      </div>

      {/* Footer */}
      <div className="p-4 border-t-4 border-pixel-black bg-pixel-black/5">
        <PixelButton
          onClick={handleSave}
          disabled={saving}
          variant="primary"
          className="h-12 w-full"
        >
          {saving ? '保存中...' : saved ? '✓ 已保存' : '保存设置'}
        </PixelButton>
      </div>
    </div>
  );
}

function parseModels(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
