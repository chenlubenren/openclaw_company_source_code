import type { CSSProperties } from 'react';
import { Lobster } from '@/types';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { hasConfiguredProvider } from '@/lib/agentProvider';

interface LobsterSpriteProps {
  lobster: Lobster;
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
  showProviderStatus?: boolean;
  providerConfigured?: boolean;
  silhouette?: boolean;
  muted?: boolean;
  animateStatus?: boolean;
}

/** 与 db.json id 一一对应：主控粉、研究绿、数据蓝、写作橙
 * 同时支持 owned-market-* 格式（SUMMON 后的龙虾）
 */
const SPRITE_BY_ID: Record<string, string> = {
  'lobster-001': '/lobsters/lobster-001.png',
  'lobster-002': '/lobsters/lobster-002.png',
  'lobster-003': '/lobsters/lobster-003.png',
  'lobster-004': '/lobsters/lobster-004.png',
  // SUMMON 后的龙虾
  'owned-market-1': '/lobsters/market-red-hood.png',
  'owned-market-2': '/lobsters/market-data-doc.png',
  'owned-market-3': '/lobsters/market-code-hero.png',
  'owned-market-4': '/lobsters/market-research-cat.png',
  'owned-market-5': '/lobsters/market-translator.png',
  'owned-market-6': '/lobsters/market-artist.png',
  'owned-market-7': '/lobsters/lobster-004.png',
  'owned-market-8': '/lobsters/lobster-003.png',
  'owned-market-9': '/lobsters/lobster-002.png',
};

const DEFAULT_SPRITE = SPRITE_BY_ID['lobster-004'];

function spriteSrc(lobsterId: string): string {
  // 精确匹配
  if (SPRITE_BY_ID[lobsterId]) return SPRITE_BY_ID[lobsterId];
  // 匹配 owned-market-* 前缀（去掉时间戳后缀）
  const match = lobsterId.match(/^(owned-market-\d+)/);
  if (match) {
    return SPRITE_BY_ID[match[1]] ?? DEFAULT_SPRITE;
  }
  return DEFAULT_SPRITE;
}

const DISPLAY_PX: Record<'sm' | 'md' | 'lg', number> = {
  sm: 44,
  md: 64,
  lg: 96,
};

function frameStyle(displayPx: number): CSSProperties {
  return {
    width: displayPx,
    height: displayPx,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

const imgStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain' as const,
  imageRendering: 'pixelated' as const,
  userSelect: 'none' as const,
  pointerEvents: 'none' as const,
};

export function LobsterSprite({
  lobster,
  size = 'md',
  showStatus = false,
  showProviderStatus = false,
  providerConfigured,
  silhouette = false,
  muted = false,
  animateStatus,
}: LobsterSpriteProps) {
  const { activeLobsterId, setActiveLobster } = useStore();
  const isActive = activeLobsterId === lobster.id;
  const shouldAnimateStatus = animateStatus ?? !silhouette;
  const isProviderConfigured = providerConfigured ?? hasConfiguredProvider(lobster);
  const shouldMute = muted || (showProviderStatus && !isProviderConfigured);

  const statusAnimations: Record<string, { y?: number[]; rotate?: number[]; scale?: number[]; opacity?: number[]; transition?: { duration: number; repeat: number } }> = {
    idle: { y: [0, -2, 0], scale: [1, 1.035, 1], transition: { duration: 2.2, repeat: Infinity } },
    working: { y: [0, -2, 0], rotate: [-3, 3], scale: [1, 1.04, 1], transition: { duration: 0.8, repeat: Infinity } },
    busy: { scale: [1, 1.08, 1], transition: { duration: 0.6, repeat: Infinity } },
    error: { opacity: [1, 0.5, 1], transition: { duration: 1, repeat: Infinity } },
    offline: {},
  };

  const displayPx = DISPLAY_PX[size];

  const statusColors: Record<string, string> = { idle: 'bg-pixel-green', working: 'bg-pixel-yellow', busy: 'bg-pixel-red', error: 'bg-pixel-black', offline: 'bg-pixel-gray' };
  const restingAnimation = { y: 0, rotate: 0, scale: 1, opacity: 1 };

  const imageSrc = lobster.avatar ?? spriteSrc(lobster.id);

  const spriteStyle: CSSProperties = silhouette
    ? { ...imgStyle, filter: 'brightness(0) opacity(0.25)', mixBlendMode: 'multiply' }
    : shouldMute
      ? { ...imgStyle, filter: 'grayscale(1) opacity(0.45)' }
    : imgStyle;

  return (
    <motion.div
      className={`relative inline-flex ${isActive ? 'ring-4 ring-pixel-yellow' : ''}`}
      animate={shouldAnimateStatus && !shouldMute ? statusAnimations[lobster.status] : restingAnimation}
      onClick={() => setActiveLobster(isActive ? null : lobster.id)}
    >
      <div style={frameStyle(displayPx)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 独立精灵 PNG */}
        <img src={imageSrc} alt={lobster.name} style={spriteStyle} draggable={false} />
      </div>

      {showProviderStatus && !silhouette && (
        <span
          aria-label={isProviderConfigured ? '已配置供应商' : '未配置供应商'}
          title={isProviderConfigured ? '已配置供应商' : '未配置供应商'}
          className={`absolute -right-1 -top-1 z-10 h-3.5 w-3.5 rounded-full border-2 border-pixel-black ${
            isProviderConfigured ? 'bg-pixel-green' : 'bg-pixel-gray'
          }`}
        />
      )}

      {showStatus && !showProviderStatus && !silhouette && !shouldMute && (
        <span
          aria-label={`agent status: ${lobster.status}`}
          className={`absolute -right-1 -top-1 z-10 h-3.5 w-3.5 rounded-full border-2 border-pixel-black ${statusColors[lobster.status]}`}
        />
      )}
    </motion.div>
  );
}
