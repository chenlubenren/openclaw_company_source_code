'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { BackButton } from '@/components/ui/BackButton';
import { PixelButton } from '@/components/ui/PixelButton';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { MessageRenderer } from '@/components/chat/MessageRenderer';
import { LobsterSprite } from '@/components/lobster/LobsterSprite';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { Lobster, Session, SessionMessage, WhiteboardColumn, WhiteboardConnection, WhiteboardNote } from '@/types';
import {
  executeTeaPartyTurn,
  fetchTeaPartySession,
  sendTeaPartySessionMessage,
  stopTeaPartySession,
  type TeaPartySessionState,
} from '@/lib/api';

interface PendingReplyOptions {
  allowRelay?: boolean;
  stopSignal?: () => boolean;
}

type RunLogStatus = 'running' | 'success' | 'error';

interface RunLog {
  id: string;
  sessionId: string;
  agentName: string;
  status: RunLogStatus;
  message: string;
  timestamp: string;
}

interface TeaPartyRuntime {
  active: boolean;
  stopRequested: boolean;
  round: number;
  lastSpeakerIds: string[];
  silenceRounds: Record<string, number>;
  pendingMentionIds: string[];
}

const BOARD_COLUMNS: Array<{ id: WhiteboardColumn; title: string; tone: string }> = [
  { id: 'ideas', title: '观点', tone: 'bg-pixel-yellow/25' },
  { id: 'questions', title: '问题', tone: 'bg-pixel-blue/15' },
  { id: 'actions', title: '行动', tone: 'bg-pixel-green/15' },
  { id: 'risks', title: '风险', tone: 'bg-pixel-red/10' },
];

const WHITEBOARD_BOARD_WIDTH = 1800;
const WHITEBOARD_BOARD_HEIGHT = 1320;
const WHITEBOARD_NOTE_WIDTH = 220;
const WHITEBOARD_NOTE_HEIGHT = 148;
const WHITEBOARD_NOTE_START_Y = 118;

const MAX_RELAY_TURNS = 3;
const MAX_AUTO_DISCUSSION_ROUNDS = 120;
const MAX_SPEAKERS_PER_ROUND = 3;
const AUTO_ROUND_DELAY_MS = [450, 1200] as const;
const BETWEEN_SPEAKER_DELAY_MS = [150, 500] as const;
const STOP_TOPIC_PATTERN = /停止这个话题|停止话题|暂停这个话题|结束这个话题|先停一下|stop this topic|stop topic/i;
const DEFAULT_AGENT_AVATAR = '/lobsters/lobster-004.png';

