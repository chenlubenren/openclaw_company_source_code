'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { motion } from 'framer-motion';
import { UserMenu } from '@/components/user/UserMenu';
import { useOpenClawDesktopBridge } from '@/lib/desktop';
import { useDesktopDisplayMode } from '@/lib/desktopDisplayMode';

interface HeaderProps {
  traditionalMode?: boolean;
  traditionalSidebarOpen?: boolean;
  traditionalSidebarWidth?: number;
}

function DisplayModeIcon({ mode }: { mode: 'professional' | 'traditional' }) {
  if (mode === 'traditional') {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" shapeRendering="crispEdges">
        <path fill="currentColor" d="M3 3h5v18H3V3Zm7 2h11v4H10V5Zm0 6h5v4h-5v-4Zm7 0h4v4h-4v-4Zm-7 6h11v2H10v-2Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M3 4h8v7H3V4Zm10 0h8v7h-8V4ZM3 13h8v7H3v-7Zm10 0h8v7h-8v-7Z" />
    </svg>
  );
}

function DesktopDisplayModeToggle() {
  const [displayMode, setDesktopDisplayMode] = useDesktopDisplayMode();
  const nextMode = displayMode === 'professional' ? 'traditional' : 'professional';

  return (
    <motion.button
      type="button"
      data-desktop-display-mode-toggle="true"
      aria-label={nextMode === 'traditional' ? '切换到传统模式' : '切换到专业模式'}
      title={nextMode === 'traditional' ? '切换到传统模式' : '切换到专业模式'}
      onClick={() => setDesktopDisplayMode(nextMode)}
      whileHover={{ y: -1 }}
      whileTap={{ y: 1, scale: 0.96 }}
      className="hidden h-10 w-10 items-center justify-center border-2 border-pixel-white bg-pixel-black text-pixel-white transition-colors hover:border-pixel-yellow hover:text-pixel-yellow md:flex"
      style={{ boxShadow: '2px 2px 0px 0px #101010' }}
    >
      <DisplayModeIcon mode={displayMode} />
    </motion.button>
  );
}

export function Header({
  traditionalMode = false,
  traditionalSidebarOpen = false,
  traditionalSidebarWidth = 0,
}: HeaderProps) {
  const { user, token } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const desktopBridge = useOpenClawDesktopBridge();
  const isDesktop = Boolean(desktopBridge);
  const headerContentStyle = traditionalMode && traditionalSidebarOpen
    ? { paddingLeft: traditionalSidebarWidth }
    : undefined;

  return (
    <header className={`border-b-4 border-pixel-white bg-pixel-black px-4 py-3 ${traditionalMode ? 'md:px-0' : ''}`}>
      <div
        className={`${traditionalMode ? 'mx-0 flex w-full max-w-none items-center justify-between gap-6 px-6 transition-[padding] duration-300 ease-out xl:px-8' : 'max-w-7xl mx-auto flex items-center justify-between'}`}
        style={headerContentStyle}
      >
        <div className={`flex min-w-0 items-center gap-4 ${traditionalMode ? 'ml-[3px]' : ''}`}>
          <Link href="/" className={`flex min-w-0 items-center gap-4 no-underline ${traditionalMode ? 'pr-4' : ''}`}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center border-4 border-pixel-white bg-pixel-red">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-pixel-white">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h1 className={`flex min-w-0 items-center ${traditionalMode ? 'gap-4' : 'gap-3'}`}>
              <span className="chinese-large whitespace-nowrap text-pixel-white">虾兵蟹将</span>
              <span className={`font-pixel text-pixel-white/70 ${traditionalMode ? 'hidden text-xl lg:inline' : 'text-xl'}`}>AGENT TEAM PLATFORM</span>
            </h1>
          </Link>
          {traditionalMode && (
            <div className="hidden min-w-0 border-l-2 border-pixel-white/20 pl-5 font-pixel text-sm leading-tight text-pixel-white/55 xl:block">
              <span className="block">TRADITIONAL WORKSPACE</span>
              <span className="block text-pixel-yellow">WIDE DISPLAY READY</span>
            </div>
          )}
        </div>

        <div className={`flex shrink-0 items-center ${traditionalMode ? 'gap-3' : 'gap-4'}`}>
          <DesktopDisplayModeToggle />

          {isDesktop ? (
            <div
              className="border-2 border-pixel-white bg-pixel-green px-3 py-1 font-pixel text-xs text-pixel-black"
              style={{ boxShadow: '2px 2px 0px 0px #101010' }}
            >
              LOCAL DESKTOP
            </div>
          ) : user && token ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-2 py-1 border-2 border-pixel-white hover:border-pixel-yellow transition-colors"
              >
                <div className="w-8 h-8 bg-pixel-green border-2 border-pixel-white flex items-center justify-center">
                  <span className="font-pixel text-pixel-white text-sm">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="font-pixel text-pixel-white text-sm">{user.username}</span>
                <span className="text-pixel-white/50">▾</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 z-50">
                  <UserMenu onClose={() => setShowUserMenu(false)} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth/login"
                className={`${traditionalMode ? 'min-w-[118px] px-5 py-2 text-center' : 'px-3 py-1'} bg-pixel-blue text-pixel-white border-2 border-pixel-white font-pixel text-sm hover:bg-pixel-green hover:text-pixel-black transition-colors no-underline`}
                style={{ boxShadow: '2px 2px 0px 0px #101010' }}
              >
                登录
              </Link>
              <Link
                href="/auth/register"
                className={`${traditionalMode ? 'min-w-[118px] px-5 py-2 text-center' : 'px-3 py-1'} bg-pixel-green text-pixel-black border-2 border-pixel-white font-pixel text-sm hover:bg-pixel-yellow transition-colors no-underline`}
                style={{ boxShadow: '2px 2px 0px 0px #101010' }}
              >
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
