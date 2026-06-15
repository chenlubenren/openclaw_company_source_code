'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useStore } from '@/store/useStore';
import { Lobster, Cave } from '@/types';
import { LobsterCard } from '@/components/lobster/LobsterCard';
import { LobsterSprite } from '@/components/lobster/LobsterSprite';
import { PixelButton } from '@/components/ui/PixelButton';
import { BackButton } from '@/components/ui/BackButton';
import { AgentConfigModal } from '@/components/agent/AgentConfigModal';
import { hasConfiguredProvider } from '@/lib/agentProvider';

const CAVE_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6'];

function AgentProviderAvatar({ lobster }: { lobster: Lobster }) {
  const configured = hasConfiguredProvider(lobster);
  const label = configured ? '已配置供应商' : '未配置供应商';

  return (
    <div className="relative shrink-0" title={label}>
      <LobsterSprite
        lobster={lobster}
        size="sm"
        showProviderStatus
        providerConfigured={configured}
      />
    </div>
  );
}

function CaveSection({
  cave,
  lobsters,
  onDeleteCave,
  onOpenAddLobster,
  onMoveToCave,
  onDeleteLobster,
  onConfigLobster,
  onChanged,
}: {
  cave: Cave;
  lobsters: Lobster[];
  onDeleteCave: (id: string) => void;
  onOpenAddLobster?: (caveId: string) => void;
  onMoveToCave?: (lobsterId: string, caveId: string | null) => void;
  onDeleteLobster?: (lobsterId: string) => void;
  onConfigLobster?: (lobster: Lobster) => void;
  onChanged?: () => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isUnassigned = cave.id === '__unassigned__';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      {/* Cave Header */}
      <div
        className="border-4 border-pixel-black p-4 cursor-pointer flex items-center gap-4"
        style={{ background: cave.color, boxShadow: '5px 5px 0px 0px #101010' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div
          className="w-16 h-16 md:w-12 md:h-12 rounded-full border-4 border-pixel-black flex items-center justify-center font-pixel text-white text-2xl md:text-xl font-bold"
          style={{ background: cave.color, filter: 'brightness(0.8)' }}
        >
          {cave.name?.charAt(0) || '?'}
        </div>
        <div className="flex-1">
          <h2 className="font-pixel text-[1.7rem] md:text-xl leading-tight text-white font-bold">{cave.name}</h2>
          <p className="font-pixel text-white/80 text-[1.1rem] md:text-sm mt-1">{lobsters.length} 只Agent</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {!isUnassigned && onOpenAddLobster && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenAddLobster(cave.id); }}
              className="px-3 py-2 md:py-1 bg-pixel-white text-pixel-black border-2 border-pixel-black font-pixel text-sm md:text-xs font-bold hover:bg-pixel-yellow transition-colors"
              style={{ boxShadow: '2px 2px 0px 0px #101010' }}
            >
              + 添加Agent
            </button>
          )}
          {!isUnassigned && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteCave(cave.id); }}
              className="hidden sm:block px-3 py-2 md:py-1 bg-pixel-red text-pixel-white border-2 border-pixel-black font-pixel text-sm md:text-xs font-bold hover:bg-pixel-orange transition-colors"
              style={{ boxShadow: '2px 2px 0px 0px #101010' }}
            >
              删除窝
            </button>
          )}
          <div className="font-pixel text-white text-3xl md:text-2xl font-bold">
            {expanded ? '▲' : '▼'}
          </div>
        </div>
      </div>

      {/* Cave Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border-4 border-t-0 border-pixel-black p-3 md:p-4 bg-pixel-white/80" style={{ borderColor: '#101010' }}>
              {lobsters.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
                  {lobsters.map((lobster: Lobster, index: number) => (
                    <div key={lobster.id} className="flex flex-col gap-2 h-full min-h-0">
                      <motion.div
                        className="flex-1 min-h-0 flex flex-col"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <LobsterCard lobster={lobster} onDelete={onDeleteLobster} onConfig={onConfigLobster} onChanged={onChanged} />
                      </motion.div>
                      {!isUnassigned && onMoveToCave && (
                        <div className="flex gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onMoveToCave(lobster.id, null)}
                            className="px-3 py-2 md:px-2 md:py-1 border-2 border-pixel-black font-pixel text-sm md:text-xs font-bold bg-pixel-white text-pixel-black hover:bg-pixel-yellow transition-colors"
                            style={{ boxShadow: '2px 2px 0 #101010' }}
                          >
                            移出窝
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="font-pixel text-pixel-black/50 text-[1.2rem] md:text-sm">这个窝里还没有Agent</p>
                  <Link href="/market" className="mt-3 inline-block">
                    <PixelButton variant="primary" size="sm">去领养</PixelButton>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function MyDenPage() {
  const { lobsters, caves, createCaveAPI, deleteCaveAPI, moveAgentToCaveAPI, isInitialized, initialize, deleteAgentAPI } = useStore();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [addTargetCaveId, setAddTargetCaveId] = useState<string | null>(null);
  const [newCaveName, setNewCaveName] = useState('');
  const [newCaveColor, setNewCaveColor] = useState(CAVE_COLORS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [configAgent, setConfigAgent] = useState<Lobster | null>(null);

  // Initialize data from API
  useEffect(() => {
    const init = async () => {
      await initialize();
      setIsLoading(false);
    };
    init();
  }, []);

  const handleConfigLobster = (lobster: Lobster) => {
    setConfigAgent(lobster);
  };

  const handleConfigSave = () => {
    initialize();
  };

  const handleCreateCave = async () => {
    if (!newCaveName.trim()) return;
    try {
      await createCaveAPI(newCaveName.trim(), newCaveColor);
      setNewCaveName('');
      setNewCaveColor(CAVE_COLORS[0]);
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Failed to create cave:', error);
    }
  };

  const handleDeleteCave = async (caveId: string) => {
    try {
      await deleteCaveAPI(caveId);
    } catch (error) {
      console.error('Failed to delete cave:', error);
    }
  };

  const handleMoveToCave = async (lobsterId: string, caveId: string | null) => {
    try {
      await moveAgentToCaveAPI(lobsterId, caveId);
    } catch (error) {
      console.error('Failed to move agent:', error);
    }
  };

  const handleDeleteLobster = async (lobsterId: string) => {
    try {
      await deleteAgentAPI(lobsterId);
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  useEffect(() => {
    if (addTargetCaveId != null && !caves.some((c) => c.id === addTargetCaveId)) {
      setAddTargetCaveId(null);
    }
  }, [addTargetCaveId, caves]);

  if (isLoading || !isInitialized) {
    return (
      <div className="max-w-6xl mx-auto px-4 pb-16">
        <BackButton href="/" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-pixel-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-pixel text-pixel-black/60">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  // Group lobsters by cave
  const lobstersByCave: Record<string, Lobster[]> = {};
  const unassigned: Lobster[] = [];
  for (const l of lobsters) {
    if (l.caveId) {
      if (!lobstersByCave[l.caveId]) lobstersByCave[l.caveId] = [];
      lobstersByCave[l.caveId].push(l);
    } else {
      unassigned.push(l);
    }
  }

  const addTargetCave = addTargetCaveId ? caves.find((c) => c.id === addTargetCaveId) : undefined;
  const addCandidates =
    addTargetCaveId != null
      ? lobsters.filter((l) => l.caveId !== addTargetCaveId)
      : [];
  const addUnassigned = addCandidates.filter((l) => !l.caveId);
  const addFromOtherCaves: { cave: Cave; list: Lobster[] }[] = [];
  if (addTargetCaveId != null) {
    for (const c of caves) {
      if (c.id === addTargetCaveId) continue;
      const list = addCandidates.filter((l) => l.caveId === c.id);
      if (list.length) addFromOtherCaves.push({ cave: c, list });
    }
  }
  const configuredAgentCount = lobsters.filter(hasConfiguredProvider).length;
  const unconfiguredAgentCount = lobsters.length - configuredAgentCount;

  return (
    <div className="max-w-6xl mx-auto px-3 pb-48 md:px-4 md:pb-16">
      <div className="hidden md:block">
        <BackButton href="/" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 border-b-4 border-pixel-black bg-pixel-white pb-4 pt-3 text-left md:mb-8 md:border-b-0 md:bg-transparent md:pb-0 md:pt-6 md:text-center"
      >
        <p className="font-pixel text-[1.25rem] leading-none text-pixel-black/55 md:hidden">MY AGENT DEN</p>
        <h1 className="mt-2 font-pixel text-[3rem] font-bold leading-none text-pixel-black md:chinese-large md:mb-2">
          我的 Agent 窝
        </h1>
        <p className="hidden font-pixel text-xl text-pixel-blue md:block">MY AGENT DEN</p>
        <p className="mt-2 font-pixel text-[1.2rem] leading-snug text-pixel-black/60 md:text-sm">
          {lobsters.length} 只Agent · {caves.length} 个窝
        </p>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-6 grid grid-cols-3 gap-2 md:mb-8 md:flex md:justify-center md:gap-6 md:flex-wrap"
      >
        <div className="bg-pixel-white border-4 border-pixel-black px-3 py-3 text-center md:px-6 md:text-left" style={{ boxShadow: '4px 4px 0px 0px #101010' }}>
          <p className="font-pixel text-base leading-none text-pixel-black/60 md:text-xs">总计</p>
          <p className="mt-1 font-pixel text-[1.8rem] leading-none text-pixel-black md:text-2xl md:leading-normal">{lobsters.length}</p>
        </div>
        <div className="bg-pixel-green border-4 border-pixel-black px-3 py-3 text-center md:px-6 md:text-left" style={{ boxShadow: '4px 4px 0px 0px #101010' }}>
          <p className="font-pixel text-base leading-none text-pixel-white md:text-xs">已配置</p>
          <p className="mt-1 font-pixel text-[1.8rem] leading-none text-pixel-white md:text-2xl md:leading-normal">
            {configuredAgentCount}
          </p>
        </div>
        <div className="bg-pixel-gray border-4 border-pixel-black px-3 py-3 text-center md:px-6 md:text-left" style={{ boxShadow: '4px 4px 0px 0px #101010' }}>
          <p className="font-pixel text-base leading-none text-pixel-white md:text-xs">未配置</p>
          <p className="mt-1 font-pixel text-[1.8rem] leading-none text-pixel-black md:text-2xl md:leading-normal">
            {unconfiguredAgentCount}
          </p>
        </div>
      </motion.div>

      {/* Create Cave Button */}
      <div className="mb-6 flex justify-center">
        <PixelButton variant="primary" onClick={() => setShowCreateDialog(true)} className="min-h-[56px] w-full text-[1.2rem] md:min-h-0 md:w-auto md:text-base">
          + 创建新agent窝
        </PixelButton>
      </div>

      {/* Cave Sections */}
      {caves.length === 0 && lobsters.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="text-6xl mb-4">🦞</div>
          <h2 className="font-pixel text-[2.2rem] font-bold leading-tight text-pixel-black mb-4 md:chinese-large">暂无 Agent 窝</h2>
          <p className="font-pixel text-[1.2rem] text-pixel-black/60 mb-6 md:text-base">先去创建一个agent窝吧！</p>
          <PixelButton variant="primary" onClick={() => setShowCreateDialog(true)} className="min-h-[56px] text-[1.2rem] md:min-h-0 md:text-base">
            创建第一个窝
          </PixelButton>
        </motion.div>
      ) : (
        <div>
          {/* Caves with lobsters */}
          {caves.map((cave) => (
            <CaveSection
              key={cave.id}
              cave={cave}
              lobsters={lobstersByCave[cave.id] ?? []}
              onDeleteCave={handleDeleteCave}
              onOpenAddLobster={(id) => setAddTargetCaveId(id)}
              onMoveToCave={handleMoveToCave}
              onDeleteLobster={handleDeleteLobster}
              onConfigLobster={handleConfigLobster}
              onChanged={initialize}
            />
          ))}

          {/* Unassigned lobsters */}
          {unassigned.length > 0 && (
            <CaveSection
              cave={{ id: '__unassigned__', name: '暂无归属', color: '#6b7280', createdAt: '' }}
              lobsters={unassigned}
              onDeleteCave={() => {}}
              onDeleteLobster={handleDeleteLobster}
              onConfigLobster={handleConfigLobster}
              onChanged={initialize}
            />
          )}
        </div>
      )}

      {/* 向指定窝添加Agent：可选暂无归属或其他窝的Agent */}
      <AnimatePresence>
        {addTargetCaveId != null && addTargetCave && (
          <motion.div
            key={addTargetCaveId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setAddTargetCaveId(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="w-full max-w-lg max-h-[85vh] flex flex-col bg-pixel-white border-4 border-pixel-black overflow-hidden"
              style={{ boxShadow: '8px 8px 0px 0px #101010' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="text-pixel-white font-pixel text-[1.35rem] md:text-lg p-4 border-b-4 border-pixel-black flex justify-between items-center gap-2 shrink-0"
                style={{ background: addTargetCave.color }}
              >
                <span className="leading-tight">
                  向「{addTargetCave.name}」添加Agent
                </span>
                <button
                  type="button"
                  onClick={() => setAddTargetCaveId(null)}
                  className="w-10 h-10 md:w-8 md:h-8 shrink-0 bg-pixel-red text-pixel-white border-2 border-pixel-black flex items-center justify-center hover:bg-pixel-orange font-pixel text-base md:text-sm"
                  style={{ boxShadow: '2px 2px 0px 0px #101010' }}
                >
                  X
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-6">
                {addCandidates.length === 0 ? (
                  <p className="font-pixel text-sm text-pixel-black/60 text-center py-6">
                    没有可移入的Agent：其它窝和暂无归属里都没有Agent，或已全部在本窝。
                  </p>
                ) : (
                  <>
                    {addUnassigned.length > 0 && (
                      <div>
                        <h3 className="font-pixel text-sm text-pixel-black font-bold mb-2 border-b-2 border-pixel-black pb-1">
                          暂无归属
                        </h3>
                        <ul className="space-y-2">
                          {addUnassigned.map((l) => (
                            <li
                              key={l.id}
                              className="flex items-center gap-3 border-2 border-pixel-black p-3 md:p-2 bg-pixel-white"
                              style={{ boxShadow: '3px 3px 0 #101010' }}
                            >
                              <AgentProviderAvatar lobster={l} />
                              <div className="flex-1 min-w-0">
                                <p className="font-pixel text-[1.15rem] md:text-sm text-pixel-black font-bold truncate">{l.name}</p>
                                <p className="font-pixel text-base md:text-xs text-pixel-black/60 truncate">{l.role}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleMoveToCave(l.id, addTargetCave.id)}
                                className="px-3 py-2 md:px-2 md:py-1 shrink-0 bg-pixel-green text-pixel-white border-2 border-pixel-black font-pixel text-sm md:text-xs font-bold hover:brightness-95"
                                style={{ boxShadow: '2px 2px 0 #101010' }}
                              >
                                放入此Agent窝
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {addFromOtherCaves.map(({ cave: srcCave, list }) => (
                      <div key={srcCave.id}>
                        <h3 className="font-pixel text-sm text-pixel-black font-bold mb-2 border-b-2 border-pixel-black pb-1">
                          来自：{srcCave.name}
                        </h3>
                        <ul className="space-y-2">
                          {list.map((l) => (
                            <li
                              key={l.id}
                              className="flex items-center gap-3 border-2 border-pixel-black p-3 md:p-2 bg-pixel-white"
                              style={{ boxShadow: '3px 3px 0 #101010' }}
                            >
                              <AgentProviderAvatar lobster={l} />
                              <div className="flex-1 min-w-0">
                                <p className="font-pixel text-[1.15rem] md:text-sm text-pixel-black font-bold truncate">{l.name}</p>
                                <p className="font-pixel text-base md:text-xs text-pixel-black/60 truncate">{l.role}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleMoveToCave(l.id, addTargetCave.id)}
                                className="px-3 py-2 md:px-2 md:py-1 shrink-0 bg-pixel-green text-pixel-white border-2 border-pixel-black font-pixel text-sm md:text-xs font-bold hover:brightness-95"
                                style={{ boxShadow: '2px 2px 0 #101010' }}
                              >
                                放入此Agent窝
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="p-3 border-t-4 border-pixel-black shrink-0">
                <PixelButton variant="secondary" className="w-full" onClick={() => setAddTargetCaveId(null)}>
                  关闭
                </PixelButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Cave Dialog */}
      <AnimatePresence>
        {showCreateDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40"
            onClick={() => setShowCreateDialog(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="w-[400px] bg-pixel-white border-4 border-pixel-black overflow-hidden"
              style={{ boxShadow: '8px 8px 0px 0px #101010' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-pixel-blue text-pixel-white font-pixel text-xl p-4 border-b-4 border-pixel-black flex justify-between items-center">
                <span>创建agent窝</span>
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="w-8 h-8 bg-pixel-red text-pixel-white border-2 border-pixel-black flex items-center justify-center hover:bg-pixel-orange"
                  style={{ boxShadow: '2px 2px 0px 0px #101010' }}
                >
                  X
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="font-pixel text-sm text-pixel-black block mb-2">窝名称</label>
                  <input
                    type="text"
                    value={newCaveName}
                    onChange={(e) => setNewCaveName(e.target.value)}
                    placeholder="例如：研究小队、写作组..."
                    className="w-full bg-pixel-white border-4 border-pixel-black font-pixel text-pixel-black px-4 py-2 focus:outline-none focus:border-pixel-blue"
                    style={{ boxShadow: '3px 3px 0px 0px #101010' }}
                  />
                </div>

                <div>
                  <label className="font-pixel text-sm text-pixel-black block mb-2">窝颜色</label>
                  <div className="flex gap-2 flex-wrap">
                    {CAVE_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewCaveColor(color)}
                        className={`w-10 h-10 rounded-full border-4 border-pixel-black transition-transform ${newCaveColor === color ? 'scale-110' : ''}`}
                        style={{ background: color, boxShadow: '2px 2px 0px 0px #101010' }}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <div
                    className="border-4 border-pixel-black p-3 font-pixel text-center text-white font-bold"
                    style={{ background: newCaveColor, boxShadow: '3px 3px 0px 0px #101010' }}
                  >
                    {newCaveName || '窝名称预览'}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t-4 border-pixel-black flex gap-3">
                <PixelButton variant="secondary" onClick={() => setShowCreateDialog(false)} className="flex-1">
                  取消
                </PixelButton>
                <PixelButton variant="primary" onClick={handleCreateCave} className="flex-1" disabled={!newCaveName.trim()}>
                  创建
                </PixelButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {configAgent && (
        <AgentConfigModal
          agent={configAgent}
          onClose={() => setConfigAgent(null)}
          onSave={handleConfigSave}
        />
      )}
    </div>
  );
}
