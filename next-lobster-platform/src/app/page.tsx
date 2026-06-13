'use client';

import { Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { SectionA, SectionB, MenuCard } from '@/components/layout/Dashboard';
import { LobsterCard } from '@/components/lobster/LobsterCard';
import { AgentConfigModal } from '@/components/agent/AgentConfigModal';
import { PixelHero } from '@/components/effects/PixelHero';
import { MobileNavIcon, isMobileTabKey, mobileTabs, useMobileDisplayMode, type MobileDisplayMode, type MobileTabKey } from '@/components/layout/MobileAppNav';
import { useStore } from '@/store/useStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Lobster, Project, Session, SessionMessage } from '@/types';
import { hasConfiguredProvider } from '@/lib/agentProvider';
import { useOpenClawDesktopBridge } from '@/lib/desktop';
import { useDesktopDisplayMode } from '@/lib/desktopDisplayMode';
import { adoptOfficialLobster } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';

const OFFICIAL_LOBSTER_AVATAR = '/claw_profile/03.png';

function FolderIcon({ src, className = 'h-12 w-12' }: { src?: string; className?: string }) {
  return (
    <img
      src={src || '/project-icons/folder-blue.svg'}
      alt=""
      className={`${className} object-contain`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function FolderSilhouetteIcon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M6 14h20l6 8h26v28H6z" />
    </svg>
  );
}

function projectSubtitle(project: Project) {
  const teams = project.teamIds.length > 0 ? `${project.teamIds.length} 个团队` : '未绑定团队';
  const branch = project.gitBranch ? `Git: ${project.gitBranch}` : 'Git 未设置';
  return `${teams} · ${branch}`;
}

function isToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function estimateTokenUsage(messages: SessionMessage[]) {
  return messages
    .filter((message) => isToday(message.timestamp))
    .reduce((total, message) => total + Math.max(1, Math.ceil((message.content || '').length / 1.8)), 0);
}

function formatMetricValue(value: number) {
  return value.toLocaleString('zh-CN');
}

function MobilePanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`overflow-hidden border-4 border-pixel-black bg-pixel-white ${className}`}
      style={{ boxShadow: '5px 5px 0 #101010' }}
    >
      {children}
    </section>
  );
}

function MobileIconTile({
  children,
  accent = 'bg-pixel-blue',
  displayMode = 'normal',
}: {
  children?: React.ReactNode;
  accent?: string;
  displayMode?: MobileDisplayMode;
}) {
  const careMode = displayMode === 'care';
  return (
    <span className={`relative flex shrink-0 items-center justify-center border-pixel-black ${careMode ? 'h-[78px] w-[78px] border-4' : 'h-12 w-12 border-3'} ${accent}`}>
      <span className={`absolute bg-pixel-white ${careMode ? 'inset-1 border-2 border-pixel-black' : 'inset-0.5 border border-pixel-black'}`} />
      <span className="relative z-10 flex h-full w-full items-center justify-center">
        {children}
      </span>
    </span>
  );
}

