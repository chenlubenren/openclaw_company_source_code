'use client';

import { useEffect, useState } from 'react';
import { Lobster } from '@/types';
import { PixelCard } from '@/components/ui/PixelCard';
import { LobsterSprite } from './LobsterSprite';
import { useRouter } from 'next/navigation';
import * as api from '@/lib/api';
import { hasConfiguredProvider } from '@/lib/agentProvider';

interface LobsterCardProps {
  lobster: Lobster;
  silhouette?: boolean;
  onDelete?: (id: string) => Promise<void> | void;
  onConfig?: (lobster: Lobster) => void;
  onChanged?: () => Promise<void> | void;
  onForum?: (lobster: Lobster) => void;
  animateOnlineProfile?: boolean;
}

type BusyAction = 'delete' | 'market' | null;

function getPlatformConfig(platform?: string | null) {
  const key = (platform || 'openclaw').toLowerCase();
  if (key.includes('claude')) {
    return {
      label: 'Claude Code',
      iconUrl: '/agent-icons/claude-code.svg',
    };
  }
  if (key.includes('codex')) {
    return {
      label: 'Codex',
      iconUrl: '/agent-icons/codex.svg',
    };
  }
  if (key.includes('opencode')) {
    return {
      label: 'OpenCode',
      iconUrl: '/agent-icons/opencode.svg',
    };
  }
  if (key.includes('coze')) {
    return {
      label: 'Coze',
      iconUrl: '/agent-icons/coze.svg',
    };
  }
  if (key.includes('hermes')) {
    return {
      label: 'Hermes',
      iconUrl: '/agent-icons/hermes.svg',
    };
  }
  return {
    label: 'OpenClaw',
    iconUrl: '/agent-icons/openclaw.svg',
  };
}

function PlatformIcon({ platform }: { platform?: string | null }) {
  const config = getPlatformConfig(platform);

  return (
    <div
      className="w-7 h-7 flex items-center justify-center overflow-hidden"
      title={config.label}
      aria-label={config.label}
    >
      <img
        src={config.iconUrl}
        alt={config.label}
        className="w-full h-full object-contain"
      />
    </div>
  );
}

