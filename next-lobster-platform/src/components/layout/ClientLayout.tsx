'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MobileAppNav } from '@/components/layout/MobileAppNav';
import { useDesktopDisplayMode } from '@/lib/desktopDisplayMode';
import { useOpenClawDesktopBridge } from '@/lib/desktop';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import type { Project } from '@/types';

interface ClientLayoutProps {
  children: React.ReactNode;
}

type SidebarIcon = 'home' | 'agents' | 'teams' | 'projects' | 'tea' | 'market' | 'settings';

const SIDEBAR_WIDTH_STORAGE_KEY = 'openclaw.traditionalSidebarWidth';
const SIDEBAR_OPEN_STORAGE_KEY = 'openclaw.traditionalSidebarOpen';
const SIDEBAR_DEFAULT_WIDTH = 292;
const SIDEBAR_MIN_WIDTH = 236;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_WORKSPACE_GAP = 10;
const HOME_INTRO_STORAGE_KEY = 'hasSeenHeroAnimation';
const HOME_INTRO_COMPLETE_EVENT = 'openclaw:home-intro-complete';

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
}

function projectSortTime(project: Project) {
  const value = project.lastOpenedAt || project.updatedAt || project.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function TraditionalSidebarIcon({ icon, className = 'h-5 w-5' }: { icon: SidebarIcon; className?: string }) {
  if (icon === 'agents') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 9a8 8 0 0 1 16 0H4Z" />
      </svg>
    );
  }
  if (icon === 'teams') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    );
  }
  if (icon === 'projects') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M4 5h7l2 3h7v11H4V5Zm2 5v7h12v-7H6Z" />
      </svg>
    );
  }
  if (icon === 'tea') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm0 14H6l-2 2V4h16Z" />
        <path fill="currentColor" d="M7 9h10v2H7Zm0-3h10v2H7Z" />
      </svg>
    );
  }
  if (icon === 'market') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm3.5 14.5-7 2 2-7 7-2-2 7Z" />
      </svg>
    );
  }
  if (icon === 'settings') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.4-2.4 1a8.7 8.7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6A8.7 8.7 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a8.7 8.7 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8.7 8.7 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M12 3 3 9v12h7v-6h4v6h7V9Zm0 2.5L18 10v9h-2v-6H8v6H6v-9Z" />
    </svg>
  );
}