function MobileLinkRow({
  href,
  title,
  description,
  badge,
  icon,
  accent = 'bg-pixel-blue',
  displayMode = 'normal',
}: {
  href: string;
  title: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
  accent?: string;
  displayMode?: MobileDisplayMode;
}) {
  const careMode = displayMode === 'care';
  return (
    <Link
      href={href}
      className={`flex items-center justify-between border-b-2 border-pixel-black/10 bg-pixel-white last:border-b-0 active:bg-pixel-yellow/40 ${careMode ? 'min-h-[116px] gap-3 px-4 py-4' : 'min-h-[72px] gap-2 px-3 py-2.5'}`}
    >
      <span className="relative shrink-0">
        <MobileIconTile accent={accent} displayMode={displayMode}>{icon}</MobileIconTile>
        {badge && (
          <span className={`absolute border-pixel-black bg-pixel-yellow font-pixel leading-none text-pixel-black ${careMode ? '-right-2 -top-2 border-2 px-2.5 py-1.5 text-lg' : '-right-1.5 -top-1.5 border px-1.5 py-0.5 text-[10px]'}`}>
            {badge}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-pixel font-bold leading-tight text-pixel-black ${careMode ? 'text-[1.85rem]' : 'text-base'}`}>{title}</span>
        {description && (
          <span className={`block truncate font-pixel leading-tight text-pixel-black/60 ${careMode ? 'mt-2.5 text-[1.35rem]' : 'mt-1 text-xs'}`}>{description}</span>
        )}
      </span>
      <span className={`flex shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white font-pixel leading-none text-pixel-black/65 ${careMode ? 'h-11 w-11 text-4xl' : 'h-7 w-7 text-xl'}`}>
        ›
      </span>
    </Link>
  );
}

function MobileProjectRow({
  project,
  displayMode,
  onDelete,
}: {
  project: Project;
  displayMode: MobileDisplayMode;
  onDelete?: (project: Project) => void;
}) {
  const careMode = displayMode === 'care';
  return (
    <div className="group/project-row relative">
      <MobileLinkRow
        href={`/projects?project=${encodeURIComponent(project.id)}`}
        title={project.name}
        description={project.description || projectSubtitle(project)}
        badge={project.ganttEnabled ? 'GANTT' : project.teamIds.length ? `${project.teamIds.length}` : undefined}
        icon={<FolderIcon src={project.icon} className={careMode ? 'h-14 w-14' : 'h-8 w-8'} />}
        accent="bg-pixel-blue"
        displayMode={displayMode}
      />
      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete(project);
          }}
          className={`absolute left-2 top-2 z-10 flex items-center justify-center border-2 border-pixel-black bg-pixel-red font-pixel font-bold leading-none text-pixel-white opacity-0 transition-opacity hover:brightness-95 group-hover/project-row:opacity-100 group-focus-within/project-row:opacity-100 ${careMode ? 'h-10 w-10 text-lg' : 'h-7 w-7 text-sm'}`}
          style={{ boxShadow: '2px 2px 0 #101010' }}
          aria-label={`删除项目 ${project.name}`}
          title="删除项目"
        >
          X
        </button>
      )}
    </div>
  );
}

function MobileAgentRow({ agent, displayMode }: { agent: Lobster; displayMode: MobileDisplayMode }) {
  const hasProvider = hasConfiguredProvider(agent);
  const careMode = displayMode === 'care';
  return (
    <Link href={`/agent/${agent.id}`} className={`flex items-center border-b-2 border-pixel-black/10 bg-pixel-white last:border-b-0 active:bg-pixel-yellow/40 ${careMode ? 'min-h-[116px] gap-3 px-4 py-4' : 'min-h-[72px] gap-2 px-3 py-2.5'}`}>
      <div className={`relative shrink-0 border-pixel-black bg-pixel-white ${careMode ? 'h-[78px] w-[78px] border-4' : 'h-12 w-12 border-3'} ${hasProvider ? '' : 'bg-pixel-gray/20'}`}>
        <img
          src={agent.avatar || '/lobsters/lobster-004.png'}
          alt={agent.name}
          className={`h-full w-full object-contain ${hasProvider ? 'animate-online-agent-profile' : 'grayscale opacity-45'}`}
          style={{ imageRendering: 'pixelated' }}
        />
        <span
          aria-label={hasProvider ? '已配置供应商' : '未配置供应商'}
          className={`absolute rounded-full border-pixel-black ${careMode ? '-right-1.5 -top-1.5 h-5 w-5 border-2' : '-right-1 -top-1 h-3.5 w-3.5 border'} ${
            hasProvider ? 'bg-pixel-green' : 'bg-pixel-gray'
          }`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-pixel font-bold leading-tight text-pixel-black ${careMode ? 'text-[1.85rem]' : 'text-base'}`}>{agent.name}</p>
        <p className={`truncate font-pixel leading-tight text-pixel-black/60 ${careMode ? 'mt-2.5 text-[1.35rem]' : 'mt-1 text-xs'}`}>
          {agent.description || agent.role || (hasProvider ? '已配置供应商' : '未配置供应商')}
        </p>
      </div>
      <span className={`flex shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white font-pixel leading-none text-pixel-black/65 ${careMode ? 'h-11 w-11 text-4xl' : 'h-7 w-7 text-xl'}`}>›</span>
    </Link>
  );
}

function formatMobileChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function MobileTeaPartyAvatar({
  members,
  displayMode,
}: {
  members: Lobster[];
  displayMode: MobileDisplayMode;
}) {
  const careMode = displayMode === 'care';
  const visibleMembers = members.slice(0, 4);
  const sizeClass = careMode ? 'h-[78px] w-[78px] border-4' : 'h-12 w-12 border-3';

  if (visibleMembers.length === 0) {
    return (
      <div className={`flex shrink-0 items-center justify-center border-pixel-black bg-pixel-yellow text-pixel-black ${sizeClass}`}>
        <MobileNavIcon tab="teams" compact={!careMode} />
      </div>
    );
  }

  return (
    <div className={`grid shrink-0 grid-cols-2 gap-0.5 overflow-hidden border-pixel-black bg-pixel-white p-0.5 ${sizeClass}`}>
      {visibleMembers.map((member) => (
        <div key={member.id} className="min-h-0 min-w-0 overflow-hidden bg-pixel-black/5">
          <img
            src={member.avatar || '/lobsters/lobster-004.png'}
            alt={member.name}
            className="h-full w-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      ))}
      {Array.from({ length: Math.max(0, 4 - visibleMembers.length) }).map((_, index) => (
        <div key={`empty-${index}`} className="bg-pixel-black/5" />
      ))}
    </div>
  );
}

function MobileTeaPartyList({
  sessions,
  sessionMessages,
  lobsters,
  displayMode,
}: {
  sessions: Session[];
  sessionMessages: SessionMessage[];
  lobsters: Lobster[];
  displayMode: MobileDisplayMode;
}) {
  const careMode = displayMode === 'care';
  const sortedSessions = [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const messagesBySession = sessionMessages.reduce<Record<string, SessionMessage[]>>((groups, message) => {
    groups[message.sessionId] = [...(groups[message.sessionId] || []), message];
    return groups;
  }, {});

  return (
    <div className="bg-pixel-white">
      {sortedSessions.length > 0 ? (
        sortedSessions.map((session) => {
          const members = lobsters.filter((lobster) => session.memberIds.includes(lobster.id));
          const lastMessage = (messagesBySession[session.id] || []).slice(-1)[0];
          const preview = lastMessage
            ? `${lastMessage.senderName}: ${lastMessage.content}`
            : members.length > 0
              ? `${members.length} 位 Agent 已在群聊中`
              : '还没有成员，进入后邀请 Agent';

          return (
            <Link
              key={session.id}
              href={`/agent-tea-party?sessionId=${encodeURIComponent(session.id)}`}
              className={`flex items-center border-b-2 border-pixel-black/10 bg-pixel-white last:border-b-0 active:bg-pixel-yellow/40 ${careMode ? 'min-h-[116px] gap-3 px-4 py-4' : 'min-h-[72px] gap-2 px-3 py-2.5'}`}
            >
              <MobileTeaPartyAvatar members={members} displayMode={displayMode} />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-pixel font-bold leading-tight text-pixel-black ${careMode ? 'text-[1.85rem]' : 'text-base'}`}>{session.name}</p>
                <p className={`truncate font-pixel leading-tight text-pixel-black/60 ${careMode ? 'mt-2.5 text-[1.35rem]' : 'mt-1 text-xs'}`}>
                  {preview}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-pixel leading-none text-pixel-black/45 ${careMode ? 'text-[1.1rem]' : 'text-[10px]'}`}>{formatMobileChatTime(session.updatedAt)}</p>
                <p className={`mt-2 border-2 border-pixel-black bg-pixel-yellow px-1.5 py-0.5 font-pixel leading-none text-pixel-black ${careMode ? 'text-base' : 'text-[10px]'}`}>
                  {session.memberIds.length}
                </p>
              </div>
            </Link>
          );
        })
      ) : (
        <Link
          href="/agent-tea-party"
          className={`flex items-center border-b-2 border-pixel-black/10 bg-pixel-white active:bg-pixel-yellow/40 ${careMode ? 'min-h-[116px] gap-3 px-4 py-4' : 'min-h-[72px] gap-2 px-3 py-2.5'}`}
        >
          <MobileTeaPartyAvatar members={[]} displayMode={displayMode} />
          <div className="min-w-0 flex-1">
            <p className={`font-pixel font-bold leading-tight text-pixel-black ${careMode ? 'text-[1.85rem]' : 'text-base'}`}>还没有群聊</p>
            <p className={`truncate font-pixel leading-tight text-pixel-black/60 ${careMode ? 'mt-2.5 text-[1.35rem]' : 'mt-1 text-xs'}`}>
              进入茶话会后创建第一个 Agent 群聊
            </p>
          </div>
        </Link>
      )}
    </div>
  );
}

function MobileDisplayModeSwitch({
  displayMode,
  onChange,
}: {
  displayMode: MobileDisplayMode;
  onChange: (mode: MobileDisplayMode) => void;
}) {
  const options: Array<{ mode: MobileDisplayMode; title: string; description: string }> = [
    { mode: 'normal', title: '正常版', description: '更接近微信的紧凑比例' },
    { mode: 'care', title: '关爱版', description: '更大的文字、图标和按钮' },
  ];

  return (
    <div data-mobile-display-settings="true" className="border-b-2 border-pixel-black/10 bg-pixel-white px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="font-pixel text-base font-bold leading-tight text-pixel-black">显示模式</p>
          <p className="mt-0.5 font-pixel text-xs leading-tight text-pixel-black/55">默认正常版，需要大字时可切换关爱版</p>
        </div>
        <span className="min-w-[52px] whitespace-nowrap border-2 border-pixel-black bg-pixel-yellow px-2 py-1 text-center font-pixel text-xs leading-none text-pixel-black">
          {displayMode === 'care' ? '关爱' : '正常'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = displayMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              data-mobile-display-option={option.mode}
              aria-pressed={active}
              onClick={() => onChange(option.mode)}
              className={`border-2 border-pixel-black px-2 py-2 text-left font-pixel leading-tight ${
                active ? 'bg-pixel-blue text-pixel-white' : 'bg-pixel-white text-pixel-black'
              }`}
              style={{ boxShadow: active ? '2px 2px 0 #101010' : '1px 1px 0 rgba(16,16,16,0.3)' }}
            >
              <span className="block text-sm font-bold">{option.title}</span>
              <span className={`mt-1 block text-xs ${active ? 'text-pixel-white/80' : 'text-pixel-black/55'}`}>{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OfficialAdoptPrompt({
  isLoggedIn,
  promptKey,
  legacyPromptKey,
  agentCount,
  agentDataReady,
  userName,
  onOfficialAdopted,
}: {
  isLoggedIn: boolean;
  promptKey: string | null;
  legacyPromptKey?: string | null;
  agentCount: number;
  agentDataReady: boolean;
  userName?: string;
  onOfficialAdopted: () => Promise<void>;
}) {
  const router = useRouter();
  const defaultOfficialName = userName ? `${userName}的官方龙虾` : '官方龙虾';
  const [showOfficialAdoptPrompt, setShowOfficialAdoptPrompt] = useState(false);
  const [officialAdoptName, setOfficialAdoptName] = useState(defaultOfficialName);
  const [isOfficialAdopting, setIsOfficialAdopting] = useState(false);
  const [officialAdoptError, setOfficialAdoptError] = useState('');

  useEffect(() => {
    setOfficialAdoptName(defaultOfficialName);
  }, [defaultOfficialName]);

  useEffect(() => {
    if (!isLoggedIn || !promptKey || !agentDataReady || agentCount > 0) {
      setShowOfficialAdoptPrompt(false);
      return;
    }

    const hasSeenPrompt = [promptKey, legacyPromptKey]
      .filter(Boolean)
      .some((key) => window.localStorage.getItem(key as string));
    if (hasSeenPrompt) {
      setShowOfficialAdoptPrompt(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowOfficialAdoptPrompt(true);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [agentCount, agentDataReady, isLoggedIn, legacyPromptKey, promptKey]);

  const markOfficialPromptSeen = () => {
    for (const key of [promptKey, legacyPromptKey].filter(Boolean) as string[]) {
      window.localStorage.setItem(key, new Date().toISOString());
    }
  };

  const dismissOfficialAdoptPrompt = () => {
    markOfficialPromptSeen();
    setShowOfficialAdoptPrompt(false);
    setOfficialAdoptError('');
  };

  const handleOfficialAdopt = async () => {
    const trimmedName = officialAdoptName.trim() || defaultOfficialName;
    if (isOfficialAdopting) return;

    setIsOfficialAdopting(true);
    setOfficialAdoptError('');
    try {
      await adoptOfficialLobster(trimmedName);
      markOfficialPromptSeen();
      setShowOfficialAdoptPrompt(false);
      await onOfficialAdopted();
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      router.replace(isMobile ? '/?mobileTab=contacts' : '/my-den');
    } catch (error) {
      setOfficialAdoptError(error instanceof Error ? error.message : '领取官方龙虾失败。');
    } finally {
      setIsOfficialAdopting(false);
    }
  };

  if (!showOfficialAdoptPrompt) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-pixel-black/70 p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[680px] border-4 border-pixel-black bg-white p-4 md:p-5"
        style={{ boxShadow: '6px 6px 0 #101010' }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-pixel text-xl font-bold leading-tight text-pixel-black md:text-2xl">领取官方龙虾</h2>
            <p className="mt-1 font-pixel text-xs leading-tight text-pixel-black/60 md:text-sm">
              先领养一只官方 Agent，马上进入通讯录。
            </p>
          </div>
          <button
            type="button"
            onClick={dismissOfficialAdoptPrompt}
            className="shrink-0 border-2 border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-sm leading-none text-pixel-black"
            aria-label="关闭领取官方龙虾弹窗"
          >
            ×
          </button>
        </div>

        <div className="mb-4 grid items-center gap-4 border-4 border-pixel-black bg-white p-3 sm:grid-cols-[140px_1fr] md:p-4">
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto flex h-28 w-28 shrink-0 items-center justify-center bg-transparent sm:h-32 sm:w-32"
          >
            <img
              src={OFFICIAL_LOBSTER_AVATAR}
              alt="官方龙虾"
              className="h-24 w-24 object-contain sm:h-28 sm:w-28"
              style={{ imageRendering: 'pixelated' }}
            />
          </motion.div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block font-pixel text-xs text-pixel-black/70">Agent 名字</label>
            <input
              value={officialAdoptName}
              onChange={(event) => setOfficialAdoptName(event.target.value)}
              disabled={isOfficialAdopting}
              className="w-full border-3 border-pixel-black bg-white px-3 py-2 font-pixel text-sm text-pixel-black outline-none disabled:opacity-50 md:text-base"
              style={{ boxShadow: 'inset 2px 2px 0 #101010' }}
            />
          </div>
        </div>

        {officialAdoptError && (
          <div className="mb-3 border-3 border-pixel-red bg-pixel-red/10 p-2">
            <p className="font-pixel text-xs text-pixel-red">{officialAdoptError}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={dismissOfficialAdoptPrompt}
            disabled={isOfficialAdopting}
            className="border-4 border-pixel-black bg-pixel-white px-3 py-3 font-pixel text-sm text-pixel-black disabled:opacity-50 md:text-base"
            style={{ boxShadow: '3px 3px 0 #101010' }}
          >
            稍后
          </button>
          <button
            type="button"
            onClick={() => void handleOfficialAdopt()}
            disabled={isOfficialAdopting}
            className="border-4 border-pixel-black bg-pixel-green px-3 py-3 font-pixel text-sm text-pixel-white disabled:opacity-50 md:text-base"
            style={{ boxShadow: '3px 3px 0 #101010' }}
          >
            {isOfficialAdopting ? '领取中...' : '领取'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function MobileHome({
  lobsters,
  projects,
  sessions,
  sessionMessages,
  teamCount,
  isLoggedIn,
  onDeleteProject,
}: {
  lobsters: Lobster[];
  projects: Project[];
  sessions: Session[];
  sessionMessages: SessionMessage[];
  teamCount: number;
  isLoggedIn: boolean;
  onDeleteProject?: (project: Project) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [displayMode, setMobileDisplayMode] = useMobileDisplayMode();
  const { user, logout } = useAuthStore();
  const careMode = displayMode === 'care';
  const requestedTab = searchParams.get('mobileTab');
  const activeTab: MobileTabKey = isMobileTabKey(requestedTab) ? requestedTab : 'projects';
  const recentProjects = projects.slice(0, 4);
  const recentAgents = lobsters.slice(0, 20);
  const activeTabMeta = mobileTabs.find((tab) => tab.key === activeTab) ?? mobileTabs[0];
  const configuredAgentCount = lobsters.filter(hasConfiguredProvider).length;
  const activeSummary =
    activeTab === 'projects'
      ? `${projects.length} 个项目`
      : activeTab === 'contacts'
        ? `${configuredAgentCount}/${lobsters.length} 已配置供应商`
        : activeTab === 'teams'
          ? `${teamCount} 个团队 · 可发起群聊`
          : activeTab === 'discover'
            ? '市场 · 召唤 · 官方 Agent'
            : isLoggedIn
              ? '账号、供应商与 Agent 窝'
              : '登录后同步你的 Agent';

  return (
    <div className="md:hidden -mx-4 bg-pixel-white px-4">
      <div className={careMode ? 'min-h-[calc(100vh-112px)] pb-36' : 'min-h-[calc(100vh-70px)] pb-24'}>
        <div className={`sticky top-0 z-20 -mx-4 border-b-4 border-pixel-black bg-pixel-white px-4 ${careMode ? 'py-2' : 'py-1.5'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`hidden font-pixel leading-none text-pixel-black/55 ${careMode ? 'text-[1.35rem]' : 'text-xs'}`}>OPENCLAW</p>
              <h1 className={`truncate font-pixel font-bold leading-none text-pixel-black ${careMode ? 'text-[2rem]' : 'text-[1.25rem]'}`}>
                {activeTabMeta.label}
              </h1>
              <p className={`truncate font-pixel leading-tight text-pixel-black/55 ${careMode ? 'mt-1 text-[1.1rem]' : 'mt-0.5 text-[11px]'}`}>{activeSummary}</p>
            </div>
            <div className={`flex shrink-0 items-center justify-center border-pixel-black ${careMode ? 'h-14 w-14 border-4' : 'h-10 w-10 border-2'} ${activeTabMeta.accent} text-pixel-white`} style={{ boxShadow: careMode ? '4px 4px 0 #101010' : '2px 2px 0 #101010' }}>
              <MobileNavIcon tab={activeTab} compact={!careMode} />
            </div>
          </div>
          <div className={`hidden grid-cols-3 gap-2 ${careMode ? 'mt-3' : 'mt-2'}`}>
            <div className={`border-2 border-pixel-black bg-pixel-blue px-2 text-center text-pixel-white ${careMode ? 'py-2' : 'py-1.5'}`}>
              <p className={`font-pixel leading-none ${careMode ? 'text-base' : 'text-xs'}`}>项目</p>
              <p className={`mt-1 font-pixel leading-none ${careMode ? 'text-[1.7rem]' : 'text-base'}`}>{projects.length}</p>
            </div>
            <div className={`border-2 border-pixel-black bg-pixel-green px-2 text-center text-pixel-white ${careMode ? 'py-2' : 'py-1.5'}`}>
              <p className={`font-pixel leading-none ${careMode ? 'text-base' : 'text-xs'}`}>Agent</p>
              <p className={`mt-1 font-pixel leading-none ${careMode ? 'text-[1.7rem]' : 'text-base'}`}>{lobsters.length}</p>
            </div>
            <div className={`border-2 border-pixel-black bg-pixel-yellow px-2 text-center text-pixel-black ${careMode ? 'py-2' : 'py-1.5'}`}>
              <p className={`font-pixel leading-none ${careMode ? 'text-base' : 'text-xs'}`}>团队</p>
              <p className={`mt-1 font-pixel leading-none ${careMode ? 'text-[1.7rem]' : 'text-base'}`}>{teamCount}</p>
            </div>
          </div>
        </div>

        <main className={careMode ? 'mt-3 space-y-4' : 'mt-2 space-y-2.5'}>
          {activeTab === 'projects' && (
            <MobilePanel>
              <div className={`flex items-center justify-between border-b-4 border-pixel-black bg-pixel-blue text-pixel-white ${careMode ? 'px-4 py-3' : 'px-3 py-2'}`}>
                <div>
                  <p className={`font-pixel font-bold leading-tight ${careMode ? 'text-[1.8rem]' : 'text-base'}`}>最近项目</p>
                  <p className={`mt-1 font-pixel leading-tight text-pixel-white/80 ${careMode ? 'text-lg' : 'text-xs'}`}>团队共享的服务器工作空间</p>
                </div>
                <Link href="/projects" className={`border-2 border-pixel-black bg-pixel-white font-pixel leading-none text-pixel-black ${careMode ? 'px-3 py-1.5 text-xl' : 'px-2 py-1 text-xs'}`}>管理</Link>
              </div>
              {recentProjects.length > 0 ? (
                recentProjects.map((project) => (
                  <MobileProjectRow
                    key={project.id}
                    project={project}
                    displayMode={displayMode}
                    onDelete={onDeleteProject}
                  />
                ))
              ) : (
                <MobileLinkRow
                  href="/projects"
                  title="新建第一个项目"
                  description="为服务器上的个人工作空间命名并绑定团队"
                  icon={<FolderIcon className={careMode ? 'h-12 w-12' : 'h-8 w-8'} />}
                  accent="bg-pixel-blue"
                  displayMode={displayMode}
                />
              )}
            </MobilePanel>
          )}

          {activeTab === 'contacts' && (
            <MobilePanel>
              <div className={`border-b-4 border-pixel-black bg-pixel-green text-pixel-white ${careMode ? 'px-4 py-3' : 'px-3 py-2'}`}>
                <p className={`font-pixel font-bold leading-tight ${careMode ? 'text-[1.8rem]' : 'text-base'}`}>Agent 通讯录</p>
                <p className={`mt-1 font-pixel leading-tight text-pixel-white/80 ${careMode ? 'text-lg' : 'text-xs'}`}>
                  {configuredAgentCount}/{lobsters.length} 已配置供应商
                </p>
              </div>
              {recentAgents.length > 0 ? (
                recentAgents.map((agent) => <MobileAgentRow key={agent.id} agent={agent} displayMode={displayMode} />)
              ) : (
                <MobileLinkRow href="/upload" title="暂无 Agent" description="上传或召唤一个 Agent" accent="bg-pixel-green" displayMode={displayMode} />
              )}
            </MobilePanel>
          )}

          {activeTab === 'teams' && (
            <MobilePanel>
              <div className={`border-b-4 border-pixel-black bg-pixel-yellow text-pixel-black ${careMode ? 'px-4 py-3' : 'px-3 py-2'}`}>
                <p className={`font-pixel font-bold leading-tight ${careMode ? 'text-[1.8rem]' : 'text-base'}`}>团队工作台</p>
                <p className={`mt-1 font-pixel leading-tight text-pixel-black/65 ${careMode ? 'text-lg' : 'text-xs'}`}>创建团队、管理团队、进入群聊</p>
              </div>
              <MobileLinkRow
                href="/architectures/create"
                title="创建团队"
                description="用画布或自然语言设计 Agent 团队"
                badge="新建"
                accent="bg-pixel-blue"
                icon={<MobileNavIcon tab="teams" compact={!careMode} />}
                displayMode={displayMode}
              />
              <MobileLinkRow href="/architectures/mine" title="我的团队" description={`已创建 ${teamCount} 个团队`} accent="bg-pixel-green" icon={<MobileNavIcon tab="teams" compact={!careMode} />} displayMode={displayMode} />
            </MobilePanel>
          )}

          {activeTab === 'teams' && (
            <MobilePanel>
              <div className={`border-b-4 border-pixel-black bg-pixel-yellow text-pixel-black ${careMode ? 'px-4 py-3' : 'px-3 py-2'}`}>
                <p className={`font-pixel font-bold leading-tight ${careMode ? 'text-[1.8rem]' : 'text-base'}`}>Agent 茶话会</p>
                <p className={`mt-1 font-pixel leading-tight text-pixel-black/65 ${careMode ? 'text-lg' : 'text-xs'}`}>像微信群聊一样进入已创建的 Agent 群</p>
              </div>
              <MobileTeaPartyList sessions={sessions} sessionMessages={sessionMessages} lobsters={lobsters} displayMode={displayMode} />
            </MobilePanel>
          )}

          {activeTab === 'discover' && (
            <MobilePanel>
              <div className={`border-b-4 border-pixel-black bg-pixel-red text-pixel-white ${careMode ? 'px-4 py-3' : 'px-3 py-2'}`}>
                <p className={`font-pixel font-bold leading-tight ${careMode ? 'text-[1.8rem]' : 'text-base'}`}>发现</p>
                <p className={`mt-1 font-pixel leading-tight text-pixel-white/80 ${careMode ? 'text-lg' : 'text-xs'}`}>Agent 世界与跨平台召唤</p>
              </div>
              <MobileLinkRow href="/market" title="Agent 世界" description="浏览市场与论坛" accent="bg-pixel-yellow" icon={<MobileNavIcon tab="discover" compact={!careMode} />} displayMode={displayMode} />
              <MobileLinkRow href="/upload?mode=coze" title="跨次元召唤" description="从 Coze 等平台接入 API Agent" accent="bg-pixel-red" icon={<MobileNavIcon tab="discover" compact={!careMode} />} displayMode={displayMode} />
              <MobileLinkRow href="/adopt" title="领取官方龙虾" description="快速创建一个真实后端 Agent" accent="bg-pixel-green" icon={<MobileNavIcon tab="contacts" compact={!careMode} />} displayMode={displayMode} />
            </MobilePanel>
          )}

          {activeTab === 'me' && (
            <MobilePanel>
              <div className={`border-b-4 border-pixel-black ${isLoggedIn ? 'bg-pixel-blue' : 'bg-pixel-gray'} text-pixel-white ${careMode ? 'px-4 py-3' : 'px-3 py-2'}`}>
                <p className={`font-pixel font-bold leading-tight ${careMode ? 'text-[1.8rem]' : 'text-base'}`}>
                  {isLoggedIn ? '已登录' : '未登录'}
                </p>
                <p className={`mt-1 font-pixel leading-tight text-pixel-white/80 ${careMode ? 'text-lg' : 'text-xs'}`}>
                  {isLoggedIn && user?.username ? `${user.username} · 供应商、导入和个人 Agent 管理` : '登录后同步你的 Agent、团队和项目'}
                </p>
              </div>
              <div className={`border-b-2 border-pixel-black/10 bg-pixel-white p-3 ${careMode ? 'space-y-3' : 'space-y-2'}`}>
                {isLoggedIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      router.replace('/?mobileTab=me');
                    }}
                    className={`flex w-full items-center justify-center border-4 border-pixel-black bg-pixel-red font-pixel font-bold leading-none text-pixel-white ${careMode ? 'min-h-[64px] px-4 text-2xl' : 'min-h-[48px] px-3 text-base'}`}
                    style={{ boxShadow: '3px 3px 0 #101010' }}
                  >
                    注销登录
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/auth/login"
                      className={`flex items-center justify-center border-4 border-pixel-black bg-pixel-blue font-pixel font-bold leading-none text-pixel-white no-underline ${careMode ? 'min-h-[64px] px-4 text-2xl' : 'min-h-[48px] px-3 text-base'}`}
                      style={{ boxShadow: '3px 3px 0 #101010' }}
                    >
                      登录
                    </Link>
                    <Link
                      href="/auth/register"
                      className={`flex items-center justify-center border-4 border-pixel-black bg-pixel-green font-pixel font-bold leading-none text-pixel-white no-underline ${careMode ? 'min-h-[64px] px-4 text-2xl' : 'min-h-[48px] px-3 text-base'}`}
                      style={{ boxShadow: '3px 3px 0 #101010' }}
                    >
                      注册
                    </Link>
                  </div>
                )}
              </div>
              <MobileDisplayModeSwitch displayMode={displayMode} onChange={setMobileDisplayMode} />
              <MobileLinkRow href="/settings/providers" title="供应商设置" description="配置模型供应商与 API Key" accent="bg-pixel-blue" icon={<MobileNavIcon tab="me" compact={!careMode} />} displayMode={displayMode} />
              <MobileLinkRow href="/my-den" title="我的 Agent 窝" description={`拥有 ${lobsters.length} 个 Agent`} accent="bg-pixel-green" icon={<MobileNavIcon tab="contacts" compact={!careMode} />} displayMode={displayMode} />
              <MobileLinkRow href="/upload" title="上传 Agent" description="导入文件夹、zip 或跨平台 API Agent" accent="bg-pixel-yellow" icon={<MobileNavIcon tab="discover" compact={!careMode} />} displayMode={displayMode} />
            </MobilePanel>
          )}
        </main>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  index,
  onDelete,
}: {
  project: Project;
  index: number;
  onDelete?: (project: Project) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group/project-card relative min-h-[148px] border-4 border-pixel-black bg-pixel-white p-3"
      style={{ boxShadow: '4px 4px 0px 0px #101010' }}
    >
      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete(project);
          }}
          className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center border-2 border-pixel-black bg-pixel-red font-pixel text-base font-bold leading-none text-pixel-white opacity-0 transition-opacity hover:brightness-95 group-hover/project-card:opacity-100 group-focus-within/project-card:opacity-100"
          style={{ boxShadow: '2px 2px 0 #101010' }}
          aria-label={`删除项目 ${project.name}`}
          title="删除项目"
        >
          X
        </button>
      )}
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start gap-3">
          <FolderIcon src={project.icon} className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <h4 className="truncate font-pixel text-lg font-bold text-pixel-black">{project.name}</h4>
            <p className="mt-1 line-clamp-2 font-pixel text-sm leading-snug text-pixel-black/65">
              {project.description || project.notes || '服务器个人工作空间'}
            </p>
          </div>
        </div>
        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            <span className="border-2 border-pixel-black bg-pixel-blue px-2 py-0.5 font-pixel text-xs text-pixel-white">
              {project.teamIds.length} TEAM
            </span>
            <span className="border-2 border-pixel-black bg-pixel-yellow px-2 py-0.5 font-pixel text-xs text-pixel-black">
              {project.gitBranch || 'main'}
            </span>
          </div>
          <Link
            href={`/projects?project=${encodeURIComponent(project.id)}`}
            className="inline-block border-2 border-pixel-black bg-pixel-blue px-3 py-1 font-pixel text-xs text-pixel-white hover:bg-pixel-gray"
            style={{ boxShadow: '2px 2px 0px 0px #101010' }}
          >
            打开项目
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

type DesktopActionTone = 'green' | 'blue' | 'yellow' | 'red' | 'gray';
type DesktopActionIcon = 'adopt' | 'upload' | 'market' | 'den' | 'team' | 'teams' | 'projects' | 'tea' | 'home' | 'settings';

interface TraditionalDesktopHomeProps {
  lobsters: Lobster[];
  projects: Project[];
  sessionMessages: SessionMessage[];
  teamCount: number;
  isLoggedIn: boolean;
  isLocalMode: boolean;
  hasSeenHero: boolean;
  deleteAgentAPI: (id: string) => Promise<void> | void;
  deleteProjectAPI: (id: string) => Promise<void> | void;
  onConfigAgent: (agent: Lobster) => void;
  onChanged: () => Promise<void> | void;
}

interface DesktopActionItem {
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  tone: DesktopActionTone;
  icon: DesktopActionIcon;
}

const toneStyles: Record<DesktopActionTone, { bg: string; border: string; text: string }> = {
  green: { bg: 'bg-pixel-green', border: 'border-t-pixel-green', text: 'text-pixel-green' },
  blue: { bg: 'bg-pixel-blue', border: 'border-t-pixel-blue', text: 'text-pixel-blue' },
  yellow: { bg: 'bg-pixel-yellow', border: 'border-t-pixel-yellow', text: 'text-pixel-yellow' },
  red: { bg: 'bg-pixel-red', border: 'border-t-pixel-red', text: 'text-pixel-red' },
  gray: { bg: 'bg-pixel-gray', border: 'border-t-pixel-gray', text: 'text-pixel-gray' },
};

function DesktopGlyph({ icon, className = 'h-7 w-7' }: { icon: DesktopActionIcon; className?: string }) {
  if (icon === 'adopt') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1 5h2v6h-2Zm0 8h2v2h-2Z" />
      </svg>
    );
  }
  if (icon === 'upload') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M6 2h9l5 5v15H6V2Zm8 1v5h5M12 11v6M9 14l3-3 3 3" />
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
  if (icon === 'den' || icon === 'home') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M12 3 3 9v12h7v-6h4v6h7V9Zm0 2.5L18 10v9h-2v-6H8v6H6v-9Z" />
      </svg>
    );
  }
  if (icon === 'team') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" />
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
    return <FolderSilhouetteIcon className={className} />;
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
      <path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm0 14H6l-2 2V4h16Z" />
      <path fill="currentColor" d="M7 9h10v2H7Zm0-3h10v2H7Z" />
    </svg>
  );
}

function getDesktopActions({
  isLocalMode,
  isLoggedIn,
  lobsterCount,
  projectCount,
  teamCount,
}: {
  isLocalMode: boolean;
  isLoggedIn: boolean;
  lobsterCount: number;
  projectCount: number;
  teamCount: number;
}): DesktopActionItem[] {
  return [
    {
      href: '/adopt',
      title: '快速领养',
      description: '立即获得新伙伴，一键部署到你的工作空间。',
      eyebrow: 'QUICK ADOPT',
      tone: 'green',
      icon: 'adopt',
    },
    {
      href: '/upload',
      title: isLocalMode ? '导入 Agent' : '上传 Agent',
      description: isLocalMode ? '识别本地 Agent 并设置介绍头像。' : '导入训练好的智能体，配置为你的专属 Agent。',
      eyebrow: isLocalMode ? 'IMPORT' : 'UPLOAD',
      tone: 'blue',
      icon: 'upload',
    },
    {
      href: '/market',
      title: 'Agent 世界',
      description: '浏览 Agent 市场与论坛，发现社区精选。',
      eyebrow: 'MARKET',
      tone: 'yellow',
      icon: 'market',
    },
    {
      href: '/my-den',
      title: '我的 Agent 窝',
      description: isLoggedIn ? `管理你已拥有的 ${lobsterCount} 个 Agent。` : '登录后查看你已拥有的 Agent。',
      eyebrow: `MY AGENTS · ${isLoggedIn ? lobsterCount : 0}`,
      tone: 'red',
      icon: 'den',
    },
    {
      href: '/architectures/create',
      title: '创建团队',
      description: '用画布或自然语言设计新的 Agent 协作团队。',
      eyebrow: 'CREATE TEAM',
      tone: 'blue',
      icon: 'team',
    },
    {
      href: '/architectures/mine',
      title: '我的团队',
      description: isLoggedIn ? `查看和管理已创建的 ${teamCount} 个团队。` : '登录后查看和管理团队。',
      eyebrow: `MY TEAMS · ${isLoggedIn ? teamCount : 0}`,
      tone: 'green',
      icon: 'teams',
    },
    {
      href: '/projects',
      title: '我的项目',
      description: isLoggedIn ? `管理 ${projectCount} 个服务器工作空间。` : '登录后查看项目工作空间。',
      eyebrow: `PROJECTS · ${isLoggedIn ? projectCount : 0}`,
      tone: 'yellow',
      icon: 'projects',
    },
    {
      href: '/agent-tea-party',
      title: 'Agent 茶话会',
      description: isLoggedIn ? '进入多 Agent 群聊协作与任务讨论。' : '登录后使用多 Agent 群聊。',
      eyebrow: 'TEA PARTY',
      tone: 'red',
      icon: 'tea',
    },
  ];
}

function TraditionalStatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number | string;
  note: string;
  tone: DesktopActionTone;
}) {
  const styles = toneStyles[tone];
  return (
    <motion.div
      layout
      className={`border-[3px] border-t-[5px] border-pixel-black ${styles.border} bg-pixel-white p-3`}
      style={{ boxShadow: '3px 3px 0px 0px #101010' }}
    >
      <p className="font-pixel text-xs uppercase text-pixel-black/55">{label}</p>
      <p className="mt-1 font-pixel text-3xl font-bold leading-none text-pixel-black">{value}</p>
      <p className={`mt-2 font-pixel text-xs ${styles.text}`}>{note}</p>
    </motion.div>
  );
}

function TraditionalActionTile({ action, index }: { action: DesktopActionItem; index: number }) {
  const styles = toneStyles[action.tone];
  const yellowCard = action.tone === 'yellow';
  const titleClassName = yellowCard
    ? 'text-pixel-black group-hover:text-pixel-blue'
    : 'text-pixel-white group-hover:text-pixel-yellow';
  const descriptionClassName = yellowCard ? 'text-pixel-black/70' : 'text-pixel-white/80';
  const eyebrowClassName = yellowCard ? 'text-pixel-black/55' : 'text-pixel-white/65';
  const arrowClassName = yellowCard ? 'text-pixel-black' : 'text-pixel-white';

  return (
    <Link href={action.href} className="block h-full no-underline">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 * index }}
        whileHover={{ y: -4, x: 2 }}
        whileTap={{ y: 1, scale: 0.99 }}
        className={`group flex h-full min-h-[150px] flex-col border-[3px] border-pixel-black ${styles.bg} p-4 2xl:min-h-[162px]`}
        style={{ boxShadow: '3px 3px 0px 0px #101010' }}
      >
        <span className={`mb-3 flex h-10 w-10 items-center justify-center border-2 border-pixel-black bg-pixel-white ${styles.text}`}>
          <DesktopGlyph icon={action.icon} className="h-6 w-6" />
        </span>
        <h3 className={`font-pixel text-lg font-bold leading-tight transition-colors ${titleClassName}`}>{action.title}</h3>
        <p className={`mt-2 flex-1 font-pixel text-sm leading-snug ${descriptionClassName}`}>{action.description}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className={`font-pixel text-xs uppercase tracking-[0.12em] ${eyebrowClassName}`}>{action.eyebrow}</p>
          <svg viewBox="0 0 24 24" className={`h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 ${arrowClassName}`} aria-hidden="true">
            <path fill="currentColor" d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41Z" />
          </svg>
        </div>
      </motion.div>
    </Link>
  );
}

function TraditionalActionGroup({
  label,
  actions,
  startIndex,
}: {
  label: string;
  actions: DesktopActionItem[];
  startIndex: number;
}) {
  return (
    <section
      className="relative border-[3px] border-pixel-black bg-pixel-white p-4 pt-7"
      style={{ boxShadow: '3px 3px 0px 0px #101010' }}
    >
      <div
        className="absolute -top-[18px] left-4 border-[3px] border-pixel-black bg-pixel-yellow px-4 py-1 font-pixel text-sm uppercase leading-none text-pixel-black"
        style={{ boxShadow: '2px 2px 0px 0px #101010' }}
      >
        {label}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {actions.map((action, index) => (
          <TraditionalActionTile key={action.href} action={action} index={startIndex + index} />
        ))}
      </div>
    </section>
  );
}

function TraditionalPanel({
  title,
  actionHref,
  actionLabel,
  className = '',
  children,
}: {
  title: string;
  actionHref: string;
  actionLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`border-[3px] border-pixel-black bg-pixel-white p-3 ${className}`} style={{ boxShadow: '3px 3px 0px 0px #101010' }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-pixel text-lg font-bold text-pixel-black">■ {title}</h2>
        <Link href={actionHref} className="font-pixel text-sm text-pixel-blue no-underline hover:text-pixel-red">
          {actionLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

function TraditionalDesktopHome({
  lobsters,
  projects,
  sessionMessages,
  teamCount,
  isLoggedIn,
  isLocalMode,
  hasSeenHero,
  deleteAgentAPI,
  deleteProjectAPI,
  onConfigAgent,
  onChanged,
}: TraditionalDesktopHomeProps) {
  const actions = getDesktopActions({
    isLocalMode,
    isLoggedIn,
    lobsterCount: lobsters.length,
    projectCount: projects.length,
    teamCount,
  });
  const singleAgentActions = actions.slice(0, 4);
  const agentTeamActions = actions.slice(4);
  const todayTokenUsage = estimateTokenUsage(sessionMessages);
  const recentProjects = projects.slice(0, 4);

  return (
    <motion.div
      key="traditional"
      className="hidden md:block"
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.985 }}
      transition={{ duration: 0.28, delay: hasSeenHero ? 0 : 0.25 }}
    >
      <div className="relative mx-auto min-h-[760px] w-full max-w-[1840px] overflow-visible">
        <div className="space-y-5">
          <section className="border-[3px] border-pixel-black bg-pixel-white p-5" style={{ boxShadow: '3px 3px 0px 0px #101010' }}>
            <p className="font-pixel text-lg text-pixel-blue">WELCOME TO AGENT WORLD</p>
            <h1 className="chinese-large mt-2 text-pixel-black">欢迎来到 Agent 世界</h1>
            <p className="mt-2 font-pixel text-sm text-pixel-black/60">选择入口开始你的智能体管理与协同工作</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TraditionalStatCard label="Agent数量" value={formatMetricValue(lobsters.length)} note={isLoggedIn ? '已同步到工作台' : '登录后同步'} tone="green" />
            <TraditionalStatCard label="团队数量" value={formatMetricValue(teamCount)} note="可进入团队管理" tone="blue" />
            <TraditionalStatCard label="项目数量" value={formatMetricValue(projects.length)} note="服务器工作空间" tone="yellow" />
            <TraditionalStatCard label="今日token消耗" value={formatMetricValue(todayTokenUsage)} note={todayTokenUsage > 0 ? '按今日消息估算' : '暂无今日消息'} tone="red" />
          </div>

          <div className="grid gap-5 pt-3 xl:grid-cols-2">
            <TraditionalActionGroup label="Single agent" actions={singleAgentActions} startIndex={0} />
            <TraditionalActionGroup label="agent team" actions={agentTeamActions} startIndex={singleAgentActions.length} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(330px,0.72fr)_minmax(0,1.28fr)] 2xl:grid-cols-[minmax(360px,0.68fr)_minmax(0,1.32fr)]">
            <TraditionalPanel title="最近 Agent" actionHref="/my-den" actionLabel="查看全部 →">
              {lobsters.length > 0 && isLoggedIn ? (
                <div className="grid grid-cols-2 gap-2">
                  {lobsters.slice(0, 2).map((lobster) => (
                    <LobsterCard
                      key={lobster.id}
                      lobster={lobster}
                      onDelete={deleteAgentAPI}
                      onConfig={onConfigAgent}
                      onChanged={onChanged}
                      animateOnlineProfile
                    />
                  ))}
                </div>
              ) : (
                <div className="border-[3px] border-pixel-black bg-pixel-white/50 p-4 text-center">
                  <p className="font-pixel text-sm text-pixel-black/50">
                    {isLoggedIn ? '暂无最近 Agent' : '登录后查看最近 Agent'}
                  </p>
                </div>
              )}
            </TraditionalPanel>

            <TraditionalPanel title="最近项目" actionHref="/projects" actionLabel="管理 →">
              {recentProjects.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {recentProjects.slice(0, 4).map((project, index) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      index={index}
                      onDelete={async (target) => {
                        const ok = window.confirm(`确定删除项目「${target.name}」吗？这会删除项目配置和工作空间。`);
                        if (!ok) return;
                        await deleteProjectAPI(target.id);
                        await onChanged();
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Link href="/projects" className="block border-[3px] border-pixel-black bg-pixel-white/50 p-4 text-center no-underline">
                  <p className="font-pixel text-sm text-pixel-black/50">暂无最近项目，点击创建服务器工作空间</p>
                </Link>
              )}
            </TraditionalPanel>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-pixel text-pixel-black/50">加载中...</div>}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const { lobsters, architectures, projects, sessions, sessionMessages, isInitialized, isLoading, initialize, deleteAgentAPI, deleteProjectAPI } = useStore();
  const { token, user } = useAuthStore();
  const desktopBridge = useOpenClawDesktopBridge();
  const isLocalMode = Boolean(desktopBridge);
  const isLoggedIn = !!token || isLocalMode;
  const [showHero, setShowHero] = useState(false);
  const [hasSeenHero, setHasSeenHero] = useState(false);
  const [configAgent, setConfigAgent] = useState<Lobster | null>(null);
  const [desktopDisplayMode] = useDesktopDisplayMode();

  useEffect(() => {
    if (isLoggedIn && (user || isLocalMode)) {
      void initialize();
    }
  }, [isLoggedIn, isLocalMode, user, initialize]);

  const handleDeleteProject = async (project: Project) => {
    const ok = window.confirm(`确定删除项目「${project.name}」吗？这会删除项目配置和工作空间。`);
    if (!ok) return;
    await deleteProjectAPI(project.id);
  };

  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (!isDesktop) {
      setHasSeenHero(true);
      return;
    }

    const hasSeen = sessionStorage.getItem('hasSeenHeroAnimation');
    if (!hasSeen) {
      setShowHero(true);
    } else {
      setHasSeenHero(true);
    }
  }, []);

  const handleEnter = () => {
    sessionStorage.setItem('hasSeenHeroAnimation', 'true');
    window.dispatchEvent(new Event('openclaw:home-intro-complete'));
    setShowHero(false);
    setHasSeenHero(true);
  };

  const recentProjects = projects.slice(0, 4);
  const teamCount = (architectures ?? []).length;

  return (
    <>
      <AnimatePresence>
        {showHero && <PixelHero onEnter={handleEnter} />}
      </AnimatePresence>

      <MobileHome
        lobsters={lobsters}
        projects={projects}
        sessions={sessions}
        sessionMessages={sessionMessages}
        teamCount={teamCount}
        isLoggedIn={isLoggedIn}
        onDeleteProject={handleDeleteProject}
      />

      <OfficialAdoptPrompt
        isLoggedIn={Boolean(token && user)}
        promptKey={token && user ? `openclaw.officialAdoptPrompt.v2.${user.id}` : null}
        legacyPromptKey={token && user ? `openclaw.mobileOfficialAdoptPrompt.${user.id}` : null}
        agentCount={lobsters.length}
        agentDataReady={isInitialized && !isLoading}
        userName={user?.username}
        onOfficialAdopted={initialize}
      />

      <AnimatePresence mode="wait" initial={false}>
        {desktopDisplayMode === 'traditional' ? (
          <TraditionalDesktopHome
            key="traditional"
            lobsters={lobsters}
            projects={projects}
            sessionMessages={sessionMessages}
            teamCount={teamCount}
            isLoggedIn={isLoggedIn}
            isLocalMode={isLocalMode}
            hasSeenHero={hasSeenHero}
            deleteAgentAPI={deleteAgentAPI}
            deleteProjectAPI={deleteProjectAPI}
            onConfigAgent={setConfigAgent}
            onChanged={initialize}
          />
        ) : (
          <motion.div
            key="professional"
            className="hidden space-y-6 md:block"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.985 }}
            transition={{ duration: 0.28, delay: hasSeenHero ? 0 : 0.3 }}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <h1 className="chinese-large mb-2 text-pixel-black">欢迎来到 Agent 世界</h1>
              <p className="font-pixel text-xl text-pixel-blue">WELCOME TO AGENT WORLD</p>
              <p className="mt-2 font-pixel text-sm text-pixel-black/60">选择入口开始你的智能体管理与协同工作</p>
            </motion.div>

            <div className="grid gap-6 md:grid-cols-2">
              <SectionA>
                <div className="space-y-4">
                  <MenuCard
                    href="/adopt"
                    title="快速领养"
                    description="Quick Adopt | 立即获得新伙伴"
                    color="bg-pixel-green"
                    delay={0.1}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-pixel-green">
                        <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1 5h2v6h-2Zm0 8h2v2h-2Z" />
                      </svg>
                    }
                  />
                  <MenuCard
                    href="/upload"
                    title={isLocalMode ? '导入 Agent' : '上传 Agent'}
                    description={isLocalMode ? 'Import | 识别本地 Agent 并设置介绍头像' : 'Upload | 导入训练好的智能体'}
                    color="bg-pixel-blue"
                    delay={0.2}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-pixel-blue">
                        <path fill="currentColor" d="M6 2h9l5 5v15H6V2Zm8 1v5h5M12 11v6M9 14l3-3 3 3" />
                      </svg>
                    }
                  />
                  <MenuCard
                    href="/market"
                    title="Agent 世界"
                    description="Market | Agent 市场与论坛"
                    color="bg-pixel-yellow"
                    delay={0.3}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-pixel-yellow">
                        <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm3.5 14.5-7 2 2-7 7-2-2 7Z" />
                      </svg>
                    }
                  />
                  <MenuCard
                    href="/my-den"
                    title="我的 Agent 窝"
                    description={`My Agents | ${isLoggedIn ? `拥有 ${lobsters.length} 个 Agent` : '登录后查看'}`}
                    color="bg-pixel-red"
                    delay={0.4}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-pixel-red">
                        <path fill="currentColor" d="M12 3 3 9v12h7v-6h4v6h7V9Zm0 2.5L18 10v9h-2v-6H8v6H6v-9Z" />
                      </svg>
                    }
                  />
                </div>

                <div className="mt-6">
                  <h3 className="mb-3 font-pixel text-base text-pixel-black">最近 Agent</h3>
                  {lobsters.length > 0 ? (
                    isLoggedIn ? (
                      <div className="grid grid-cols-3 gap-2">
                        {lobsters.slice(0, 3).map((lobster) => (
                          <LobsterCard
                            key={lobster.id}
                            lobster={lobster}
                            onDelete={deleteAgentAPI}
                            onConfig={setConfigAgent}
                            onChanged={initialize}
                            animateOnlineProfile
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="border-4 border-pixel-black bg-pixel-white/50 p-4 text-center">
                        <p className="font-pixel text-sm text-pixel-black/50">登录后查看最近 Agent</p>
                      </div>
                    )
                  ) : (
                    <div className="border-4 border-pixel-black bg-pixel-white/50 p-4 text-center">
                      <p className="font-pixel text-sm text-pixel-black/50">暂无最近 Agent</p>
                    </div>
                  )}
                </div>
              </SectionA>

              <SectionB>
                <div className="space-y-4">
                  <MenuCard
                    href="/architectures/create"
                    title="创建团队"
                    description="Create | 设计新的 Agent 团队"
                    color="bg-pixel-blue"
                    delay={0.1}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-pixel-blue">
                        <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" />
                      </svg>
                    }
                  />
                  <MenuCard
                    href="/architectures/mine"
                    title="我的团队"
                    description={`My Teams | ${isLoggedIn ? `已创建 ${teamCount} 个` : '登录后查看'}`}
                    color="bg-pixel-green"
                    delay={0.2}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-pixel-green">
                        <path fill="currentColor" d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                    }
                  />
                  <MenuCard
                    href="/projects"
                    title="我的项目"
                    description={`Projects | ${isLoggedIn ? `管理 ${projects.length} 个工作空间` : '登录后查看'}`}
                    color="bg-pixel-yellow"
                    delay={0.3}
                    icon={<FolderSilhouetteIcon className="h-8 w-8 text-pixel-yellow" />}
                  />
                  <MenuCard
                    href="/agent-tea-party"
                    title="Agent 茶话会"
                    description={`Tea Party | ${isLoggedIn ? '多 Agent 群聊协作' : '登录后使用'}`}
                    color="bg-pixel-red"
                    delay={0.4}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-pixel-red">
                        <path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm0 14H6l-2 2V4h16Z" />
                        <path fill="currentColor" d="M7 9h10v2H7Zm0-3h10v2H7Z" />
                      </svg>
                    }
                  />
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-pixel text-base text-pixel-black">最近项目</h3>
                    <Link href="/projects" className="font-pixel text-sm text-pixel-blue">管理项目</Link>
                  </div>
                  {recentProjects.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {recentProjects.map((project, index) => (
                        <ProjectCard key={project.id} project={project} index={index} onDelete={handleDeleteProject} />
                      ))}
                    </div>
                  ) : (
                    <Link href="/projects" className="block border-4 border-pixel-black bg-pixel-white/50 p-4 text-center">
                      <p className="font-pixel text-sm text-pixel-black/50">暂无最近项目，点击创建服务器工作空间</p>
                    </Link>
                  )}
                </div>
              </SectionB>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {configAgent && (
        <AgentConfigModal
          agent={configAgent}
          onClose={() => setConfigAgent(null)}
          onSave={() => {
            setConfigAgent(null);
            void initialize();
          }}
        />
      )}
    </>
  );
}
