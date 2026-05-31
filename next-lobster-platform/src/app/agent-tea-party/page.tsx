'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Lobster, Session } from '@/types';
import { BackButton } from '@/components/ui/BackButton';
import { PixelButton } from '@/components/ui/PixelButton';
import { LobsterSprite } from '@/components/lobster/LobsterSprite';

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
  const alreadyIn = new Set(session.memberIds);
  const available = lobsters.filter(l => !alreadyIn.has(l.id));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="w-full max-w-lg max-h-[85vh] flex flex-col bg-pixel-white border-4 border-pixel-black overflow-hidden"
        style={{ boxShadow: '8px 8px 0px 0px #101010' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-pixel-blue text-pixel-white font-pixel text-lg p-4 border-b-4 border-pixel-black flex justify-between items-center shrink-0">
          <span>向「{session.name}」添加Agent</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 shrink-0 bg-pixel-red text-pixel-white border-2 border-pixel-black flex items-center justify-center hover:bg-pixel-orange font-pixel text-sm"
            style={{ boxShadow: '2px 2px 0px 0px #101010' }}
          >
            X
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-3">
          {available.length === 0 ? (
            <p className="font-pixel text-sm text-pixel-black/60 text-center py-8">
              所有Agent都已在群聊中，或您还没有任何Agent。
            </p>
          ) : (
            available.map((lobster) => (
              <div
                key={lobster.id}
                className="flex items-center gap-3 border-2 border-pixel-black p-3 bg-pixel-white"
                style={{ boxShadow: '3px 3px 0 #101010' }}
              >
                <LobsterSprite lobster={lobster} size="sm" showStatus={false} />
                <div className="flex-1 min-w-0">
                  <p className="font-pixel text-sm text-pixel-black font-bold truncate">{lobster.name}</p>
                  <p className="font-pixel text-xs text-pixel-black/60 truncate">{lobster.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(lobster.id)}
                  className="px-3 py-1 shrink-0 bg-pixel-green text-pixel-white border-2 border-pixel-black font-pixel text-xs font-bold hover:brightness-95"
                  style={{ boxShadow: '2px 2px 0 #101010' }}
                >
                  邀请入群
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t-4 border-pixel-black shrink-0">
          <PixelButton variant="secondary" className="w-full" onClick={onClose}>
            关闭
          </PixelButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SessionDetail({
  session,
  lobsters,
  onRemove,
  onAddMember,
  onBack,
  onDelete,
}: {
  session: Session;
  lobsters: Lobster[];
  onRemove: (lobsterId: string) => void;
  onAddMember: () => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  const members = lobsters.filter(l => session.memberIds.includes(l.id));
  const [showChat, setShowChat] = useState(false);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { sessionMessages, addSessionMessage } = useStore();
  const { user } = useAuthStore();
  const msgs = sessionMessages.filter(m => m.sessionId === session.id);

  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length, showChat]);

  const handleSend = () => {
    if (!inputText.trim() || !user) return;
    addSessionMessage({
      id: `msg-${Date.now()}`,
      sessionId: session.id,
      senderId: user.id,
      senderName: user.username,
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
    });
    setInputText('');

    setTimeout(() => {
      const replies = [
        '这个问题我来回答！',
        '让我想想...',
        '好的，我来处理这个任务。',
        '收到，我已经理解了你的需求。',
        '这是个好问题，我来详细说明。',
      ];
      const randomMember = members[Math.floor(Math.random() * members.length)];
      if (randomMember) {
        addSessionMessage({
          id: `msg-${Date.now()}-reply`,
          sessionId: session.id,
          senderId: randomMember.id,
          senderName: randomMember.name,
          content: replies[Math.floor(Math.random() * replies.length)],
          timestamp: new Date().toISOString(),
        });
      }
    }, 1200 + Math.random() * 800);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 shrink-0 bg-pixel-white border-2 border-pixel-black flex items-center justify-center font-pixel text-pixel-black hover:bg-pixel-gray transition-colors"
          style={{ boxShadow: '2px 2px 0 #101010' }}
        >
          ←
        </button>
        <div className="flex-1">
          <h2 className="font-pixel text-xl text-pixel-black font-bold">{session.name}</h2>
          <p className="font-pixel text-xs text-pixel-black/60">{members.length} 位Agent · 茶话会</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="px-3 py-1 bg-pixel-red text-pixel-white border-2 border-pixel-black font-pixel text-xs font-bold hover:bg-pixel-orange transition-colors"
          style={{ boxShadow: '2px 2px 0 #101010' }}
        >
          解散茶话会
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={onAddMember}
          className="px-3 py-1 bg-pixel-green text-pixel-white border-2 border-pixel-black font-pixel text-xs font-bold hover:brightness-95 transition-colors"
          style={{ boxShadow: '2px 2px 0 #101010' }}
        >
          + 邀请Agent
        </button>
        <button
          type="button"
          onClick={() => setShowChat(!showChat)}
          className={`px-3 py-1 border-2 border-pixel-black font-pixel text-xs font-bold transition-colors ${
            showChat ? 'bg-pixel-blue text-pixel-white' : 'bg-pixel-white text-pixel-black hover:bg-pixel-gray'
          }`}
          style={{ boxShadow: '2px 2px 0 #101010' }}
        >
          {showChat ? '关闭群聊' : '开启群聊'}
        </button>
      </div>

      {showChat && (
        <div className="flex-1 min-h-0 flex flex-col border-2 border-pixel-black bg-pixel-white/50 mb-4" style={{ boxShadow: '3px 3px 0 #101010' }}>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" style={{ maxHeight: '320px' }}>
            {msgs.length === 0 ? (
              <p className="font-pixel text-sm text-pixel-black/40 text-center py-8">群里还没有消息，发起话题吧！</p>
            ) : (
              msgs.map((msg) => {
                const isSelf = msg.senderId === user?.id;
                const isAgent = session.memberIds.includes(msg.senderId);
                return (
                  <div key={msg.id} className={`flex gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
                    <div className="w-8 h-8 shrink-0 bg-pixel-gray border-2 border-pixel-black flex items-center justify-center font-pixel text-pixel-white text-xs">
                      {msg.senderName.charAt(0).toUpperCase()}
                    </div>
                    <div className={`max-w-[75%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                      <div className="flex items-center gap-2">
                        {!isSelf && <span className="font-pixel text-xs text-pixel-black/60">{msg.senderName}</span>}
                        {isAgent && !isSelf && <span className="font-pixel text-xs bg-pixel-blue text-pixel-white px-1">Agent</span>}
                      </div>
                      <div
                        className={`px-3 py-2 font-pixel text-sm border-2 border-pixel-black ${
                          isSelf ? 'bg-pixel-blue text-pixel-white' : 'bg-pixel-white text-pixel-black'
                        }`}
                        style={{ boxShadow: '2px 2px 0 #101010' }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-2 border-t-2 border-pixel-black flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="发一条消息..."
              className="flex-1 bg-pixel-white border-2 border-pixel-black font-pixel text-sm text-pixel-black px-3 py-1 focus:outline-none focus:border-pixel-blue"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="px-4 py-1 bg-pixel-blue text-pixel-white border-2 border-pixel-black font-pixel text-xs font-bold hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              style={{ boxShadow: '2px 2px 0 #101010' }}
            >
              发送
            </button>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-pixel text-sm text-pixel-black font-bold mb-3 border-b-2 border-pixel-black pb-1">
          群成员 ({members.length})
        </h3>
        <div className="space-y-2">
          {members.length === 0 ? (
            <p className="font-pixel text-sm text-pixel-black/50 text-center py-4">暂无成员，请邀请Agent加入</p>
          ) : (
            members.map((lobster) => (
              <div
                key={lobster.id}
                className="flex items-center gap-3 border-2 border-pixel-black p-3 bg-pixel-white"
                style={{ boxShadow: '3px 3px 0 #101010' }}
              >
                <LobsterSprite lobster={lobster} size="sm" showStatus={true} />
                <div className="flex-1 min-w-0">
                  <p className="font-pixel text-sm text-pixel-black font-bold truncate">{lobster.name}</p>
                  <p className="font-pixel text-xs text-pixel-black/60 truncate">{lobster.role}</p>
                </div>
                <span
                  className={`font-pixel text-xs px-2 py-0.5 border-2 border-pixel-black font-bold ${
                    lobster.status === 'idle' ? 'bg-pixel-green text-pixel-white' :
                    lobster.status === 'working' ? 'bg-pixel-yellow text-pixel-black' :
                    'bg-pixel-red text-pixel-white'
                  }`}
                  style={{ boxShadow: '1px 1px 0 #101010' }}
                >
                  {lobster.status === 'idle' ? '空闲' : lobster.status === 'working' ? '工作中' : '忙碌'}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(lobster.id)}
                  className="px-2 py-1 bg-pixel-white text-pixel-red border-2 border-pixel-black font-pixel text-xs font-bold hover:bg-pixel-red hover:text-pixel-white transition-colors"
                  style={{ boxShadow: '2px 2px 0 #101010' }}
                >
                  移出
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgentTeaPartyPage() {
  const { lobsters, sessions, createSession, deleteSession, addMemberToSession, removeMemberFromSession } = useStore();
  const { token } = useAuthStore();
  const isLoggedIn = !!token;

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const handleCreate = () => {
    if (!newSessionName.trim()) return;
    const id = `session-${Date.now()}`;
    createSession(newSessionName.trim(), []);
    setNewSessionName('');
    setShowCreate(false);
  };

  const handleDelete = (sessionId: string) => {
    deleteSession(sessionId);
    setSelectedSession(null);
  };

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <BackButton href="/" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 pt-6"
      >
        <h1 className="chinese-large text-pixel-black mb-2">Agent茶话会</h1>
        <p className="font-pixel text-xl text-pixel-blue">AGENT TEA PARTY</p>
        <p className="font-pixel text-sm text-pixel-black/60 mt-2">
          {sessions.length} 个茶话会 · 与您的Agent群聊协作
        </p>
      </motion.div>

      {!isLoggedIn ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="text-6xl mb-4">🍵</div>
          <h2 className="chinese-large text-pixel-black mb-4">请先登录</h2>
          <p className="font-pixel text-pixel-black/60 mb-6">登录后才能创建和管理Agent茶话会</p>
          <PixelButton variant="primary" onClick={() => window.location.href = '/auth/login'}>
            去登录
          </PixelButton>
        </motion.div>
      ) : (
        <div className="grid md:grid-cols-[320px_1fr] gap-6">
          {/* Session List Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-pixel-white border-4 border-pixel-black p-4"
            style={{ boxShadow: '6px 6px 0px 0px #101010' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-pixel text-base text-pixel-black font-bold">茶话会列表</h2>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="px-3 py-1 bg-pixel-green text-pixel-white border-2 border-pixel-black font-pixel text-xs font-bold hover:brightness-95 transition-colors"
                style={{ boxShadow: '2px 2px 0 #101010' }}
              >
                + 新建
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3 opacity-40">🍵</div>
                <p className="font-pixel text-sm text-pixel-black/50">还没有茶话会</p>
                <p className="font-pixel text-xs text-pixel-black/30 mt-1">创建一个，开始与Agent群聊</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => {
                  const memberCount = session.memberIds.length;
                  const isSelected = selectedSession?.id === session.id;
                  return (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`border-2 border-pixel-black p-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-pixel-blue/10' : 'bg-pixel-white hover:bg-pixel-gray/10'
                      }`}
                      style={{ boxShadow: '3px 3px 0 #101010' }}
                      onClick={() => setSelectedSession(session)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-pixel-blue' : 'bg-pixel-gray'}`} />
                        <h3 className="font-pixel text-sm text-pixel-black font-bold truncate flex-1">
                          {session.name}
                        </h3>
                      </div>
                      <p className="font-pixel text-xs text-pixel-black/60">
                        {memberCount} 位Agent · {new Date(session.updatedAt).toLocaleDateString('zh-CN')}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Session Detail / Welcome Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-pixel-white border-4 border-pixel-black p-4 min-h-[400px]"
            style={{ boxShadow: '6px 6px 0px 0px #101010' }}
          >
            {selectedSession ? (
              <SessionDetail
                session={selectedSession}
                lobsters={lobsters}
                onRemove={(lobsterId) => {
                  removeMemberFromSession(selectedSession.id, lobsterId);
                  const updated = sessions.find(s => s.id === selectedSession.id);
                  if (updated) setSelectedSession({ ...updated, memberIds: updated.memberIds.filter(id => id !== lobsterId) });
                }}
                onAddMember={() => setShowAddModal(true)}
                onBack={() => setSelectedSession(null)}
                onDelete={() => handleDelete(selectedSession.id)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center">
                <div className="text-6xl mb-4 opacity-30">🍵</div>
                <h2 className="font-pixel text-xl text-pixel-black/40 mb-2">选择一个茶话会</h2>
                <p className="font-pixel text-sm text-pixel-black/30 max-w-xs">
                  从左侧选择一个茶话会，查看群成员、邀请Agent或开始群聊
                </p>
                {sessions.length === 0 && (
                  <div className="mt-6">
                    <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
                      创建第一个茶话会
                    </PixelButton>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Create Session Dialog */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="w-[400px] bg-pixel-white border-4 border-pixel-black overflow-hidden"
              style={{ boxShadow: '8px 8px 0px 0px #101010' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-pixel-red text-pixel-white font-pixel text-xl p-4 border-b-4 border-pixel-black flex justify-between items-center">
                <span>创建茶话会</span>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="w-8 h-8 bg-pixel-black/20 text-pixel-white border-2 border-pixel-white flex items-center justify-center hover:bg-pixel-orange transition-colors"
                >
                  X
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="font-pixel text-sm text-pixel-black block mb-2">茶话会名称</label>
                  <input
                    type="text"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="例如：项目讨论组、周会..."
                    className="w-full bg-pixel-white border-4 border-pixel-black font-pixel text-pixel-black px-4 py-2 focus:outline-none focus:border-pixel-blue"
                    style={{ boxShadow: '3px 3px 0px 0px #101010' }}
                    autoFocus
                  />
                </div>
              </div>

              <div className="p-4 border-t-4 border-pixel-black flex gap-3">
                <PixelButton variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">
                  取消
                </PixelButton>
                <PixelButton variant="primary" onClick={handleCreate} className="flex-1" disabled={!newSessionName.trim()}>
                  创建
                </PixelButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Member Modal */}
      <AnimatePresence>
        {showAddModal && selectedSession && (
          <AddMemberModal
            session={selectedSession}
            lobsters={lobsters}
            onAdd={(lobsterId) => {
              addMemberToSession(selectedSession.id, lobsterId);
              setSelectedSession({
                ...selectedSession,
                memberIds: [...selectedSession.memberIds, lobsterId],
              });
            }}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
