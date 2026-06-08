'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchFeishuWebhookInfo,
  type FeishuIntegrationScope,
  type FeishuWebhookInfo,
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
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<FeishuWebhookInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const scopeLabel = scope === 'team' ? '团队' : 'Agent';
  const displayName = info?.subjectName || subjectName || scopeLabel;
  const ready = Boolean(info?.envStatus.appIdConfigured && info?.envStatus.appSecretConfigured);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    setError('');
    fetchFeishuWebhookInfo(scope, subjectId)
      .then((nextInfo) => {
        if (!cancelled) setInfo(nextInfo);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : '获取飞书接入信息失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, scope, subjectId]);

  const envExample = useMemo(() => {
    return [
      'FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx',
      'FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx',
      'FEISHU_VERIFICATION_TOKEN=和飞书后台填写的 Verification Token 保持一致',
      'FEISHU_WEBHOOK_SECRET=任意长随机字符串，用于生成每个 Agent/团队的回调 token',
      'FEISHU_PUBLIC_BASE_URL=https://你的公网后端域名',
    ].join('\n');
  }, []);

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
      if (fallbackCopyText(text)) {
        setCopied(label);
        window.setTimeout(() => setCopied(''), 1600);
      } else {
        setCopied('');
      }
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
              <span className="border-2 border-pixel-black bg-pixel-yellow px-2 py-0.5 font-pixel text-[10px] text-pixel-black">
                指引配置
              </span>
              <span className="truncate font-pixel text-xs text-pixel-black/60">
                {displayName}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setStep(0);
            }}
            className="shrink-0 border-2 border-pixel-black bg-pixel-blue px-3 py-2 font-pixel text-xs text-pixel-white hover:brightness-95"
            style={{ boxShadow: '3px 3px 0px 0px #101010' }}
          >
            接入飞书
          </button>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-pixel-black/45 px-4 py-6">
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden border-4 border-pixel-black bg-pixel-white"
            style={{ boxShadow: '8px 8px 0px 0px #101010' }}
          >
            <div className="border-b-4 border-pixel-black px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="chinese-large text-2xl text-pixel-black">接入飞书机器人</h2>
                  <p className="mt-1 font-pixel text-sm text-pixel-black/60">
                    将 {displayName} 部署为飞书企业自建应用机器人，用于远程对话
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
              <div className="grid gap-3 md:grid-cols-3">
                {['创建应用', '配置凭证', '事件订阅'].map((title, index) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => setStep(index)}
                    className={`border-4 px-4 py-3 text-center font-pixel ${
                      step === index
                        ? 'border-pixel-black bg-pixel-yellow text-pixel-black'
                        : 'border-pixel-black/15 bg-pixel-white text-pixel-black/50'
                    }`}
                  >
                    <span className="block text-sm">{index + 1}. {title}</span>
                    <span className="mt-1 block text-xs">
                      {index === 0 ? '飞书开发者后台' : index === 1 ? 'App ID / Secret' : 'Webhook 地址'}
                    </span>
                  </button>
                ))}
              </div>

              {loading && (
                <div className="mt-5 border-4 border-pixel-black bg-pixel-black/5 p-4 font-pixel text-sm text-pixel-black/60">
                  正在读取后端飞书接入信息...
                </div>
              )}

              {error && (
                <div className="mt-5 border-4 border-pixel-red bg-pixel-red/10 p-4 font-pixel text-sm text-pixel-red">
                  {error}
                </div>
              )}

              {!loading && !error && (
                <div className="mt-5">
                  {step === 0 && <CreateAppStep subjectName={displayName} />}
                  {step === 1 && (
                    <CredentialStep
                      info={info}
                      envExample={envExample}
                      copied={copied}
                      onCopy={(text) => copyText('env', text)}
                    />
                  )}
                  {step === 2 && (
                    <EventStep
                      info={info}
                      copied={copied}
                      ready={ready}
                      onCopyWebhook={() => copyText('webhook', info?.webhookUrl)}
                    />
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
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep((value) => Math.max(0, value - 1))}
                  disabled={step === 0}
                  className="border-2 border-pixel-black bg-pixel-white px-4 py-2 font-pixel text-sm text-pixel-black disabled:opacity-40"
                >
                  上一步
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (step < 2) {
                      setStep((value) => value + 1);
                    } else {
                      setOpen(false);
                    }
                  }}
                  className="border-2 border-pixel-black bg-pixel-black px-5 py-2 font-pixel text-sm text-pixel-white"
                  style={{ boxShadow: '3px 3px 0px 0px #101010' }}
                >
                  {step < 2 ? '下一步' : '完成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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

function CreateAppStep({ subjectName }: { subjectName: string }) {
  return (
    <div className="space-y-4">
      <div className="border-4 border-pixel-black bg-pixel-black/5 p-4">
        <p className="font-pixel text-sm font-bold text-pixel-black">前置步骤</p>
        <ol className="mt-3 space-y-2 font-pixel text-sm leading-relaxed text-pixel-black/75">
          <li>1. 进入飞书开放平台，创建企业自建应用。</li>
          <li>2. 应用名称建议填写 “{subjectName}”，并开启机器人能力。</li>
          <li>3. 在「权限管理」中开通 `im:message`、`im:chat:readonly` 权限。</li>
          <li>4. 在「版本管理与发布」中创建版本，并提交发布。</li>
        </ol>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <InfoLine label="应用类型" value="企业自建应用机器人" />
        <InfoLine label="消息入口" value="单聊消息 / 群聊 @机器人消息" />
      </div>
    </div>
  );
}

function CredentialStep({
  info,
  envExample,
  copied,
  onCopy,
}: {
  info: FeishuWebhookInfo | null;
  envExample: string;
  copied: string;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <EnvStatus label="FEISHU_APP_ID" configured={Boolean(info?.envStatus.appIdConfigured)} />
        <EnvStatus label="FEISHU_APP_SECRET" configured={Boolean(info?.envStatus.appSecretConfigured)} />
        <EnvStatus label="FEISHU_VERIFICATION_TOKEN" configured={Boolean(info?.envStatus.verificationTokenConfigured)} optional />
        <EnvStatus label="FEISHU_WEBHOOK_SECRET" configured={Boolean(info?.envStatus.webhookSecretConfigured)} optional />
      </div>

      <div className="border-4 border-pixel-black bg-pixel-white p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-pixel text-sm font-bold text-pixel-black">backend/.env 示例</p>
          <button
            type="button"
            onClick={() => onCopy(envExample)}
            className="border-2 border-pixel-black bg-pixel-yellow px-3 py-1 font-pixel text-xs text-pixel-black"
          >
            {copied === 'env' ? '已复制' : '复制'}
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap border-2 border-pixel-black bg-pixel-black p-3 font-mono text-xs leading-relaxed text-pixel-white">
          {envExample}
        </pre>
      </div>

      <div className="border-4 border-pixel-black bg-pixel-yellow/40 p-4 font-pixel text-sm leading-relaxed text-pixel-black/75">
        App Secret 只应放在后端环境变量中。Encrypt Key 请在飞书后台留空；当前回调服务按明文事件接收，已支持 URL challenge 与 Verification Token 校验。
      </div>
    </div>
  );
}

function EventStep({
  info,
  copied,
  ready,
  onCopyWebhook,
}: {
  info: FeishuWebhookInfo | null;
  copied: string;
  ready: boolean;
  onCopyWebhook: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="border-4 border-pixel-black bg-pixel-white p-4">
        <p className="mb-2 font-pixel text-sm font-bold text-pixel-black">Webhook 地址</p>
        <div className="flex flex-col gap-2 md:flex-row">
          <code className="min-w-0 flex-1 overflow-x-auto border-2 border-pixel-black bg-pixel-black/5 px-3 py-2 font-mono text-xs text-pixel-black">
            {info?.webhookUrl || '等待后端生成...'}
          </code>
          <button
            type="button"
            onClick={onCopyWebhook}
            disabled={!info?.webhookUrl}
            className="border-2 border-pixel-black bg-pixel-yellow px-4 py-2 font-pixel text-xs text-pixel-black disabled:opacity-40"
          >
            {copied === 'webhook' ? '已复制' : '复制'}
          </button>
        </div>
        {!info?.envStatus.publicBackendConfigured && (
          <p className="mt-3 font-pixel text-xs leading-relaxed text-pixel-red">
            当前地址使用 localhost。飞书云端无法直接访问本机，请部署后端或通过 HTTPS 内网穿透设置 FEISHU_PUBLIC_BASE_URL。
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <CheckLine label="接收群聊 @机器人消息" checked />
        <CheckLine label="接收单聊消息" checked />
        <CheckLine label="接收群成员变更事件" checked={false} />
      </div>

      <div className="border-4 border-pixel-black bg-pixel-black/5 p-4 font-pixel text-sm leading-relaxed text-pixel-black/75">
        在飞书开发者后台进入「事件与回调」→「请求地址配置」，粘贴上面的 Webhook 地址并完成 URL 验证；随后订阅 `im.message.receive_v1`。配置完成后，用户在单聊发送消息或在群聊 @机器人，后端会转发给当前 Agent/团队并用飞书消息回复。
      </div>

      <div className={`border-4 p-4 font-pixel text-sm ${ready ? 'border-pixel-green bg-pixel-green/10 text-pixel-green' : 'border-pixel-red bg-pixel-red/10 text-pixel-red'}`}>
        {ready
          ? '后端已配置 App ID / Secret，可以获取 tenant_access_token 并回复飞书消息。'
          : '后端尚未配置 App ID / Secret。可以先完成 URL 验证，但真实回复需要配置后重启后端。'}
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-4 border-pixel-black bg-pixel-white p-3">
      <p className="font-pixel text-xs text-pixel-black/50">{label}</p>
      <p className="mt-1 font-pixel text-sm text-pixel-black">{value}</p>
    </div>
  );
}

function EnvStatus({
  label,
  configured,
  optional = false,
}: {
  label: string;
  configured: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-4 border-pixel-black bg-pixel-white p-3">
      <span className="min-w-0 truncate font-mono text-xs text-pixel-black">{label}</span>
      <span className={`shrink-0 border-2 border-pixel-black px-2 py-0.5 font-pixel text-[10px] ${
        configured ? 'bg-pixel-green text-pixel-white' : optional ? 'bg-pixel-yellow text-pixel-black' : 'bg-pixel-red text-pixel-white'
      }`}>
        {configured ? '已配置' : optional ? '可选' : '缺失'}
      </span>
    </div>
  );
}

function CheckLine({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-2 border-4 border-pixel-black bg-pixel-white p-3">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 border-pixel-black font-pixel text-xs ${
        checked ? 'bg-pixel-blue text-pixel-white' : 'bg-pixel-white text-transparent'
      }`}>
        ✓
      </span>
      <span className="font-pixel text-xs leading-relaxed text-pixel-black">{label}</span>
    </div>
  );
}