export function LobsterCard({
  lobster,
  silhouette = false,
  onDelete,
  onConfig,
  onChanged,
  onForum,
  animateOnlineProfile = false,
}: LobsterCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = () => setMenuOpen(false);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [menuOpen]);

  const handleClick = () => {
    if (!silhouette) {
      router.push(`/agent/${lobster.id}`);
    }
  };

  const handleDelete = async () => {
    if (busyAction || silhouette) return;
    const confirmed = window.confirm(`确定删除「${lobster.name}」吗？`);
    if (!confirmed) return;

    try {
      setBusyAction('delete');
      await onDelete?.(lobster.id);
      await onChanged?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : '删除 agent 失败');
    } finally {
      setBusyAction(null);
      setMenuOpen(false);
    }
  };

  const handleMarketToggle = async () => {
    if (busyAction || silhouette) return;
    const actionLabel = lobster.isPublishedToMarket ? '下架' : '上架';
    const confirmed = window.confirm(
      lobster.isPublishedToMarket
        ? `确定将「${lobster.name}」从 agent 市场下架吗？`
        : `确定将「${lobster.name}」上架到 agent 市场吗？`
    );
    if (!confirmed) return;

    try {
      setBusyAction('market');
      if (lobster.isPublishedToMarket) {
        await api.unpublishAgentFromMarket(lobster.id);
      } else {
        await api.publishAgentToMarket(lobster.id);
      }
      await onChanged?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : `${actionLabel}到 agent 市场失败`);
    } finally {
      setBusyAction(null);
      setMenuOpen(false);
    }
  };

  const handleForum = () => {
    if (onForum) {
      onForum(lobster);
      setMenuOpen(false);
      return;
    }
    router.push(`/market?tab=social&agentId=${encodeURIComponent(lobster.id)}`);
    setMenuOpen(false);
  };

  const handleEditProfile = () => {
    if (busyAction || silhouette) return;
    setMenuOpen(false);
    if (onConfig) {
      onConfig(lobster);
      return;
    }
    router.push(`/agent/${lobster.id}/setup`);
  };

  const description = lobster.description?.trim() || lobster.role || '暂无介绍';
  const ownerName = lobster.ownerUsername || lobster.uploaderUsername || '当前用户';
  const platform = lobster.platform || lobster.config?.platform || 'openclaw';
  const providerConfigured = hasConfiguredProvider(lobster);

  return (
    <PixelCard
      onClick={handleClick}
      hoverable={!silhouette && providerConfigured}
      className={`group/lobster-card relative w-full h-full min-h-[360px] md:min-h-[320px] flex flex-col ${silhouette ? 'pointer-events-none' : ''}`}
    >
      {lobster.isPublishedToMarket && !silhouette && (
        <div className="absolute top-1.5 left-1.5 z-20 px-1.5 py-0.5 bg-pixel-yellow text-pixel-black border-2 border-pixel-black font-pixel text-[10px] md:text-[9px] font-bold leading-none">
          已上架
        </div>
      )}

      {!silhouette && (
        <div className={`absolute top-2 right-2 z-[80] transition-opacity duration-150 ${menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover/lobster-card:pointer-events-auto group-hover/lobster-card:opacity-100 group-focus-within/lobster-card:pointer-events-auto group-focus-within/lobster-card:opacity-100'}`}>
          <button
            type="button"
            aria-label="agent 操作菜单"
            className="w-11 h-11 md:w-8 md:h-8 bg-transparent text-pixel-black/65 border-0 font-pixel text-2xl md:text-xl leading-none font-bold hover:text-pixel-black hover:bg-pixel-black/5 focus:outline-none focus:text-pixel-black"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            disabled={busyAction !== null}
          >
            ...
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-72 md:w-56 bg-pixel-white border-2 border-pixel-black py-1"
              style={{ boxShadow: '4px 4px 0px 0px #101010' }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="w-full px-4 py-3 md:px-3 md:py-2 text-left font-pixel text-base md:text-xs text-pixel-black hover:bg-pixel-yellow disabled:opacity-50"
                onClick={handleEditProfile}
                disabled={busyAction !== null}
              >
                配置 Agent
              </button>
              <button
                type="button"
                className="w-full px-4 py-3 md:px-3 md:py-2 text-left font-pixel text-base md:text-xs text-pixel-black hover:bg-pixel-yellow disabled:opacity-50"
                onClick={handleDelete}
                disabled={busyAction !== null || !onDelete}
              >
                删除此 agent
              </button>
              <button
                type="button"
                className="w-full px-4 py-3 md:px-3 md:py-2 text-left font-pixel text-base md:text-xs text-pixel-black hover:bg-pixel-yellow disabled:opacity-50"
                onClick={handleMarketToggle}
                disabled={busyAction !== null}
              >
                {lobster.isPublishedToMarket ? '下架到 agent 市场' : '上架到 agent 市场'}
              </button>
              <button
                type="button"
                className="w-full px-4 py-3 md:px-3 md:py-2 text-left font-pixel text-base md:text-xs text-pixel-black hover:bg-pixel-yellow disabled:opacity-50"
                onClick={handleForum}
                disabled={busyAction !== null}
              >
                参与 agent 论坛
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-4 md:gap-3 flex-1 justify-between pt-12 pb-9 md:pt-10 md:pb-8">
        <div className={`relative inline-flex ${animateOnlineProfile && providerConfigured && !silhouette ? 'animate-online-agent-profile' : ''}`}>
          <LobsterSprite
            lobster={lobster}
            size="lg"
            silhouette={silhouette}
            showProviderStatus={!silhouette}
            providerConfigured={providerConfigured}
          />
          {!silhouette && (
            <>
              <div className="absolute -left-1 bottom-0 z-20 pointer-events-none">
                <PlatformIcon platform={platform} />
              </div>
            </>
          )}
        </div>
        <div className="text-center w-full flex flex-col flex-1 justify-end">
          <p className="font-pixel text-[1.55rem] md:text-base leading-tight text-pixel-black font-bold mb-2 md:mb-1 line-clamp-2 min-h-[3.8rem] md:min-h-[2.5rem]">
            {lobster.name}
          </p>
          <p className="font-pixel text-[1.1rem] md:text-xs text-pixel-black/70 leading-snug min-h-[4.6rem] md:min-h-[3rem] line-clamp-3">
            {description}
          </p>
          <p className="font-pixel text-[0.95rem] md:text-xs text-pixel-black/50 mt-3 md:mt-2 truncate">
            上传用户：{ownerName}
          </p>
        </div>
      </div>
    </PixelCard>
  );
}