function TraditionalDesktopSidebar({
  open,
  pathname,
  width,
  projects,
  onWidthChange,
  onToggle,
  onDeleteProject,
}: {
  open: boolean;
  pathname: string;
  width: number;
  projects: Project[];
  onWidthChange: (width: number) => void;
  onToggle: () => void;
  onDeleteProject?: (project: Project) => void;
}) {
  const navItems: Array<{ href: string; label: string; icon: SidebarIcon; tone: string; exact?: boolean }> = [
    { href: '/', label: '首页', icon: 'home', tone: 'bg-pixel-green', exact: true },
    { href: '/my-den', label: '我的 Agent 窝', icon: 'agents', tone: 'bg-pixel-red' },
    { href: '/architectures/mine', label: '我的团队', icon: 'teams', tone: 'bg-pixel-blue' },
    { href: '/agent-tea-party', label: 'Agent 茶话会', icon: 'tea', tone: 'bg-pixel-red' },
    { href: '/market', label: 'Agent 世界', icon: 'market', tone: 'bg-pixel-yellow' },
    { href: '/settings/providers', label: '供应商设置', icon: 'settings', tone: 'bg-pixel-gray' },
  ];
  const recentProjects = [...projects]
    .sort((a, b) => projectSortTime(b) - projectSortTime(a))
    .slice(0, 7);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      onWidthChange(clampSidebarWidth(startWidth + moveEvent.clientX - startX));
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
  };

  return (
    <>
      <aside
        aria-hidden={!open}
        className="fixed left-0 top-0 z-[40] hidden h-screen flex-col border-r-4 border-pixel-black bg-pixel-black text-pixel-white transition-[left,opacity] duration-300 ease-out md:flex"
        data-traditional-sidebar="true"
        style={{
          width,
          left: open ? 0 : -width,
          boxShadow: '6px 0 0 #101010',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
          <div className="border-b-4 border-pixel-gray/50 px-4 py-4">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex min-w-0 flex-1 items-center gap-3 no-underline">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center border-4 border-pixel-white bg-pixel-red text-pixel-white">
                  <TraditionalSidebarIcon icon="home" className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="chinese-large block truncate text-pixel-white">虾兵蟹将</span>
                  <span className="block truncate font-pixel text-xs leading-none text-pixel-white/65">AGENT TEAM PLATFORM</span>
                </span>
              </Link>
              <motion.button
                type="button"
                aria-label="收起传统模式侧边栏"
                title="收起侧边栏"
                onClick={onToggle}
                whileHover={{ x: -1 }}
                whileTap={{ x: -2, scale: 0.96 }}
                className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-pixel-white bg-pixel-black text-pixel-white transition-colors hover:border-pixel-yellow hover:text-pixel-yellow"
                style={{ boxShadow: '2px 2px 0px 0px #101010' }}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" shapeRendering="crispEdges">
                  <path fill="currentColor" d="M14 5 7 12l7 7v-5h7v-4h-7V5Z" />
                </svg>
              </motion.button>
            </div>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
            {navItems.map((item, index) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.035 * index }}
                >
                  <Link
                    href={item.href}
                    className={`flex min-h-[56px] items-center gap-3 border-2 px-3 font-pixel text-base no-underline transition-colors ${
                      active
                        ? 'border-pixel-gray bg-pixel-white/10 text-pixel-white'
                        : 'border-transparent text-pixel-white/72 hover:border-pixel-gray hover:bg-pixel-white/10 hover:text-pixel-white'
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 border-pixel-black ${item.tone} ${item.icon === 'projects' || item.icon === 'market' ? 'text-pixel-black' : 'text-pixel-white'}`}>
                      <TraditionalSidebarIcon icon={item.icon} />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                </motion.div>
              );
            })}

            {recentProjects.length > 0 && (
              <div className="pt-2">
                <div className="my-3 h-[4px] border-y border-pixel-black bg-pixel-gray" aria-hidden="true" />
                <p className="mb-2 px-1 font-pixel text-xs leading-none text-pixel-white/45">最近项目</p>
                <div className="space-y-1.5">
                  {recentProjects.map((project, index) => {
                    const href = `/projects/${project.id}`;
                    const active = pathname === href;
                    return (
                      <motion.div
                        key={project.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.035 * (navItems.length + index) }}
                      >
                        <div className="group/sidebar-project relative">
                          <Link
                            href={href}
                            className={`flex min-h-[48px] items-center gap-2 border-2 px-2 pl-9 font-pixel text-sm no-underline transition-colors ${
                              active
                                ? 'border-pixel-gray bg-pixel-white/15 text-pixel-white'
                                : 'border-transparent text-pixel-white/65 hover:border-pixel-gray hover:bg-pixel-white/10 hover:text-pixel-white'
                            }`}
                            title={project.name}
                          >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-gray text-pixel-white">
                            <TraditionalSidebarIcon icon="projects" className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate leading-tight">{project.name}</span>
                            <span className="block truncate text-[10px] leading-tight text-pixel-white/38">
                              {project.teamIds.length} 团队 · {(project.agentIds || []).length} Agent
                            </span>
                          </span>
                          </Link>
                          {onDeleteProject && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onDeleteProject(project);
                              }}
                              className="pointer-events-none absolute left-1 top-1 flex h-7 w-7 items-center justify-center border-2 border-pixel-black bg-pixel-red font-pixel text-xs font-bold leading-none text-pixel-white opacity-0 transition-opacity hover:brightness-95 group-hover/sidebar-project:pointer-events-auto group-hover/sidebar-project:opacity-100 group-focus-within/sidebar-project:pointer-events-auto group-focus-within/sidebar-project:opacity-100"
                              style={{ boxShadow: '2px 2px 0 #101010' }}
                              aria-label={`删除项目 ${project.name}`}
                              title="删除项目"
                            >
                              X
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>

          <div className="border-t-4 border-pixel-gray/50 p-3">
            <p className="font-pixel text-xs leading-tight text-pixel-white/45">v0.1.0 · 虾兵蟹将实验室</p>
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="调整传统模式侧边栏宽度"
            title="拖拽调整侧边栏宽度"
            onPointerDown={handleResizePointerDown}
            className="absolute right-[-8px] top-0 h-full w-4 cursor-col-resize border-x-2 border-pixel-black bg-pixel-yellow/80 opacity-0 transition-opacity hover:opacity-100"
          />
      </aside>

      {!open && (
        <motion.button
          type="button"
          aria-label="展开传统模式侧边栏"
          title="展开侧边栏"
          onClick={onToggle}
          initial={{ x: -8, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          whileHover={{ x: 2 }}
          whileTap={{ x: 0, scale: 0.96 }}
          className="fixed left-0 top-[96px] z-[45] hidden h-16 w-9 items-center justify-center border-y-4 border-r-4 border-pixel-black bg-pixel-yellow text-pixel-black transition-colors hover:bg-pixel-green md:flex"
          style={{ boxShadow: '3px 3px 0px 0px #101010' }}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" shapeRendering="crispEdges">
            <path fill="currentColor" d="M10 5v5H3v4h7v5l7-7-7-7Z" />
          </svg>
        </motion.button>
      )}
    </>
  );
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  const [desktopDisplayMode] = useDesktopDisplayMode();
  const { token, hasHydrated } = useAuthStore();
  const projects = useStore((state) => state.projects);
  const deleteProjectAPI = useStore((state) => state.deleteProjectAPI);
  const desktopBridge = useOpenClawDesktopBridge();
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [homeIntroActive, setHomeIntroActive] = useState(pathname === '/');
  const [traditionalSidebarOpen, setTraditionalSidebarOpen] = useState(true);
  const [traditionalSidebarWidth, setTraditionalSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const isDesktopRuntime = Boolean(desktopBridge);
  const isPublicPath = pathname === '/' || pathname.startsWith('/auth/');
  const isRouteGuardBlocking = !isDesktopRuntime && !isPublicPath && (!hasHydrated || !token);
  const isMobileChatRoute = pathname.startsWith('/agent/') || pathname.startsWith('/agent-tea-party');
  const isTraditionalMode = desktopDisplayMode === 'traditional';
  const isTraditionalHome = pathname === '/' && isTraditionalMode;
  const isProjectDetailRoute = /^\/projects\/[^/]+/.test(pathname);
  const mainClassName = isMobileChatRoute
    ? isTraditionalMode
      ? 'h-[100dvh] min-h-[100dvh] max-w-none overflow-hidden bg-pixel-cream p-0 pb-0 md:mx-auto md:h-auto md:min-h-[calc(100vh-120px)] md:w-full md:max-w-none md:overflow-visible md:bg-pixel-white md:p-0'
      : 'h-[100dvh] min-h-[100dvh] max-w-none overflow-hidden bg-pixel-cream p-0 pb-0 md:mx-auto md:h-auto md:min-h-[calc(100vh-120px)] md:max-w-7xl md:overflow-visible md:bg-pixel-white md:p-4 md:pb-4'
    : isTraditionalMode
      ? 'mx-auto min-h-screen bg-pixel-white p-4 pb-0 md:min-h-[calc(100vh-120px)] md:w-full md:max-w-none md:p-0'
      : 'max-w-7xl mx-auto p-4 pb-0 md:pb-4 bg-pixel-white min-h-screen md:min-h-[calc(100vh-120px)]';

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const syncDesktopViewport = () => {
      setIsDesktopViewport(media.matches);
      if (isTraditionalMode && media.matches) {
        document.body.dataset.traditionalDesktopMode = 'true';
      } else {
        delete document.body.dataset.traditionalDesktopMode;
      }
    };

    syncDesktopViewport();
    media.addEventListener('change', syncDesktopViewport);
    return () => {
      media.removeEventListener('change', syncDesktopViewport);
      delete document.body.dataset.traditionalDesktopMode;
    };
  }, [isTraditionalMode]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const syncHomeIntroActive = () => {
      setHomeIntroActive(pathname === '/' && media.matches && !window.sessionStorage.getItem(HOME_INTRO_STORAGE_KEY));
    };

    syncHomeIntroActive();
    media.addEventListener('change', syncHomeIntroActive);
    window.addEventListener(HOME_INTRO_COMPLETE_EVENT, syncHomeIntroActive);
    return () => {
      media.removeEventListener('change', syncHomeIntroActive);
      window.removeEventListener(HOME_INTRO_COMPLETE_EVENT, syncHomeIntroActive);
    };
  }, [pathname]);

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsedWidth = storedWidth ? Number(storedWidth) : NaN;
    if (Number.isFinite(parsedWidth)) {
      setTraditionalSidebarWidth(clampSidebarWidth(parsedWidth));
    }

    const storedOpen = window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
    if (storedOpen === 'closed') {
      setTraditionalSidebarOpen(false);
    } else if (storedOpen === 'open') {
      setTraditionalSidebarOpen(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(traditionalSidebarWidth));
  }, [traditionalSidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, traditionalSidebarOpen ? 'open' : 'closed');
  }, [traditionalSidebarOpen]);

  useEffect(() => {
    if (pathname === '/' && isTraditionalMode && isDesktopViewport && !homeIntroActive) {
      setTraditionalSidebarOpen(true);
    }
  }, [homeIntroActive, isDesktopViewport, isTraditionalMode, pathname]);

  useEffect(() => {
    if (isProjectDetailRoute && isTraditionalMode && isDesktopViewport) {
      setTraditionalSidebarOpen(true);
    }
  }, [isDesktopViewport, isProjectDetailRoute, isTraditionalMode]);

  const traditionalShellActive = isTraditionalMode && isDesktopViewport;
  const traditionalSidebarEnabled = traditionalShellActive && !isRouteGuardBlocking && !homeIntroActive;
  const effectiveTraditionalSidebarOpen = traditionalSidebarEnabled && traditionalSidebarOpen;
  const traditionalSidebarOffset = effectiveTraditionalSidebarOpen
    ? traditionalSidebarWidth + SIDEBAR_WORKSPACE_GAP
    : 0;
  const traditionalContentStyle = traditionalSidebarEnabled
    ? { paddingLeft: traditionalSidebarOffset, boxSizing: 'border-box' as const }
    : undefined;
  const traditionalInnerClassName = isProjectDetailRoute
    ? 'px-3 py-4 lg:px-4 xl:px-5'
    : 'px-8 py-6 xl:px-10 2xl:px-12';

  return (
    <>
      <div className="hidden md:block">
        <Header
          traditionalMode={isTraditionalMode}
          traditionalSidebarOpen={effectiveTraditionalSidebarOpen}
          traditionalSidebarWidth={traditionalSidebarOffset}
        />
      </div>
      <main data-app-main="true" data-traditional-home={isTraditionalHome ? 'true' : undefined} className={mainClassName}>
        {traditionalShellActive ? (
          <div className="hidden md:block">
            <div className="relative min-h-[calc(100vh-76px)]">
              {traditionalSidebarEnabled && (
                <TraditionalDesktopSidebar
                  open={traditionalSidebarOpen}
                  pathname={pathname}
                  width={traditionalSidebarWidth}
                  projects={projects}
                  onWidthChange={setTraditionalSidebarWidth}
                  onToggle={() => setTraditionalSidebarOpen((open) => !open)}
                  onDeleteProject={async (project) => {
                    const ok = window.confirm(`确定删除项目「${project.name}」吗？这会删除项目配置和工作空间。`);
                    if (!ok) return;
                    await deleteProjectAPI(project.id);
                  }}
                />
              )}
              <div
                className="min-h-[calc(100vh-76px)] min-w-0 overflow-x-hidden transition-[padding] duration-300 ease-out"
                style={traditionalContentStyle}
              >
                <div className={traditionalInnerClassName}>
                  <AuthGuard>{children}</AuthGuard>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <AuthGuard>{children}</AuthGuard>
        )}
      </main>
      <footer
        className="hidden border-t-4 border-pixel-red bg-pixel-black py-4 transition-[padding] duration-300 ease-out md:block"
        style={effectiveTraditionalSidebarOpen ? { paddingLeft: traditionalSidebarOffset } : undefined}
      >
        <div className={`${isTraditionalMode ? 'mx-0 w-full max-w-none px-8 xl:px-10 2xl:px-12' : 'max-w-7xl mx-auto'} text-center font-pixel text-pixel-white text-xs`}>
          <p>虾兵蟹将 - 高效AI团队协作 | Efficient AI Team Collaboration</p>
          <p className="mt-1 text-pixel-red">READY.</p>
        </div>
      </footer>
      <Suspense fallback={null}>
        <MobileAppNav />
      </Suspense>
    </>
  );
}
