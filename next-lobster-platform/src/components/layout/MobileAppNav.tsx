'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export type MobileTabKey = 'projects' | 'contacts' | 'teams' | 'discover' | 'me';
export type MobileDisplayMode = 'normal' | 'care';

export const MOBILE_DISPLAY_MODE_STORAGE_KEY = 'openclaw.mobileDisplayMode';
const MOBILE_DISPLAY_MODE_EVENT = 'openclaw:mobile-display-mode-change';

export const mobileTabs: Array<{ key: MobileTabKey; label: string; accent: string; href: string }> = [
  { key: 'projects', label: '我的项目', accent: 'bg-pixel-blue', href: '/?mobileTab=projects' },
  { key: 'contacts', label: '通讯录', accent: 'bg-pixel-green', href: '/?mobileTab=contacts' },
  { key: 'teams', label: '我的团队', accent: 'bg-pixel-yellow', href: '/?mobileTab=teams' },
  { key: 'discover', label: '发现', accent: 'bg-pixel-red', href: '/?mobileTab=discover' },
  { key: 'me', label: '我的', accent: 'bg-pixel-gray', href: '/?mobileTab=me' },
];

export function isMobileTabKey(value: string | null | undefined): value is MobileTabKey {
  return Boolean(value && mobileTabs.some((tab) => tab.key === value));
}

function isMobileDisplayMode(value: string | null | undefined): value is MobileDisplayMode {
  return value === 'normal' || value === 'care';
}

function readMobileDisplayMode(): MobileDisplayMode {
  if (typeof window === 'undefined') return 'normal';
  const stored = window.localStorage.getItem(MOBILE_DISPLAY_MODE_STORAGE_KEY);
  return isMobileDisplayMode(stored) ? stored : 'normal';
}

function applyMobileDisplayMode(mode: MobileDisplayMode) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.mobileDisplayMode = mode;
  }
}

export function setStoredMobileDisplayMode(mode: MobileDisplayMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MOBILE_DISPLAY_MODE_STORAGE_KEY, mode);
  applyMobileDisplayMode(mode);
  window.dispatchEvent(new CustomEvent(MOBILE_DISPLAY_MODE_EVENT, { detail: { mode } }));
}

export function useMobileDisplayMode() {
  const [mode, setMode] = useState<MobileDisplayMode>('normal');

  useEffect(() => {
    const syncMode = () => {
      const nextMode = readMobileDisplayMode();
      setMode(nextMode);
      applyMobileDisplayMode(nextMode);
    };

    syncMode();
    window.addEventListener('storage', syncMode);
    window.addEventListener(MOBILE_DISPLAY_MODE_EVENT, syncMode);
    return () => {
      window.removeEventListener('storage', syncMode);
      window.removeEventListener(MOBILE_DISPLAY_MODE_EVENT, syncMode);
    };
  }, []);

  return [mode, setStoredMobileDisplayMode] as const;
}

export function MobileNavIcon({ tab, compact = false }: { tab: MobileTabKey; compact?: boolean }) {
  const common = compact
    ? 'h-[22px] w-[22px]'
    : 'h-[clamp(40px,10vw,56px)] w-[clamp(40px,10vw,56px)]';
  if (tab === 'contacts') {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
        <path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 9a8 8 0 0 1 16 0H4Z" />
      </svg>
    );
  }
  if (tab === 'teams') {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
        <path fill="currentColor" d="M12 3 3 8l9 5 9-5-9-5Zm-7 9 7 4 7-4v5l-7 4-7-4v-5Z" />
      </svg>
    );
  }
  if (tab === 'discover') {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
        <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm3.5 14.5-7 2 2-7 7-2-2 7Z" />
      </svg>
    );
  }
  if (tab === 'me') {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
        <path fill="currentColor" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
      <path fill="currentColor" d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    </svg>
  );
}

function activeTabForRoute(pathname: string, searchTab: string | null): MobileTabKey {
  if (pathname === '/' && isMobileTabKey(searchTab)) return searchTab;
  if (pathname.startsWith('/architectures')) return 'teams';
  if (pathname.startsWith('/agent/') || pathname === '/agent') return 'contacts';
  if (pathname.startsWith('/market') || pathname.startsWith('/adopt')) return 'discover';
  if (pathname.startsWith('/settings') || pathname.startsWith('/my-den')) return 'me';
  if (pathname.startsWith('/agent-tea-party')) return 'teams';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/upload')) return 'discover';
  return 'projects';
}

export function MobileAppNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [displayMode] = useMobileDisplayMode();

  if (pathname.startsWith('/auth/') || pathname.startsWith('/agent/') || pathname.startsWith('/agent-tea-party')) return null;

  const activeKey = activeTabForRoute(pathname, searchParams.get('mobileTab'));
  const careMode = displayMode === 'care';

  return (
    <nav
      data-mobile-app-nav="true"
      data-mobile-display-mode={displayMode}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-4 border-pixel-black bg-pixel-white shadow-[0_-4px_0_0_#101010] md:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
    >
      {mobileTabs.map((tab) => {
        const active = activeKey === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`relative flex flex-col items-center justify-center border-r-2 border-pixel-black/10 px-0 font-pixel last:border-r-0 ${
              careMode ? 'min-h-[104px] gap-1.5 pb-2.5 pt-4 text-[1.1rem]' : 'min-h-[62px] gap-0.5 pb-1 pt-1.5 text-[0.66rem]'
            } ${
              active ? 'bg-pixel-black text-pixel-white' : 'text-pixel-black/70'
            }`}
          >
            {active && <span data-mobile-nav-indicator="true" className={`absolute left-2 right-2 border border-pixel-black ${careMode ? 'top-2 h-2' : 'top-1 h-1'} ${tab.accent}`} />}
            <span
              data-mobile-nav-icon="true"
              className={`flex items-center justify-center border-pixel-black ${
                careMode ? 'h-[clamp(48px,13vw,62px)] w-[clamp(48px,13vw,62px)] border-3' : 'h-[28px] w-[28px] border-2'
              } ${
                active ? tab.accent : 'bg-pixel-white'
              }`}
              style={{ boxShadow: careMode ? (active ? '3px 3px 0 #101010' : '2px 2px 0 rgba(16,16,16,0.35)') : (active ? '2px 2px 0 #101010' : '1px 1px 0 rgba(16,16,16,0.35)') }}
            >
              <MobileNavIcon tab={tab.key} compact={!careMode} />
            </span>
            <span data-mobile-nav-label="true" className="max-w-full whitespace-nowrap text-center leading-none tracking-normal">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
