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
import { useSearchParams } from 'next/navigation';

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

function MobileProjectRow({ project, displayMode }: { project: Project; displayMode: MobileDisplayMode }) {
  const careMode = displayMode === 'care';
  return (
    <MobileLinkRow
      href={`/projects?project=${encodeURIComponent(project.id)}`}
      title={project.name}
      description={project.description || projectSubtitle(project)}
      badge={project.ganttEnabled ? 'GANTT' : project.teamIds.length ? `${project.teamIds.length}` : undefined}
      icon={<FolderIcon src={project.icon} className={careMode ? 'h-14 w-14' : 'h-8 w-8'} />}
      accent="bg-pixel-blue"
      displayMode={displayMode}
    />
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
          className={`h-full w-full object-contain ${hasProvider ? '' : 'grayscale opacity-45'}`}
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

function MobileHome({
  lobsters,
  projects,
  sessions,
  sessionMessages,
  teamCount,
  isLoggedIn,
}: {
  lobsters: Lobster[];
  projects: Project[];
  sessions: Session[];
  sessionMessages: SessionMessage[];
  teamCount: number;
  isLoggedIn: boolean;
}) {
  const searchParams = useSearchParams();
  const [displayMode, setMobileDisplayMode] = useMobileDisplayMode();
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
                recentProjects.map((project) => <MobileProjectRow key={project.id} project={project} displayMode={displayMode} />)
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
              <MobileLinkRow href="/upload" title="跨次元召唤" description="从 Coze 等平台接入 API Agent" accent="bg-pixel-red" icon={<MobileNavIcon tab="discover" compact={!careMode} />} displayMode={displayMode} />
              <MobileLinkRow href="/adopt" title="领取官方龙虾" description="快速创建一个真实后端 Agent" accent="bg-pixel-green" icon={<MobileNavIcon tab="contacts" compact={!careMode} />} displayMode={displayMode} />
            </MobilePanel>
          )}

          {activeTab === 'me' && (
            <MobilePanel>
              <div className={`border-b-4 border-pixel-black bg-pixel-gray text-pixel-white ${careMode ? 'px-4 py-3' : 'px-3 py-2'}`}>
                <p className={`font-pixel font-bold leading-tight ${careMode ? 'text-[1.8rem]' : 'text-base'}`}>
                  {isLoggedIn ? '已登录' : '未登录'}
                </p>
                <p className={`mt-1 font-pixel leading-tight text-pixel-white/80 ${careMode ? 'text-lg' : 'text-xs'}`}>供应商、导入和个人 Agent 管理</p>
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

function ProjectCard({ project, index }: { project: Project; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="min-h-[148px] border-4 border-pixel-black bg-pixel-white p-3"
      style={{ boxShadow: '4px 4px 0px 0px #101010' }}
    >
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

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-pixel text-pixel-black/50">加载中...</div>}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const { lobsters, architectures, projects, sessions, sessionMessages, initialize, deleteAgentAPI } = useStore();
  const { token, user } = useAuthStore();
  const isLoggedIn = !!token;
  const [showHero, setShowHero] = useState(false);
  const [hasSeenHero, setHasSeenHero] = useState(false);
  const [configAgent, setConfigAgent] = useState<Lobster | null>(null);

  useEffect(() => {
    if (isLoggedIn && user) {
      void initialize();
    }
  }, [isLoggedIn, user, initialize]);

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
    setShowHero(false);
    setHasSeenHero(true);
  };

  const recentProjects = projects.slice(0, 4);

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
        teamCount={(architectures ?? []).length}
        isLoggedIn={isLoggedIn}
      />

      <motion.div
        className="hidden space-y-6 md:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: hasSeenHero ? 0 : 0.3 }}
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
                title="上传 Agent"
                description="Upload | 导入训练好的智能体"
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
                description={`My Teams | ${isLoggedIn ? `已创建 ${(architectures ?? []).length} 个` : '登录后查看'}`}
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
                    <ProjectCard key={project.id} project={project} index={index} />
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