function goBackOrFallback(fallbackHref: string) {
  if (typeof window === 'undefined') return;
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = fallbackHref;
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAgentInitial(agent: Lobster): string {
  return (agent.name || 'A').slice(0, 1).toUpperCase();
}

function getAgentAvatarSrc(agent?: Lobster | null): string {
  const avatar = agent?.avatar?.trim();
  return avatar || DEFAULT_AGENT_AVATAR;
}

function ChatAvatar({
  agent,
  isUser,
  isSystem,
}: {
  agent?: Lobster | null;
  isUser?: boolean;
  isSystem?: boolean;
}) {
  const label = agent ? getAgentInitial(agent) : isSystem ? '!' : '我';

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border-2 border-pixel-black font-pixel text-xs font-bold ${
        isUser
          ? 'bg-pixel-blue text-pixel-white'
          : isSystem
            ? 'bg-pixel-black text-pixel-white'
            : 'bg-pixel-white text-pixel-black'
      }`}
      style={{ boxShadow: '2px 2px 0 #101010' }}
    >
      {agent ? (
        // eslint-disable-next-line @next/next/no-img-element -- Agent avatars are user-configured runtime assets.
        <img
          src={getAgentAvatarSrc(agent)}
          alt={agent.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        label
      )}
    </div>
  );
}

function GroupAvatar({ members, size = 'md' }: { members: Lobster[]; size?: 'sm' | 'md' }) {
  const visible = members.slice(0, 9);
  const gridClass = visible.length <= 1
    ? 'grid-cols-1'
    : visible.length <= 4
      ? 'grid-cols-2'
      : 'grid-cols-3';
  const sizeClass = size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';

  return (
    <div
      className={`grid ${sizeClass} shrink-0 ${gridClass} gap-0.5 overflow-hidden border-2 border-pixel-black bg-pixel-white p-0.5`}
      style={{ boxShadow: '2px 2px 0 #101010' }}
      aria-label="群头像"
    >
      {visible.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center bg-pixel-black/10 font-pixel text-xs text-pixel-black/50">
          群
        </div>
      ) : (
        visible.map((member) => (
          <div key={member.id} className="min-h-0 min-w-0 overflow-hidden bg-pixel-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element -- Agent avatars are user-configured runtime assets. */}
            <img
              src={getAgentAvatarSrc(member)}
              alt={member.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ))
      )}
    </div>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomBetween([min, max]: readonly [number, number]): number {
  return Math.floor(min + Math.random() * (max - min));
}

function getMentions(content: string, members: Lobster[]): Lobster[] {
  const explicit = members.filter((member) => content.includes(`@${member.name}`));
  if (explicit.length > 0) return explicit;

  if (/@(all|ALL|大家|全体|所有Agent|所有)/.test(content)) {
    return members.slice(0, Math.min(2, members.length));
  }

  return [];
}

function mergeUniqueIds(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

function pickAgentByTopic(members: Lobster[], content: string, turn: number): Lobster | null {
  if (members.length === 0) return null;

  const lower = content.toLowerCase();
  const keywordGroups: Array<{ keywords: string[]; roleWords: string[] }> = [
    {
      keywords: ['代码', '开发', 'bug', '接口', '前端', '后端', 'code', 'api', 'engineering', 'frontend', 'backend'],
      roleWords: ['开发', '代码', '工程', 'code', 'engineering', 'api', 'frontend', 'backend'],
    },
    {
      keywords: ['设计', '视觉', '交互', '页面', '布局', 'ui', 'ux', 'product', 'design', 'layout'],
      roleWords: ['设计', '视觉', 'ui', 'ux', '产品', 'product', 'design'],
    },
    {
      keywords: ['数据', '分析', '指标', '统计', 'data', 'analysis', 'metric'],
      roleWords: ['数据', '分析', '研究', 'data', 'analysis', 'research'],
    },
    {
      keywords: ['文案', '内容', '表达', '介绍', 'copy', 'content', 'writing'],
      roleWords: ['写作', '文案', '内容', '翻译', 'copy', 'content', 'writing'],
    },
    {
      keywords: ['风险', '测试', '质量', '验证', 'risk', 'test', 'quality', 'verification'],
      roleWords: ['测试', '质量', '审核', '安全', 'risk', 'test', 'quality', 'safety', 'verification'],
    },
  ];

  for (const group of keywordGroups) {
    if (!group.keywords.some((keyword) => lower.includes(keyword))) continue;
    const matched = members.find((member) => {
      const profile = `${member.name} ${member.role || ''} ${member.description || ''}`.toLowerCase();
      return group.roleWords.some((word) => profile.includes(word.toLowerCase()));
    });
    if (matched) return matched;
  }

  return members[turn % members.length];
}

function roleRelevanceScore(member: Lobster, content: string): number {
  const profile = `${member.name} ${member.role || ''} ${member.description || ''}`.toLowerCase();
  const lower = content.toLowerCase();
  const groups: Array<{ keywords: string[]; roles: string[]; score: number }> = [
    { keywords: ['ui', 'ux', '前端', '界面', '布局', '视觉', '设计', 'html', 'css'], roles: ['ui', 'ux', 'front', 'design', 'layout', '视觉', '设计', '前端'], score: 8 },
    { keywords: ['api', '后端', '接口', '数据库', '服务', '错误', 'bug'], roles: ['backend', 'api', '工程', '代码', '后端', 'developer'], score: 8 },
    { keywords: ['风险', '测试', '验证', '质量', '边界', '安全'], roles: ['test', 'qa', 'risk', 'quality', '安全', '测试', '审查'], score: 7 },
    { keywords: ['产品', '用户', '体验', '需求', '流程', '策略'], roles: ['product', '产品', '策略', '需求', '体验'], score: 6 },
    { keywords: ['文案', '内容', '表达', '说明', '介绍'], roles: ['copy', 'content', 'writing', '文案', '内容', '写作'], score: 5 },
  ];

  return groups.reduce((score, group) => {
    if (!group.keywords.some((keyword) => lower.includes(keyword))) return score;
    return score + (group.roles.some((role) => profile.includes(role.toLowerCase())) ? group.score : 0);
  }, 0);
}

function desiredSpeakerCount(content: string, membersCount: number, round: number): number {
  if (membersCount <= 1) return membersCount;
  if (round === 0) return Math.min(2, membersCount);
  const isQuestionOrDebate = /[?？]|怎么|如何|为什么|方案|风险|评估|讨论|要不要|是否|能不能/.test(content);
  const base = isQuestionOrDebate ? 2 : 1;
  const extra = membersCount >= 3 && Math.random() > 0.62 ? 1 : 0;
  return Math.min(MAX_SPEAKERS_PER_ROUND, membersCount, base + extra);
}

function selectTeaPartySpeakers(
  members: Lobster[],
  content: string,
  runtime: TeaPartyRuntime
): Lobster[] {
  if (members.length === 0) return [];

  const mentioned = runtime.pendingMentionIds
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is Lobster => Boolean(member));

  if (mentioned.length > 0) {
    return mentioned.slice(0, MAX_SPEAKERS_PER_ROUND);
  }

  const speakerCount = desiredSpeakerCount(content, members.length, runtime.round);
  const topicFallback = pickAgentByTopic(members, content, runtime.round);
  const scored = members
    .map((member, index) => {
      const recentlySpoke = runtime.lastSpeakerIds.includes(member.id);
      const silenceBonus = runtime.silenceRounds[member.id] || 0;
      const topicBonus = topicFallback?.id === member.id ? 7 : 0;
      const score =
        roleRelevanceScore(member, content) +
        topicBonus +
        silenceBonus * 1.6 -
        (recentlySpoke ? 5 : 0) +
        Math.random() * 4 +
        index * 0.01;
      return { member, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, speakerCount).map((item) => item.member);
}

function updateRuntimeAfterSpeakers(runtime: TeaPartyRuntime, members: Lobster[], speakers: Lobster[]) {
  const speakerIds = new Set(speakers.map((speaker) => speaker.id));
  runtime.lastSpeakerIds = speakers.map((speaker) => speaker.id);
  runtime.silenceRounds = Object.fromEntries(
    members.map((member) => [
      member.id,
      speakerIds.has(member.id) ? 0 : (runtime.silenceRounds[member.id] || 0) + 1,
    ])
  );
}

function classifyNote(content: string): WhiteboardColumn {
  if (/[?？]|问题|不确定|需要确认|谁来/.test(content)) return 'questions';
  if (/风险|注意|阻塞|担心|代价|失败|限制/.test(content)) return 'risks';
  if (/行动|下一步|建议|负责|先做|可以把|需要做/.test(content)) return 'actions';
  return 'ideas';
}

function summarizeNoteKeywords(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, 'image')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/[`*_>#~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'key point';

  const phrases = Array.from(
    new Set(
      cleaned
        .split(/[\n。！？!?；;，,、|/]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  return (phrases.length > 0 ? phrases : [cleaned])
    .slice(0, 4)
    .map((item) => (item.length > 24 ? `${item.slice(0, 24)}...` : item))
    .join('\n');
}

function getDefaultNotePosition(column: WhiteboardColumn, index: number): { x: number; y: number } {
  const columnIndex = Math.max(0, BOARD_COLUMNS.findIndex((item) => item.id === column));
  const slotWidth = WHITEBOARD_NOTE_WIDTH + 62;
  const slotHeight = WHITEBOARD_NOTE_HEIGHT + 34;
  const slotsPerRow = Math.max(1, Math.floor((WHITEBOARD_BOARD_WIDTH - 64) / slotWidth));
  const row = Math.floor(index / slotsPerRow);
  const slot = index % slotsPerRow;
  return clampNotePosition(
    32 + slot * slotWidth + (row % 2) * 18,
    WHITEBOARD_NOTE_START_Y + row * slotHeight + (columnIndex % 2) * 10
  );
}

function buildNoteFromMessage(
  sessionId: string,
  content: string,
  authorName: string,
  preferredColumn?: WhiteboardColumn,
  existingCount = 0
): WhiteboardNote {
  const column = preferredColumn || classifyNote(content);
  const position = getDefaultNotePosition(column, existingCount);
  return {
    id: makeId('note'),
    sessionId,
    column,
    text: summarizeNoteKeywords(content),
    authorName,
    createdAt: new Date().toISOString(),
    x: position.x,
    y: position.y,
  };
}

function AddMemberModal({
  session,
  lobsters,
  onAdd,
  onClose,
}: {
  session: Session;
  lobsters: Lobster[];
  onAdd: (lobsterId: string) => void;
  onClose: () => void;
}) {
  const available = lobsters.filter((lobster) => !session.memberIds.includes(lobster.id));

  return (
    <ModalPortal>
      <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/50 p-0 md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        className="flex h-full max-h-none w-full max-w-none flex-col overflow-hidden border-4 border-pixel-black bg-pixel-white md:h-auto md:max-h-[86vh] md:max-w-xl"
        style={{ boxShadow: '8px 8px 0 #101010' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-4 border-pixel-black bg-pixel-blue px-4 py-3">
          <h2 className="font-pixel text-lg text-pixel-white">邀请 Agent</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 border-2 border-pixel-black bg-pixel-white font-pixel text-sm text-pixel-black"
            style={{ boxShadow: '2px 2px 0 #101010' }}
            aria-label="关闭"
          >
            X
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {available.length === 0 ? (
            <div className="border-2 border-dashed border-pixel-black/40 p-6 text-center">
              <p className="font-pixel text-sm text-pixel-black/60">
                当前没有可邀请的 Agent。可以先去“我的 Agent 窝”上传或召唤 Agent。
              </p>
            </div>
          ) : (
            available.map((lobster) => (
              <div
                key={lobster.id}
                className="flex items-center gap-3 border-2 border-pixel-black bg-pixel-white p-3"
                style={{ boxShadow: '3px 3px 0 #101010' }}
              >
                <LobsterSprite lobster={lobster} size="sm" showProviderStatus />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-pixel text-sm font-bold text-pixel-black">{lobster.name}</p>
                  <p className="truncate font-pixel text-xs text-pixel-black/60">{lobster.role || 'AI Agent'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(lobster.id)}
                  className="shrink-0 border-2 border-pixel-black bg-pixel-green px-3 py-1 font-pixel text-xs font-bold text-pixel-white"
                  style={{ boxShadow: '2px 2px 0 #101010' }}
                >
                  加入
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t-4 border-pixel-black p-3">
          <PixelButton variant="secondary" className="w-full" onClick={onClose}>
            完成
          </PixelButton>
        </div>
      </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

function MessageBubble({
  message,
  members,
  currentUserId,
}: {
  message: SessionMessage;
  members: Lobster[];
  currentUserId?: string;
}) {
  const isUser = message.senderId === currentUserId;
  const agent = members.find((member) => member.id === message.senderId);
  const isSystem = message.senderId === 'system';

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 border-pixel-black font-pixel text-xs font-bold ${
          isUser
            ? 'bg-pixel-blue text-pixel-white'
            : isSystem
              ? 'bg-pixel-black text-pixel-white'
              : 'bg-pixel-yellow text-pixel-black'
        }`}
      >
        {agent ? getAgentInitial(agent) : isSystem ? '!' : '我'}
      </div>
      <div className={`flex max-w-[82%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 font-pixel text-[11px] text-pixel-black/60">
          <span>{isUser ? '我' : message.senderName}</span>
          {agent && <span className="border border-pixel-black bg-pixel-white px-1 text-pixel-black">Agent</span>}
          <span>{formatTime(message.timestamp)}</span>
        </div>
        <div
          className={`whitespace-pre-wrap border-2 border-pixel-black px-3 py-2 font-pixel text-sm leading-relaxed ${
            isUser
              ? 'bg-pixel-blue text-pixel-white'
              : isSystem
                ? 'bg-pixel-black text-pixel-white'
                : 'bg-pixel-white text-pixel-black'
          }`}
          style={{ boxShadow: '2px 2px 0 #101010' }}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function TeaPartyMessageBubble({
  message,
  members,
  currentUserId,
}: {
  message: SessionMessage;
  members: Lobster[];
  currentUserId?: string;
}) {
  const isUser = message.senderId === currentUserId;
  const agent = members.find((member) => member.id === message.senderId);
  const isSystem = message.senderId === 'system';

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <ChatAvatar agent={agent} isUser={isUser} isSystem={isSystem} />
      <div className={`flex max-w-[82%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 font-pixel text-[11px] text-pixel-black/60">
          <span>{isUser ? '我' : message.senderName}</span>
          {agent && <span className="border border-pixel-black bg-pixel-white px-1 text-pixel-black">Agent</span>}
          <span>{formatTime(message.timestamp)}</span>
        </div>
        <div
          className={`break-words border-2 border-pixel-black px-3 py-2 font-pixel text-sm leading-relaxed ${
            isUser
              ? 'bg-pixel-blue text-pixel-white'
              : isSystem
                ? 'bg-pixel-black text-pixel-white'
                : 'bg-pixel-white text-pixel-black'
          }`}
          style={{ boxShadow: '2px 2px 0 #101010' }}
        >
          <MessageRenderer content={message.content} tone={isUser || isSystem ? 'inverse' : 'default'} />
        </div>
      </div>
    </div>
  );
}

function RunLogPanel({
  logs,
  runningAgents,
}: {
  logs: RunLog[];
  runningAgents: string[];
}) {
  const [open, setOpen] = useState(false);

  if (logs.length === 0 && runningAgents.length === 0) return null;

  const runningText = runningAgents.length > 0
    ? `${runningAgents.join('、')}正在输入`
    : `${logs.length} 条状态记录`;

  return (
    <div className="border-b-2 border-pixel-black bg-pixel-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-pixel text-xs text-pixel-black"
      >
        <span className="min-w-0 truncate">
          {runningText}
        </span>
        <span className="shrink-0 border border-pixel-black px-2 py-0.5 text-[10px]">
          {open ? '收起' : '展开'}
        </span>
      </button>
      {open && (
        <div className="max-h-28 space-y-1 overflow-y-auto border-t-2 border-pixel-black bg-pixel-black/5 px-3 py-2">
          {logs.slice(-8).map((log) => (
            <div key={log.id} className="flex items-start gap-2 font-pixel text-[11px] text-pixel-black/70">
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  log.status === 'error'
                    ? 'bg-pixel-red'
                    : log.status === 'success'
                      ? 'bg-pixel-green'
                      : 'bg-pixel-blue'
                }`}
              />
              <span className="shrink-0">{formatTime(log.timestamp)}</span>
              <span className="min-w-0 flex-1 break-words">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MembersModal({
  members,
  onAddMember,
  onRemoveMember,
  onClose,
}: {
  members: Lobster[];
  onAddMember: () => void;
  onRemoveMember: (lobsterId: string) => void;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/50 p-0 md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        className="flex h-full max-h-none w-full max-w-none flex-col overflow-hidden border-4 border-pixel-black bg-pixel-white md:h-auto md:max-h-[86vh] md:max-w-lg"
        style={{ boxShadow: '8px 8px 0 #101010' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-4 border-pixel-black bg-pixel-blue px-4 py-3">
          <div>
            <h2 className="font-pixel text-lg text-pixel-white">群成员</h2>
            <p className="font-pixel text-xs text-pixel-white/80">{members.length} 位 Agent</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 border-2 border-pixel-black bg-pixel-white font-pixel text-sm text-pixel-black"
            style={{ boxShadow: '2px 2px 0 #101010' }}
            aria-label="关闭"
          >
            X
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {members.length === 0 ? (
            <p className="border-2 border-dashed border-pixel-black/40 p-5 text-center font-pixel text-sm text-pixel-black/50">
              还没有 Agent 加入。
            </p>
          ) : (
            members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 border-2 border-pixel-black p-3">
                <LobsterSprite lobster={member} size="sm" showProviderStatus />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-pixel text-sm font-bold text-pixel-black">{member.name}</p>
                  <p className="truncate font-pixel text-xs text-pixel-black/60">{member.role || 'AI Agent'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveMember(member.id)}
                  className="border-2 border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-xs text-pixel-red"
                  style={{ boxShadow: '2px 2px 0 #101010' }}
                >
                  移出
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 border-t-4 border-pixel-black p-4">
          <PixelButton variant="secondary" className="flex-1" onClick={onClose}>
            完成
          </PixelButton>
          <PixelButton variant="primary" className="flex-1" onClick={onAddMember}>
            邀请 Agent
          </PixelButton>
        </div>
      </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

function getColumnTone(column: WhiteboardColumn): string {
  return BOARD_COLUMNS.find((item) => item.id === column)?.tone || 'bg-pixel-yellow/25';
}

function clampNotePosition(x: number, y: number): { x: number; y: number };
function clampNotePosition(_column: WhiteboardColumn, x: number, y: number): { x: number; y: number };
function clampNotePosition(
  first: WhiteboardColumn | number,
  second: number,
  third?: number
): { x: number; y: number } {
  const rawX = typeof first === 'number' ? first : second;
  const rawY = typeof first === 'number' ? second : third;
  const safeX = Number.isFinite(rawX) ? rawX : 36;
  const safeY = Number.isFinite(rawY) ? Number(rawY) : WHITEBOARD_NOTE_START_Y;
  return {
    x: Math.max(16, Math.min(WHITEBOARD_BOARD_WIDTH - WHITEBOARD_NOTE_WIDTH - 16, safeX)),
    y: Math.max(82, Math.min(WHITEBOARD_BOARD_HEIGHT - WHITEBOARD_NOTE_HEIGHT - 16, safeY)),
  };
}

function normalizeWhiteboardNotes(notes: WhiteboardNote[]): WhiteboardNote[] {
  return notes.map((note, index) => {
    const fallback = getDefaultNotePosition(note.column, index);
    const position = clampNotePosition(
      Number.isFinite(note.x) ? note.x : fallback.x,
      Number.isFinite(note.y) ? note.y : fallback.y
    );
    return { ...note, x: position.x, y: position.y };
  });
}

function WhiteboardModal({
  sessionId,
  notes,
  manualNote,
  onManualNoteChange,
  onAddManualNote,
  onClear,
  onUpdateNote,
  onMoveNote,
  onDeleteNote,
  onClose,
}: {
  sessionId: string;
  notes: WhiteboardNote[];
  manualNote: string;
  onManualNoteChange: (value: string) => void;
  onAddManualNote: (column: WhiteboardColumn) => void;
  onClear: () => void;
  onUpdateNote: (noteId: string, updates: { text?: string; column?: WhiteboardColumn }) => void;
  onMoveNote: (noteId: string, x: number, y: number) => void;
  onDeleteNote: (noteId: string) => void;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingColumn, setEditingColumn] = useState<WhiteboardColumn>('ideas');
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const connections = useStore((state) => state.whiteboardConnections[sessionId] || []);
  const addWhiteboardConnection = useStore((state) => state.addWhiteboardConnection);
  const deleteWhiteboardConnection = useStore((state) => state.deleteWhiteboardConnection);
  const [dragging, setDragging] = useState<{
    id: string;
    pointerX: number;
    pointerY: number;
    noteX: number;
    noteY: number;
  } | null>(null);
  const notePositionMap = useMemo(() => {
    return new Map(
      notes.map((note) => [
        note.id,
        {
          note,
          position: clampNotePosition(note.x, note.y),
        },
      ])
    );
  }, [notes]);
  const visibleConnections = useMemo(() => {
    return connections
      .map((connection): (WhiteboardConnection & {
        from: { x: number; y: number };
        to: { x: number; y: number };
      }) | null => {
        const from = notePositionMap.get(connection.fromNoteId);
        const to = notePositionMap.get(connection.toNoteId);
        if (!from || !to) return null;
        return {
          ...connection,
          from: {
            x: from.position.x + WHITEBOARD_NOTE_WIDTH / 2,
            y: from.position.y + WHITEBOARD_NOTE_HEIGHT / 2,
          },
          to: {
            x: to.position.x + WHITEBOARD_NOTE_WIDTH / 2,
            y: to.position.y + WHITEBOARD_NOTE_HEIGHT / 2,
          },
        };
      })
      .filter((connection): connection is WhiteboardConnection & {
        from: { x: number; y: number };
        to: { x: number; y: number };
      } => Boolean(connection));
  }, [connections, notePositionMap]);

  useEffect(() => {
    if (!dragging) return;
    const activeDrag = dragging;
    const activeNote = notes.find((note) => note.id === activeDrag.id);
    if (!activeNote) return;
    const activeColumn = activeNote.column;

    function handlePointerMove(event: PointerEvent) {
      const next = clampNotePosition(
        activeColumn,
        activeDrag.noteX + event.clientX - activeDrag.pointerX,
        activeDrag.noteY + event.clientY - activeDrag.pointerY
      );
      onMoveNote(activeDrag.id, next.x, next.y);
    }

    function handlePointerUp() {
      setDragging(null);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging, notes, onMoveNote]);

  const startEdit = (note: WhiteboardNote) => {
    setEditingId(note.id);
    setEditingText(note.text);
    setEditingColumn(note.column);
  };

  const saveEdit = () => {
    if (!editingId) return;
    onUpdateNote(editingId, { text: editingText.trim(), column: editingColumn });
    setEditingId(null);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, note: WhiteboardNote) => {
    if (editingId === note.id) return;
    event.preventDefault();
    const position = clampNotePosition(note.column, note.x, note.y);
    setDragging({
      id: note.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      noteX: position.x,
      noteY: position.y,
    });
  };

  const handleConnectClick = (noteId: string) => {
    if (!connectingFromId) {
      setConnectingFromId(noteId);
      return;
    }

    if (connectingFromId === noteId) {
      setConnectingFromId(null);
      return;
    }

    addWhiteboardConnection({
      id: makeId('connection'),
      sessionId,
      fromNoteId: connectingFromId,
      toNoteId: noteId,
      createdAt: new Date().toISOString(),
    });
    setConnectingFromId(null);
  };

  const handleDeleteNote = (noteId: string) => {
    if (connectingFromId === noteId) {
      setConnectingFromId(null);
    }
    onDeleteNote(noteId);
  };

  return (
    <ModalPortal>
      <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/55 p-0 md:p-4"
      onClick={onClose}
    >
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        className="flex h-full w-full max-w-none flex-col overflow-hidden border-4 border-pixel-black bg-pixel-white md:h-[90vh] md:w-[96vw] md:max-w-[1680px]"
        style={{ boxShadow: '10px 10px 0 #101010' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-pixel-black bg-pixel-yellow px-4 py-3">
          <div>
            <h2 className="font-pixel text-lg text-pixel-black">共同白板</h2>
            <p className="font-pixel text-xs text-pixel-black/60">
              {notes.length} 条便签 · 支持 Markdown、图片、编辑、拖动和删除
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setConnectingFromId(null);
                onClear();
              }}
              disabled={notes.length === 0}
              className="border-2 border-pixel-black bg-pixel-white px-3 py-1 font-pixel text-xs text-pixel-black disabled:opacity-40"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            >
              清空白板
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border-2 border-pixel-black bg-pixel-black px-3 py-1 font-pixel text-xs text-pixel-white"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            >
              关闭
            </button>
          </div>
        </div>

        <div className="border-b-4 border-pixel-black p-3">
          <textarea
            value={manualNote}
            onChange={(event) => onManualNoteChange(event.target.value)}
            rows={2}
            placeholder="给白板加一条便签，支持 Markdown，例如：![图](https://...) 或 **重点**"
            className="w-full resize-none border-2 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-sm text-pixel-black focus:border-pixel-blue focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {BOARD_COLUMNS.map((column) => (
              <button
                key={column.id}
                type="button"
                onClick={() => onAddManualNote(column.id)}
                disabled={!manualNote.trim()}
                className="border-2 border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-xs text-pixel-black disabled:opacity-40"
                style={{ boxShadow: '2px 2px 0 #101010' }}
              >
                加到{column.title}
              </button>
            ))}
          </div>
        </div>

        <div
          className="relative min-h-0 flex-1 overflow-auto bg-[linear-gradient(#10101014_1px,transparent_1px),linear-gradient(90deg,#10101014_1px,transparent_1px)]"
          style={{ backgroundSize: '24px 24px' }}
        >
          <div
            className="relative shrink-0"
            style={{ width: WHITEBOARD_BOARD_WIDTH, height: WHITEBOARD_BOARD_HEIGHT }}
          >
            <div className="pointer-events-none absolute inset-4 grid grid-cols-4 gap-4">
              {BOARD_COLUMNS.map((column) => {
                const count = notes.filter((item) => item.column === column.id).length;
                return (
                  <section
                    key={column.id}
                    className={`min-w-0 border-2 border-pixel-black ${column.tone}`}
                    style={{ boxShadow: '3px 3px 0 #101010' }}
                  >
                    <div className="border-b-2 border-pixel-black bg-pixel-white px-3 py-2">
                      <div className="truncate font-pixel text-xs font-bold text-pixel-black">
                        {column.title}
                      </div>
                      <div className="mt-1 font-pixel text-[10px] text-pixel-black/45">
                        {count > 0 ? `${count} notes` : 'waiting'}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            {notes.length === 0 ? (
              <div className="absolute left-1/2 top-1/2 w-80 -translate-x-1/2 -translate-y-1/2 border-2 border-dashed border-pixel-black/40 bg-pixel-white p-6 text-center">
                <p className="font-pixel text-sm text-pixel-black/45">还没有便签。</p>
              </div>
            ) : null}

            <svg
              className="absolute inset-0 z-10 h-full w-full overflow-visible"
              viewBox={`0 0 ${WHITEBOARD_BOARD_WIDTH} ${WHITEBOARD_BOARD_HEIGHT}`}
              aria-hidden="true"
            >
              {visibleConnections.map((connection) => (
                <g key={connection.id}>
                  <line
                    x1={connection.from.x}
                    y1={connection.from.y}
                    x2={connection.to.x}
                    y2={connection.to.y}
                    stroke="#101010"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="8 7"
                    pointerEvents="none"
                  />
                  <circle cx={connection.from.x} cy={connection.from.y} r="5" fill="#101010" pointerEvents="none" />
                  <circle cx={connection.to.x} cy={connection.to.y} r="5" fill="#101010" pointerEvents="none" />
                  <line
                    x1={connection.from.x}
                    y1={connection.from.y}
                    x2={connection.to.x}
                    y2={connection.to.y}
                    stroke="transparent"
                    strokeWidth="18"
                    strokeLinecap="round"
                    className="cursor-pointer"
                    onClick={() => deleteWhiteboardConnection(sessionId, connection.id)}
                  />
                </g>
              ))}
            </svg>

            {notes.map((note) => {
              const isEditing = editingId === note.id;
              const position = clampNotePosition(note.column, note.x, note.y);
              return (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`absolute z-20 border-2 border-pixel-black ${getColumnTone(note.column)} ${
                    connectingFromId === note.id ? 'ring-4 ring-pixel-blue' : ''
                  }`}
                  style={{
                    left: position.x,
                    top: position.y,
                    width: WHITEBOARD_NOTE_WIDTH,
                    minHeight: WHITEBOARD_NOTE_HEIGHT,
                    boxShadow: '4px 4px 0 #101010',
                  }}
                >
                  <div
                    className="flex cursor-move items-center justify-between border-b-2 border-pixel-black bg-pixel-black px-2 py-1 text-pixel-white"
                    onPointerDown={(event) => beginDrag(event, note)}
                  >
                    <span className="truncate font-pixel text-[10px]">
                      {BOARD_COLUMNS.find((column) => column.id === note.column)?.title}
                    </span>
                    <span className="font-pixel text-[10px]">{note.authorName}</span>
                  </div>

                  <div className="max-h-[106px] overflow-auto p-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingText}
                          onChange={(event) => setEditingText(event.target.value)}
                          rows={7}
                          className="w-full resize-none border-2 border-pixel-black bg-pixel-white px-2 py-2 font-pixel text-xs text-pixel-black focus:border-pixel-blue focus:outline-none"
                        />
                        <select
                          value={editingColumn}
                          onChange={(event) => setEditingColumn(event.target.value as WhiteboardColumn)}
                          className="w-full border-2 border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-xs text-pixel-black"
                        >
                          {BOARD_COLUMNS.map((column) => (
                            <option key={column.id} value={column.id}>
                              {column.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <MessageRenderer content={note.text} className="text-pixel-black" />
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t-2 border-pixel-black bg-pixel-white px-2 py-1">
                    <span className="font-pixel text-[10px] text-pixel-black/45">{formatTime(note.createdAt)}</span>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="border border-pixel-black bg-pixel-green px-2 py-1 font-pixel text-[10px] text-pixel-white"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="border border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-[10px] text-pixel-black"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            className="border border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-[10px] text-pixel-black"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConnectClick(note.id)}
                            className={`border border-pixel-black px-2 py-1 font-pixel text-[10px] ${
                              connectingFromId === note.id
                                ? 'bg-pixel-blue text-pixel-white'
                                : 'bg-pixel-yellow text-pixel-black'
                            }`}
                          >
                            连线
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="border border-pixel-black bg-pixel-red px-2 py-1 font-pixel text-[10px] text-pixel-white"
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.section>
      </motion.div>
    </ModalPortal>
  );
}
function SessionDetail({
  session,
  lobsters,
  messages,
  notes,
  runLogs,
  runningAgents,
  isTopicActive,
  manualNote,
  inputText,
  onRename,
  onInputChange,
  onStopTopic,
  onManualNoteChange,
  onSend,
  onAddManualNote,
  onClearNotes,
  onUpdateNote,
  onMoveNote,
  onDeleteNote,
  onAddMember,
  onRemoveMember,
  onDelete,
  onBackToList,
}: {
  session: Session;
  lobsters: Lobster[];
  messages: SessionMessage[];
  notes: WhiteboardNote[];
  runLogs: RunLog[];
  runningAgents: string[];
  isTopicActive: boolean;
  manualNote: string;
  inputText: string;
  onRename: (name: string) => void;
  onInputChange: (value: string) => void;
  onStopTopic: () => void;
  onManualNoteChange: (value: string) => void;
  onSend: () => void;
  onAddManualNote: (column: WhiteboardColumn) => void;
  onClearNotes: () => void;
  onUpdateNote: (noteId: string, updates: { text?: string; column?: WhiteboardColumn }) => void;
  onMoveNote: (noteId: string, x: number, y: number) => void;
  onDeleteNote: (noteId: string) => void;
  onAddMember: () => void;
  onRemoveMember: (lobsterId: string) => void;
  onDelete: () => void;
  onBackToList: () => void;
}) {
  const { user } = useAuthStore();
  const members = lobsters.filter((lobster) => session.memberIds.includes(lobster.id));
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(session.name);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    if (!editingName) setDraftName(session.name);
  }, [editingName, session.name]);

  const canDiscuss = members.length > 0;
  const mentionMatch = inputText.match(/(^|\s)@([^\s@]*)$/);
  const mentionQuery = mentionMatch?.[2]?.toLowerCase() ?? null;
  const mentionCandidates = mentionQuery === null
    ? []
    : members.filter((member) => member.name.toLowerCase().includes(mentionQuery)).slice(0, 6);

  const insertMention = (name: string) => {
    const nextValue = inputText.replace(/(^|\s)@([^\s@]*)$/, (_match, prefix: string) => `${prefix}@${name} `);
    onInputChange(nextValue);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const saveGroupName = () => {
    const name = draftName.trim();
    if (name && name !== session.name) {
      onRename(name);
    } else {
      setDraftName(session.name);
    }
    setEditingName(false);
  };

  const visibleMessages = messages.filter((message) => message.senderId !== 'system');

  return (
    <div className="h-full min-h-0 md:h-auto">
      <section
        className="flex h-[100dvh] min-h-0 w-full flex-col border-y-4 border-pixel-black bg-pixel-white shadow-none md:h-[720px] md:w-[928px] md:border-4 md:shadow-[5px_5px_0_#101010]"
      >
        <div className="relative flex items-center justify-between gap-2 border-b-4 border-pixel-black bg-pixel-blue px-3 py-2 md:gap-3 md:px-4 md:py-3">
          <button
            type="button"
            onClick={() => goBackOrFallback('/?mobileTab=teams')}
            className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white text-pixel-black md:hidden"
            style={{ boxShadow: '2px 2px 0 #101010' }}
            aria-label="返回上一页"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
          <div className="hidden md:block">
            <GroupAvatar members={members} />
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={saveGroupName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveGroupName();
                  if (event.key === 'Escape') {
                    setDraftName(session.name);
                    setEditingName(false);
                  }
                }}
                className="w-full max-w-sm border-2 border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-base text-pixel-black focus:outline-none"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="block max-w-sm truncate text-left font-pixel text-base font-bold leading-none text-pixel-white md:text-lg"
                title="点击修改群名"
              >
                {session.name}
              </button>
            )}
            <p className="mt-1 hidden font-pixel text-xs text-pixel-white/80 md:block">
              群聊讨论 · 输入 @ 选择参会 Agent
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            {isTopicActive && (
              <button
                type="button"
                onClick={onStopTopic}
                className="border-2 border-pixel-black bg-pixel-red px-3 py-2 font-pixel text-xs font-bold text-pixel-white"
                style={{ boxShadow: '2px 2px 0 #101010' }}
              >
                停止话题
              </button>
            )}
            <button
              type="button"
              onClick={() => setBoardOpen(true)}
              className="border-2 border-pixel-black bg-pixel-yellow px-3 py-2 font-pixel text-xs font-bold text-pixel-black"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            >
              白板 {notes.length}
            </button>
            <button
              type="button"
              onClick={() => setMembersOpen(true)}
              className="border-2 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-xs font-bold text-pixel-black"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            >
              成员 {members.length}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="border-2 border-pixel-black bg-pixel-red px-3 py-2 font-pixel text-xs font-bold text-pixel-white"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            >
              解散
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white font-pixel text-xl leading-none text-pixel-black md:hidden"
            style={{ boxShadow: '2px 2px 0 #101010' }}
            aria-label="更多设置"
          >
            ...
          </button>
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-3 top-[calc(100%+6px)] z-[180] w-64 border-4 border-pixel-black bg-pixel-white p-2 md:hidden"
                style={{ boxShadow: '4px 4px 0 #101010' }}
              >
                <div className="grid gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onBackToList();
                      setMobileMenuOpen(false);
                    }}
                    className="border-2 border-pixel-black bg-pixel-white px-3 py-2 text-left font-pixel text-xs text-pixel-black"
                  >
                    切换茶话会
                  </button>
                  {isTopicActive && (
                    <button
                      type="button"
                      onClick={() => {
                        onStopTopic();
                        setMobileMenuOpen(false);
                      }}
                      className="border-2 border-pixel-black bg-pixel-red px-3 py-2 text-left font-pixel text-xs text-pixel-white"
                    >
                      停止话题
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBoardOpen(true);
                      setMobileMenuOpen(false);
                    }}
                    className="border-2 border-pixel-black bg-pixel-yellow px-3 py-2 text-left font-pixel text-xs text-pixel-black"
                  >
                    白板 {notes.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMembersOpen(true);
                      setMobileMenuOpen(false);
                    }}
                    className="border-2 border-pixel-black bg-pixel-white px-3 py-2 text-left font-pixel text-xs text-pixel-black"
                  >
                    成员 {members.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddMember();
                      setMobileMenuOpen(false);
                    }}
                    className="border-2 border-pixel-black bg-pixel-blue px-3 py-2 text-left font-pixel text-xs text-pixel-white"
                  >
                    邀请 Agent
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      setMobileMenuOpen(false);
                    }}
                    className="border-2 border-pixel-black bg-pixel-red px-3 py-2 text-left font-pixel text-xs text-pixel-white"
                  >
                    解散茶话会
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden md:block">
          <RunLogPanel logs={runLogs} runningAgents={runningAgents} />
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {visibleMessages.length === 0 ? (
            <div className="border-2 border-dashed border-pixel-black/40 p-6 text-center">
              <p className="font-pixel text-sm text-pixel-black/50">
                像群聊一样直接发消息。没有 @ 时会自动挑一个最相关的 Agent 回答。
              </p>
            </div>
          ) : (
            visibleMessages.map((message) => (
              <TeaPartyMessageBubble
                key={message.id}
                message={message}
                members={members}
                currentUserId={user?.id}
              />
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="border-t-4 border-pixel-black p-3">
          <div className="relative">
            {mentionCandidates.length > 0 && (
              <div
                className="absolute bottom-full left-0 z-20 mb-2 w-[calc(100vw-24px)] border-2 border-pixel-black bg-pixel-white md:w-72"
                style={{ boxShadow: '4px 4px 0 #101010' }}
              >
                <div className="border-b-2 border-pixel-black bg-pixel-yellow px-3 py-2 font-pixel text-xs text-pixel-black">
                  选择参会 Agent
                </div>
                {mentionCandidates.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => insertMention(member.name)}
                    className="flex w-full items-center gap-2 border-b border-pixel-black/20 px-3 py-2 text-left hover:bg-pixel-black/5"
                  >
                    <LobsterSprite lobster={member} size="sm" showProviderStatus />
                    <span className="min-w-0 flex-1 truncate font-pixel text-xs text-pixel-black">@{member.name}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (mentionCandidates.length > 0 && event.key === 'Enter') {
                  event.preventDefault();
                  insertMention(mentionCandidates[0].name);
                  return;
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  onSend();
                }
              }}
              rows={3}
              placeholder={canDiscuss ? '输入消息，或用 @ 指定 Agent...' : '先从右上角成员里邀请 Agent'}
              className="w-full resize-none border-2 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-sm text-pixel-black focus:border-pixel-blue focus:outline-none"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="hidden font-pixel text-[11px] text-pixel-black/50 md:block">
              Enter 发送，Shift + Enter 换行
            </p>
            <button
              type="button"
              onClick={onSend}
              disabled={!inputText.trim()}
              className="border-2 border-pixel-black bg-pixel-blue px-4 py-2 font-pixel text-xs font-bold text-pixel-white disabled:opacity-40"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            >
              发送
            </button>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {boardOpen && (
          <WhiteboardModal
            sessionId={session.id}
            notes={notes}
            manualNote={manualNote}
            onManualNoteChange={onManualNoteChange}
            onAddManualNote={onAddManualNote}
            onClear={onClearNotes}
            onUpdateNote={onUpdateNote}
            onMoveNote={onMoveNote}
            onDeleteNote={onDeleteNote}
            onClose={() => setBoardOpen(false)}
          />
        )}
        {membersOpen && (
          <MembersModal
            members={members}
            onAddMember={() => {
              setMembersOpen(false);
              onAddMember();
            }}
            onRemoveMember={onRemoveMember}
            onClose={() => setMembersOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AgentTeaPartyPage() {
  const {
    lobsters,
    sessions,
    sessionMessages,
    whiteboards,
    fetchAgents,
    createSession,
    renameSession,
    deleteSession,
    addMemberToSession,
    removeMemberFromSession,
    addSessionMessage,
    addWhiteboardNote,
    clearWhiteboard,
    updateWhiteboardNote,
    moveWhiteboardNote,
    deleteWhiteboardNote,
  } = useStore();
  const { token, user } = useAuthStore();
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get('sessionId');

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [manualNotes, setManualNotes] = useState<Record<string, string>>({});
  const [runLogs, setRunLogs] = useState<Record<string, RunLog[]>>({});
  const [runningAgents, setRunningAgents] = useState<Record<string, string[]>>({});
  const [activeTopicIds, setActiveTopicIds] = useState<Record<string, boolean>>({});

  const turnsRef = useRef<Record<string, number>>({});
  const topicRuntimeRef = useRef<Record<string, TeaPartyRuntime>>({});

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [selectedSessionId, sessions]
  );
  const sessionIdsKey = useMemo(() => sessions.map((session) => session.id).join('|'), [sessions]);

  const mergeTeaPartySessionState = useCallback(
    (state: TeaPartySessionState) => {
      if (!state?.sessionId) return;
      const sessionId = state.sessionId;
      const backendMessages = Array.isArray(state.messages) ? state.messages : [];
      const backendNotes = Array.isArray(state.whiteboardNotes) ? state.whiteboardNotes : [];
      const backendLogs = Array.isArray(state.runLogs) ? state.runLogs : [];

      setActiveTopicIds((current) => ({ ...current, [sessionId]: Boolean(state.active) }));
      setRunningAgents((current) => ({ ...current, [sessionId]: state.runningAgents || [] }));
      setRunLogs((current) => {
        const merged = new Map((current[sessionId] || []).map((log) => [log.id, log]));
        backendLogs.forEach((log) => merged.set(log.id, log));
        return {
          ...current,
          [sessionId]: Array.from(merged.values())
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .slice(-80),
        };
      });

      const storeState = useStore.getState();
      const existingMessageIds = new Set(
        storeState.sessionMessages
          .filter((message) => message.sessionId === sessionId)
          .map((message) => message.id)
      );
      backendMessages.forEach((message) => {
        if (!existingMessageIds.has(message.id)) {
          existingMessageIds.add(message.id);
          addSessionMessage(message);
        }
      });

      const existingNoteIds = new Set((storeState.whiteboards[sessionId] || []).map((note) => note.id));
      backendNotes.forEach((note) => {
        if (!existingNoteIds.has(note.id)) {
          existingNoteIds.add(note.id);
          addWhiteboardNote(note);
        }
      });
    },
    [addSessionMessage, addWhiteboardNote]
  );

  useEffect(() => {
    if (token) {
      void fetchAgents();
    }
  }, [fetchAgents, token]);

  useEffect(() => {
    if (!token || !sessionIdsKey) return;
    let cancelled = false;

    const syncSessions = async () => {
      const ids = useStore.getState().sessions.map((session) => session.id);
      for (const sessionId of ids) {
        try {
          const state = await fetchTeaPartySession(sessionId);
          if (!cancelled) mergeTeaPartySessionState(state);
        } catch {
          // Keep the chat usable even if the backend is temporarily unavailable.
        }
      }
    };

    void syncSessions();
    const timer = window.setInterval(() => {
      void syncSessions();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mergeTeaPartySessionState, sessionIdsKey, token]);

  useEffect(() => {
    if (!requestedSessionId) return;
    if (sessions.some((session) => session.id === requestedSessionId)) {
      setSelectedSessionId(requestedSessionId);
      setMobileListOpen(false);
    }
  }, [requestedSessionId, sessions]);

  useEffect(() => {
    if (selectedSessionId && !selectedSession) {
      setSelectedSessionId(null);
    }
  }, [selectedSession, selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [selectedSessionId, sessions]);

  const appendSessionMessage = useCallback(
    (sessionId: string, senderId: string, senderName: string, content: string) => {
      addSessionMessage({
        id: makeId('msg'),
        sessionId,
        senderId,
        senderName,
        content,
        timestamp: new Date().toISOString(),
      });
    },
    [addSessionMessage]
  );

  const pushRunLog = useCallback(
    (sessionId: string, agentName: string, status: RunLogStatus, message: string) => {
      setRunLogs((current) => ({
        ...current,
        [sessionId]: [
          ...(current[sessionId] || []),
          {
            id: makeId('run'),
            sessionId,
            agentName,
            status,
            message,
            timestamp: new Date().toISOString(),
          },
        ].slice(-40),
      }));
    },
    []
  );

  const setAgentRunning = useCallback((sessionId: string, agentName: string, running: boolean) => {
    setRunningAgents((current) => {
      const list = current[sessionId] || [];
      const next = running
        ? Array.from(new Set([...list, agentName]))
        : list.filter((name) => name !== agentName);
      return { ...current, [sessionId]: next };
    });
  }, []);

  const callAgentTurn = useCallback(
    async (
      session: Session,
      members: Lobster[],
      agent: Lobster,
      prompt: string,
      options: PendingReplyOptions = {},
      relayDepth = 0
    ): Promise<string | null> => {
      let reply = '';
      setAgentRunning(session.id, agent.name, true);
      pushRunLog(session.id, agent.name, 'running', `${agent.name}正在输入`);

      try {
        const liveMessages = useStore.getState().sessionMessages;
        const result = await executeTeaPartyTurn({
          agentId: agent.id,
          prompt,
          sessionName: session.name,
          topic: '群聊消息',
          members: members.map((member) => ({
            id: member.id,
            name: member.name,
            role: member.role || undefined,
            description: member.description || undefined,
          })),
          messages: liveMessages
            .filter((message) => message.sessionId === session.id && message.senderId !== 'system')
            .slice(-8)
            .map((message) => ({
              senderName: message.senderName,
              content: message.content,
            })),
          whiteboardNotes: (whiteboards[session.id] || []).slice(-10).map((note) => ({
            column: note.column,
            text: note.text,
            authorName: note.authorName,
          })),
        });

        reply = result.content.trim();
        if (options.stopSignal?.()) {
          pushRunLog(session.id, agent.name, 'success', `${agent.name} 已返回，但话题已停止，未展示`);
          return null;
        }
        appendSessionMessage(session.id, agent.id, agent.name, reply || `${agent.name} 没有返回内容。`);
        if (reply) {
          const noteCount = (useStore.getState().whiteboards[session.id] || []).length;
          addWhiteboardNote(buildNoteFromMessage(session.id, reply, agent.name, undefined, noteCount));
        }
        pushRunLog(session.id, agent.name, 'success', `${agent.name} 已回复`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '真实 Agent 调用失败';
        pushRunLog(session.id, agent.name, 'error', `${agent.name} 调用失败：${message}`);
        return null;
      } finally {
        setAgentRunning(session.id, agent.name, false);
      }

      if (!options.allowRelay || relayDepth >= MAX_RELAY_TURNS || options.stopSignal?.()) {
        return reply || null;
      }
      const mentionedAgent = getMentions(reply, members).find((member) => member.id !== agent.id);
      if (!mentionedAgent) return reply || null;
      await callAgentTurn(session, members, mentionedAgent, reply, { allowRelay: false }, relayDepth + 1);
      return reply || null;
    },
    [addWhiteboardNote, appendSessionMessage, pushRunLog, setAgentRunning, whiteboards]
  );

  const stopTeaPartyTopic = useCallback(
    (sessionId: string, appendHiddenMessage = false) => {
      const runtime = topicRuntimeRef.current[sessionId];
      if (runtime) {
        runtime.active = false;
        runtime.stopRequested = true;
        runtime.pendingMentionIds = [];
      }

      setActiveTopicIds((current) => ({ ...current, [sessionId]: false }));
      setRunningAgents((current) => ({ ...current, [sessionId]: [] }));
      pushRunLog(sessionId, '茶话会', 'success', '话题已停止');

      if (appendHiddenMessage) {
        appendSessionMessage(sessionId, 'system', '系统', '话题已停止。');
      }

      void stopTeaPartySession(sessionId)
        .then((state) => mergeTeaPartySessionState(state))
        .catch((error) => {
          const message = error instanceof Error ? error.message : '停止茶话会后台任务失败';
          pushRunLog(sessionId, '茶话会', 'error', message);
        });
    },
    [appendSessionMessage, mergeTeaPartySessionState, pushRunLog]
  );

  const runTeaPartyDiscussionLoop = useCallback(
    async (session: Session, initialMembers: Lobster[], seedContent: string) => {
      const explicitMentionIds = getMentions(seedContent, initialMembers).map((member) => member.id);
      const existingRuntime = topicRuntimeRef.current[session.id];

      if (existingRuntime?.active) {
        existingRuntime.pendingMentionIds = mergeUniqueIds(existingRuntime.pendingMentionIds, explicitMentionIds);
        return;
      }

      const runtime: TeaPartyRuntime = {
        active: true,
        stopRequested: false,
        round: 0,
        lastSpeakerIds: [],
        silenceRounds: Object.fromEntries(initialMembers.map((member) => [member.id, 0])),
        pendingMentionIds: explicitMentionIds,
      };

      topicRuntimeRef.current[session.id] = runtime;
      setActiveTopicIds((current) => ({ ...current, [session.id]: true }));
      pushRunLog(session.id, '茶话会', 'running', '群聊已开始，发送“停止这个话题”可停止');

      try {
        while (runtime.active && !runtime.stopRequested && runtime.round < MAX_AUTO_DISCUSSION_ROUNDS) {
          const freshState = useStore.getState();
          const freshSession = freshState.sessions.find((item) => item.id === session.id);
          if (!freshSession) break;

          const members = freshState.lobsters.filter((lobster) => freshSession.memberIds.includes(lobster.id));
          if (members.length === 0) break;

          const history = freshState.sessionMessages.filter(
            (message) => message.sessionId === session.id && message.senderId !== 'system'
          );
          const latestMessage = history[history.length - 1];
          const selectionContent = latestMessage?.content || seedContent;
          const latestMentionIds = latestMessage ? getMentions(latestMessage.content, members).map((member) => member.id) : [];
          runtime.pendingMentionIds = mergeUniqueIds(runtime.pendingMentionIds, latestMentionIds);

          let speakers = selectTeaPartySpeakers(members, selectionContent, runtime);
          if (members.length > 1 && latestMessage) {
            const filtered = speakers.filter((speaker) => speaker.id !== latestMessage.senderId);
            if (filtered.length > 0) speakers = filtered;
          }
          if (speakers.length === 0) {
            const fallback = members.find((member) => member.id !== latestMessage?.senderId) || members[0];
            speakers = fallback ? [fallback] : [];
          }
          if (speakers.length === 0) break;

          const completedSpeakers: Lobster[] = [];
          for (const speaker of speakers) {
            if (!runtime.active || runtime.stopRequested) break;
            const liveMessages = useStore.getState().sessionMessages.filter(
              (message) => message.sessionId === session.id && message.senderId !== 'system'
            );
            const prompt = liveMessages[liveMessages.length - 1]?.content || selectionContent;
            const reply = await callAgentTurn(freshSession, members, speaker, prompt, {
              stopSignal: () => !runtime.active || runtime.stopRequested,
            });

            if (!reply) continue;
            completedSpeakers.push(speaker);
            const replyMentionIds = getMentions(reply, members)
              .filter((member) => member.id !== speaker.id)
              .map((member) => member.id);
            runtime.pendingMentionIds = mergeUniqueIds(runtime.pendingMentionIds, replyMentionIds);

            if (STOP_TOPIC_PATTERN.test(reply)) {
              runtime.stopRequested = true;
              break;
            }

            if (speakers.length > 1 && !runtime.stopRequested) {
              await wait(randomBetween(BETWEEN_SPEAKER_DELAY_MS));
            }
          }

          if (completedSpeakers.length === 0) {
            runtime.stopRequested = true;
            pushRunLog(session.id, '茶话会', 'error', '本轮没有 Agent 成功回复，已自动暂停');
            break;
          }

          runtime.pendingMentionIds = runtime.pendingMentionIds.filter(
            (id) => !completedSpeakers.some((speaker) => speaker.id === id)
          );
          updateRuntimeAfterSpeakers(runtime, members, completedSpeakers.length > 0 ? completedSpeakers : speakers);
          runtime.round += 1;

          if (!runtime.active || runtime.stopRequested) break;
          await wait(randomBetween(AUTO_ROUND_DELAY_MS));
        }
      } finally {
        const reachedLimit = runtime.round >= MAX_AUTO_DISCUSSION_ROUNDS && !runtime.stopRequested;
        runtime.active = false;
        runtime.pendingMentionIds = [];
        setActiveTopicIds((current) => ({ ...current, [session.id]: false }));
        if (reachedLimit) {
          pushRunLog(session.id, '茶话会', 'success', '本轮持续讨论达到安全上限，已自动暂停');
        }
      }
    },
    [callAgentTurn, pushRunLog]
  );

  const handleCreateSession = () => {
    const name = newSessionName.trim();
    if (!name) return;
    const sessionId = createSession(name, []);
    setSelectedSessionId(sessionId);
    setMobileListOpen(false);
    setNewSessionName('');
    setShowCreate(false);
  };

  const handleSendMessage = (session: Session) => {
    const content = (inputs[session.id] || '').trim();
    const members = lobsters.filter((lobster) => session.memberIds.includes(lobster.id));
    if (!content || !user) return;

    const userMessage: SessionMessage = {
      id: makeId('msg'),
      sessionId: session.id,
      senderId: user.id,
      senderName: user.username,
      content,
      timestamp: new Date().toISOString(),
    };
    addSessionMessage(userMessage);
    setInputs((current) => ({ ...current, [session.id]: '' }));

    if (members.length === 0) {
      appendSessionMessage(session.id, 'system', '系统', '请先从右上角成员里邀请 Agent，然后茶话会就能开始接话。');
      pushRunLog(session.id, '茶话会', 'error', '当前没有参会 Agent，已等待邀请成员');
      return;
    }

    if (STOP_TOPIC_PATTERN.test(content)) {
      stopTeaPartyTopic(session.id, true);
      return;
    }

    if (/[?？]|建议|怎么|如何|是否|能不能/.test(content)) {
      const noteCount = (useStore.getState().whiteboards[session.id] || []).length;
      addWhiteboardNote(buildNoteFromMessage(session.id, content, user.username, undefined, noteCount));
    }

    turnsRef.current = {
      ...turnsRef.current,
      [session.id]: (turnsRef.current[session.id] || 0) + 1,
    };

    setActiveTopicIds((current) => ({ ...current, [session.id]: true }));
    void (async () => {
      try {
        const liveState = useStore.getState();
        const liveMessages = liveState.sessionMessages
          .filter((message) => message.sessionId === session.id)
          .slice(-40);
        const liveNotes = (liveState.whiteboards[session.id] || []).slice(-30);
        const state = await sendTeaPartySessionMessage(session.id, {
          sessionName: session.name,
          userMessage,
          members: members.map((member) => ({
            id: member.id,
            name: member.name,
            role: member.role || undefined,
            description: member.description || undefined,
          })),
          messages: liveMessages,
          whiteboardNotes: liveNotes,
        });
        mergeTeaPartySessionState(state);
      } catch (error) {
        setActiveTopicIds((current) => ({ ...current, [session.id]: false }));
        const message = error instanceof Error ? error.message : '茶话会后台任务启动失败';
        pushRunLog(session.id, '茶话会', 'error', message);
      }
    })();
  };

  const handleAddManualNote = (session: Session, column: WhiteboardColumn) => {
    const text = (manualNotes[session.id] || '').trim();
    if (!text || !user) return;
    const noteCount = (useStore.getState().whiteboards[session.id] || []).length;
    addWhiteboardNote(buildNoteFromMessage(session.id, text, user.username, column, noteCount));
    setManualNotes((current) => ({ ...current, [session.id]: '' }));
  };

  const handleDeleteSession = (sessionId: string) => {
    void stopTeaPartySession(sessionId).catch(() => {});
    deleteSession(sessionId);
    setRunLogs((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    setRunningAgents((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    setActiveTopicIds((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    delete topicRuntimeRef.current[sessionId];
    setSelectedSessionId(null);
    setMobileListOpen(true);
  };

  const selectedMessages = selectedSession
    ? sessionMessages.filter((message) => message.sessionId === selectedSession.id)
    : [];
  const selectedNotes = selectedSession ? normalizeWhiteboardNotes(whiteboards[selectedSession.id] || []) : [];
  const selectedRunLogs = selectedSession ? runLogs[selectedSession.id] || [] : [];
  const selectedRunningAgents = selectedSession ? runningAgents[selectedSession.id] || [] : [];
  const runningSessionCount = Object.values(runningAgents).filter((agents) => agents.length > 0).length;

  return (
    <div className="h-[100dvh] overflow-hidden md:mx-auto md:max-w-7xl md:overflow-visible md:pb-16">
      <div className="hidden md:block">
        <BackButton href="/" />
      </div>

      <motion.header
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="hidden pt-2 md:block"
      >
        <div className="flex flex-col gap-2 border-4 border-pixel-black bg-pixel-white px-3 py-1.5 md:flex-row md:items-center md:justify-between" style={{ boxShadow: '4px 4px 0 #101010' }}>
          <div>
            <h1 className="font-pixel text-lg font-bold leading-none text-pixel-black">Agent 茶话会</h1>
            <p className="hidden">
              像群聊一样直接发消息，后端会按 @ 和上下文调用真实 Agent。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-pixel text-[11px] text-pixel-black/70">
            <span className="border-2 border-pixel-black px-2 py-0.5">
              会话 <strong className="text-pixel-black">{sessions.length}</strong>
            </span>
            <span className="border-2 border-pixel-black px-2 py-0.5">
              Agent <strong className="text-pixel-black">{lobsters.length}</strong>
            </span>
            <span className="border-2 border-pixel-black px-2 py-0.5">
              进行中 <strong className="text-pixel-black">{runningSessionCount}</strong>
            </span>
          </div>
        </div>
      </motion.header>

      {!token ? (
        <section className="mt-6 border-4 border-pixel-black bg-pixel-white p-10 text-center" style={{ boxShadow: '6px 6px 0 #101010' }}>
          <h2 className="font-pixel text-xl text-pixel-black">请先登录</h2>
          <p className="mt-3 font-pixel text-sm text-pixel-black/60">登录后才能读取你的 Agent 并创建茶话会。</p>
          <div className="mt-6">
            <PixelButton variant="primary" onClick={() => { window.location.href = '/auth/login'; }}>
              去登录
            </PixelButton>
          </div>
        </section>
      ) : (
        <div className="h-full min-h-0 md:mt-3 md:grid md:gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className={`${selectedSession && !mobileListOpen ? 'hidden' : 'block'} h-full min-h-0 md:block md:space-y-4`}>
            <section className="flex h-full min-h-0 flex-col border-y-4 border-pixel-black bg-pixel-white p-3 shadow-none md:block md:h-auto md:border-4 md:p-4 md:shadow-[5px_5px_0_#101010]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goBackOrFallback('/?mobileTab=teams')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white text-pixel-black md:hidden"
                    style={{ boxShadow: '2px 2px 0 #101010' }}
                    aria-label="返回上一页"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                  </button>
                  <h2 className="truncate font-pixel text-base font-bold text-pixel-black">茶话会</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="border-2 border-pixel-black bg-pixel-green px-3 py-1 font-pixel text-xs font-bold text-pixel-white"
                  style={{ boxShadow: '2px 2px 0 #101010' }}
                >
                  + 新建
                </button>
              </div>

              {sessions.length === 0 ? (
                <div className="border-2 border-dashed border-pixel-black/40 p-5 text-center">
                  <p className="font-pixel text-sm text-pixel-black/50">还没有茶话会</p>
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="mt-3 border-2 border-pixel-black bg-pixel-blue px-3 py-2 font-pixel text-xs text-pixel-white"
                    style={{ boxShadow: '2px 2px 0 #101010' }}
                  >
                    创建一个
                  </button>
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:overflow-visible">
                  {sessions.map((session) => {
                    const isSelected = session.id === selectedSessionId;
                    const isRunning = (runningAgents[session.id] || []).length > 0;
                    const sessionMembers = lobsters.filter((lobster) => session.memberIds.includes(lobster.id));
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          setSelectedSessionId(session.id);
                          setMobileListOpen(false);
                        }}
                        className={`block w-full border-2 border-pixel-black p-3 text-left ${
                          isSelected ? 'bg-pixel-blue/15' : 'bg-pixel-white hover:bg-pixel-black/5'
                        }`}
                        style={{ boxShadow: '3px 3px 0 #101010' }}
                      >
                        <div className="flex items-center gap-3">
                          <GroupAvatar members={sessionMembers} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-pixel-green' : 'bg-pixel-black/30'}`} />
                              <span className="min-w-0 flex-1 truncate font-pixel text-sm font-bold text-pixel-black">
                                {session.name}
                              </span>
                            </div>
                            <p className="mt-2 font-pixel text-xs text-pixel-black/55">
                              {session.memberIds.length} 位 · {formatTime(session.updatedAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>

          <main className={`${selectedSession && !mobileListOpen ? 'block' : 'hidden'} h-full min-h-0 min-w-0 md:block`}>
            {selectedSession ? (
              <SessionDetail
                session={selectedSession}
                lobsters={lobsters}
                messages={selectedMessages}
                notes={selectedNotes}
                runLogs={selectedRunLogs}
                runningAgents={selectedRunningAgents}
                isTopicActive={Boolean(activeTopicIds[selectedSession.id])}
                manualNote={manualNotes[selectedSession.id] || ''}
                inputText={inputs[selectedSession.id] || ''}
                onRename={(name) => renameSession(selectedSession.id, name)}
                onInputChange={(value) => setInputs((current) => ({ ...current, [selectedSession.id]: value }))}
                onStopTopic={() => stopTeaPartyTopic(selectedSession.id, true)}
                onManualNoteChange={(value) => setManualNotes((current) => ({ ...current, [selectedSession.id]: value }))}
                onSend={() => handleSendMessage(selectedSession)}
                onAddManualNote={(column) => handleAddManualNote(selectedSession, column)}
                onClearNotes={() => clearWhiteboard(selectedSession.id)}
                onUpdateNote={(noteId, updates) => updateWhiteboardNote(selectedSession.id, noteId, updates)}
                onMoveNote={(noteId, x, y) => moveWhiteboardNote(selectedSession.id, noteId, x, y)}
                onDeleteNote={(noteId) => deleteWhiteboardNote(selectedSession.id, noteId)}
                onAddMember={() => setShowAddModal(true)}
                onRemoveMember={(lobsterId) => removeMemberFromSession(selectedSession.id, lobsterId)}
                onDelete={() => handleDeleteSession(selectedSession.id)}
                onBackToList={() => setMobileListOpen(true)}
              />
            ) : (
              <section className="flex min-h-[620px] flex-col items-center justify-center border-4 border-pixel-black bg-pixel-white p-8 text-center" style={{ boxShadow: '5px 5px 0 #101010' }}>
                <h2 className="font-pixel text-2xl text-pixel-black">选择或创建一个茶话会</h2>
                <p className="mt-3 max-w-md font-pixel text-sm leading-relaxed text-pixel-black/55">
                  创建一个群聊，邀请几个 Agent，然后像普通聊天一样发消息。输入 @Agent 名称可以指定谁来接话。
                </p>
                <div className="mt-6">
                  <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
                    创建茶话会
                  </PixelButton>
                </div>
              </section>
            )}
          </main>
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <ModalPortal>
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/50 p-0 md:p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="flex h-full w-full max-w-none flex-col overflow-hidden border-4 border-pixel-black bg-pixel-white md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-md"
              style={{ boxShadow: '8px 8px 0 #101010' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="shrink-0 border-b-4 border-pixel-black bg-pixel-red px-4 py-3">
                <h2 className="font-pixel text-lg text-pixel-white">创建茶话会</h2>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <label className="mb-2 block font-pixel text-sm text-pixel-black">名称</label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(event) => setNewSessionName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleCreateSession();
                  }}
                  placeholder="例如：市场体验评审"
                  className="w-full border-4 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-sm text-pixel-black focus:border-pixel-blue focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex shrink-0 gap-3 border-t-4 border-pixel-black p-4">
                <PixelButton variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>
                  取消
                </PixelButton>
                <PixelButton variant="primary" className="flex-1" onClick={handleCreateSession} disabled={!newSessionName.trim()}>
                  创建
                </PixelButton>
              </div>
            </motion.div>
            </motion.div>
          </ModalPortal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddModal && selectedSession && (
          <AddMemberModal
            session={selectedSession}
            lobsters={lobsters}
            onAdd={(lobsterId) => {
              addMemberToSession(selectedSession.id, lobsterId);
              setShowAddModal(false);
            }}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
