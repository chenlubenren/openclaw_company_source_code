'use client';

import { useEffect, useState } from 'react';
import {
  fetchFeishuWebhookInfo,
  getFeishuConfig,
  saveFeishuConfig,
  deleteFeishuConfig,
  type FeishuIntegrationScope,
  type FeishuWebhookInfo,
  type FeishuConfig,
} from '@/lib/api';

interface FeishuIntegrationCardProps {
  subjectId: string;
  subjectName?: string;
  scope: FeishuIntegrationScope;
  compact?: boolean;
}

const FEISHU_DOC_URL = 'https://open.feishu.cn/document/client-docs/bot-v3/bot-overview?lang=zh-CN';

export function FeishuIntegrationCard({
  subjectId,
  subjectName,
  scope,
  compact = false,
}: FeishuIntegrationCardProps) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<FeishuWebhookInfo | null>(null);
  const [config, setConfig] = useState<FeishuConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState('');

  const [form, setForm] = useState({
    appId: '',
    appSecret: '',
    chatId: '',
  });

  const scopeLabel = scope === 'team' ? '团队' : 'Agent';
  const displayName = info?.subjectName || subjectName || scopeLabel;
  const isConfigured = Boolean(config?.appId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [webhookInfo, feishuConfig] = await Promise.all([
          fetchFeishuWebhookInfo(scope, subjectId),
          getFeishuConfig(scope, subjectId).catch(() => null),
        ]);
        if (cancelled) return;
        setInfo(webhookInfo);
        setConfig(feishuConfig);
        if (feishuConfig) {
          setForm({
            appId: feishuConfig.appId || '',
            appSecret: '',
            chatId: feishuConfig.chatId || '',
          });
        } else {
          setForm({ appId: '', appSecret: '', chatId: '' });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载飞书配置失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, scope, subjectId]);

  async function handleSave() {
    if (!form.appId.trim() || !form.appSecret.trim()) {
      setError('App ID 和 App Secret 为必填项');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await saveFeishuConfig(scope, subjectId, {
        appId: form.appId.trim(),
        appSecret: form.appSecret.trim(),
        chatId: form.chatId.trim() || undefined,
      });
      setSuccess('配置已保存');
      const fresh = await getFeishuConfig(scope, subjectId).catch(() => null);
      setConfig(fresh);
      if (fresh) {
        setForm({
          appId: fresh.appId || '',
          appSecret: '',
          chatId: fresh.chatId || '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('确定要删除该飞书配置吗？删除后该 Agent/团队将不再接收飞书消息。')) return;
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      await deleteFeishuConfig(scope, subjectId);
      setConfig(null);
      setForm({ appId: '', appSecret: '', chatId: '' });
      setSuccess('配置已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  async function copyText(label: string, text?: string) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!fallbackCopyText(text)) {
        throw new Error('Clipboard API unavailable');
      }
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  }

  return (
    <>
      <section
        className={`border-4 border-pixel-black bg-pixel-white ${compact ? 'p-3' : 'p-4'}`}
        style={{ boxShadow: compact ? '4px 4px 0px 0px #101010' : '6px 6px 0px 0px #101010' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-pixel text-sm text-pixel-black">飞书远程对话</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`border-2 border-pixel-black px-2 py-0.5 font-pixel text-[10px] ${
                  isConfigured ? 'bg-pixel-green text-pixel-white' : 'bg-pixel-yellow text-pixel-black'
                }`}
              >
                {isConfigured ? '已配置' : '未配置'}
              </span>
              <span className="truncate font-pixel text-xs text-pixel-black/60">{displayName}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setError('');
              setSuccess('');
            }}
            className="shrink-0 border-2 border-pixel-black bg-pixel-blue px-3 py-2 font-pixel text-xs text-pixel-white hover:brightness-95"
            style={{ boxShadow: '3px 3px 0px 0px #101010' }}
          >
            {isConfigured ? '管理配置' : '接入飞书'}
          </button>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-pixel-black/45 px-4 py-6">
          <div
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border-4 border-pixel-black bg-pixel-white"
            style={{ boxShadow: '8px 8px 0px 0px #101010' }}
          >
            <div className="border-b-4 border-pixel-black px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="chinese-large text-2xl text-pixel-black">飞书接入配置</h2>
                  <p className="mt-1 font-pixel text-sm text-pixel-black/60">
                    将 {displayName} 接入飞书，实现远程对话
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 w-10 shrink-0 border-2 border-pixel-black bg-pixel-white font-pixel text-xl leading-none text-pixel-black hover:bg-pixel-yellow"
                  aria-label="关闭"
                >
                  X
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-5 py-5">
              {loading && (
                <div className="border-4 border-pixel-black bg-pixel-black/5 p-4 font-pixel text-sm text-pixel-black/60">
                  正在加载...
                </div>
              )}

              {error && (
                <div className="mb-4 border-4 border-pixel-red bg-pixel-red/10 p-4 font-pixel text-sm text-pixel-red">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 border-4 border-pixel-green bg-pixel-green/10 p-4 font-pixel text-sm text-pixel-green">
                  {success}
                </div>
              )}

              {!loading && (
                <div className="space-y-5">
                  {/* Config Form */}
                  <div className="space-y-3">
                    <h3 className="font-pixel text-sm font-bold text-pixel-black">应用凭证</h3>
                    <p className="font-pixel text-xs text-pixel-black/60">
                      每个 {scopeLabel} 使用独立的飞书自建应用凭证，互不影响。
                    </p>

                    <InputField
                      label="App ID"
                      value={form.appId}
                      onChange={(v) => setForm((s) => ({ ...s, appId: v }))}
                      placeholder="cli_xxxxxxxxxxxxxxxx"
                      required
                    />

                    <InputField
                      label="App Secret"
                      value={form.appSecret}
                      onChange={(v) => setForm((s) => ({ ...s, appSecret: v }))}
                      placeholder={isConfigured ? '留空表示不修改' : 'xxxxxxxxxxxxxxxx'}
                      type="password"
                      required={!isConfigured}
                    />

                    <InputField
                      label="群聊 ID（可选）"
                      value={form.chatId}
                      onChange={(v) => setForm((s) => ({ ...s, chatId: v }))}
                      placeholder="仅监听指定群聊的消息，留空则接收所有消息"
                    />

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="border-2 border-pixel-black bg-pixel-black px-5 py-2 font-pixel text-sm text-pixel-white disabled:opacity-50"
                        style={{ boxShadow: '3px 3px 0px 0px #101010' }}
                      >
                        {saving ? '保存中...' : isConfigured ? '更新配置' : '保存配置'}
                      </button>

                      {isConfigured && (
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleting}
                          className="border-2 border-pixel-red bg-pixel-red px-5 py-2 font-pixel text-sm text-pixel-white disabled:opacity-50"
                        >
                          {deleting ? '删除中...' : '删除配置'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Webhook Info */}
                  {isConfigured && info && (
                    <div className="space-y-3 border-t-4 border-pixel-black pt-5">
                      <h3 className="font-pixel text-sm font-bold text-pixel-black">Webhook 地址</h3>

                      <div className="border-4 border-pixel-black bg-pixel-white p-4">
                        <div className="flex flex-col gap-3">
                          <div className="break-all rounded border-2 border-pixel-black bg-pixel-black/5 px-3 py-2 font-mono text-xs leading-relaxed text-pixel-black">
                            {info.webhookUrl}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => copyText('webhook', info.webhookUrl)}
                              disabled={!info.webhookUrl}
                              className="border-2 border-pixel-black bg-pixel-yellow px-4 py-2 font-pixel text-xs text-pixel-black disabled:opacity-40"
                            >
                              {copied === 'webhook' ? '已复制' : '复制地址'}
                            </button>
                          </div>
                        </div>
                        {!info.envStatus.publicBackendConfigured && (
                          <p className="mt-3 font-pixel text-xs leading-relaxed text-pixel-red">
                            当前地址使用 localhost。飞书云端无法直接访问本机，请使用公网 IP/域名或临时内网穿透暴露后端，并在 backend/.env 设置 FEISHU_PUBLIC_BASE_URL，例如 http://121.40.242.77。
                          </p>
                        )}
                      </div>

                      <div className="border-4 border-pixel-black bg-pixel-black/5 p-4 font-pixel text-xs leading-relaxed text-pixel-black/75">
                        <p className="mb-2 font-bold">配置步骤：</p>
                        <ol className="list-decimal space-y-1 pl-4">
                          <li>进入飞书开放平台，创建企业自建应用。</li>
                          <li>在「事件与回调」→「请求地址配置」中粘贴上面的 Webhook 地址并完成 URL 验证。</li>
                          <li>订阅事件：im.message.receive_v1。</li>
                          <li>在「权限管理」中开通 im:message 权限。</li>
                          <li>发布应用后，即可在单聊或群聊 @机器人进行对话。</li>
                        </ol>
                      </div>
                    </div>
                  )}

                  {!isConfigured && (
                    <div className="border-4 border-pixel-yellow bg-pixel-yellow/20 p-4 font-pixel text-sm text-pixel-black/75">
                      请先填写并保存飞书应用凭证，保存后会生成 Webhook 地址和配置指引。
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t-4 border-pixel-black bg-pixel-black/5 px-5 py-4">
              <a
                href={FEISHU_DOC_URL}
                target="_blank"
                rel="noreferrer"
                className="font-pixel text-xs text-pixel-blue underline"
              >
                飞书机器人官方文档
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-2 border-pixel-black bg-pixel-white px-5 py-2 font-pixel text-sm text-pixel-black"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block font-pixel text-xs text-pixel-black/70">
        {label}
        {required && <span className="text-pixel-red"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border-2 border-pixel-black bg-pixel-white px-3 py-2 font-mono text-xs text-pixel-black outline-none focus:border-pixel-blue"
      />
    </div>
  );
}

function fallbackCopyText(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
