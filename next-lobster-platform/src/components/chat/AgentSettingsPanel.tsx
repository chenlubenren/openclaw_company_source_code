'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';

interface Provider {
  id: string;
  name: string;
  type: string;
  apiKey: string;
  models: string[];
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
}

interface AgentSettingsPanelProps {
  agent: Agent;
  token: string;
  onClose: () => void;
  onAgentUpdate?: (updatedAgent: Agent) => void;
}

const API_BASE = 'http://localhost:3002';

export function AgentSettingsPanel({ agent, token, onClose, onAgentUpdate }: AgentSettingsPanelProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(agent.providerId || undefined);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    } catch (e) {
      console.error('Failed to fetch providers:', e);
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          providerId: selectedProviderId || null,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);

        if (onAgentUpdate) {
          onAgentUpdate({ ...agent, providerId: selectedProviderId || undefined });
        }
      }
    } catch (e) {
      console.error('Failed to save config:', e);
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
                暂无可用供应商
              </div>
            ) : (
              <>
                <label className="flex items-center gap-3 p-3 border-4 border-pixel-black cursor-pointer transition-colors bg-pixel-cream">
                  <input
                    type="radio"
                    name="provider"
                    value=""
                    checked={!selectedProviderId}
                    onChange={() => setSelectedProviderId(undefined)}
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
                      onChange={() => setSelectedProviderId(provider.id)}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-pixel text-sm">{provider.name}</div>
                      <div className="font-pixel text-xs text-pixel-black/50">
                        {provider.type} · {provider.models?.length || 0} 个模型
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
          className="w-full"
        >
          {saving ? '保存中...' : saved ? '✓ 已保存' : '保存设置'}
        </PixelButton>
      </div>
    </div>
  );
}
