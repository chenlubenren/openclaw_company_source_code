'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionA, SectionB, MenuCard } from '@/components/layout/Dashboard';
import { LobsterCard } from '@/components/lobster/LobsterCard';
import { PixelHero } from '@/components/effects/PixelHero';
import { useStore } from '@/store/useStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Lobster, Architecture } from '@/types';

export default function HomePage() {
  const { lobsters, architectures, initialize, deleteAgentAPI } = useStore();
  const { token, user } = useAuthStore();
  const isLoggedIn = !!token;
  const [showHero, setShowHero] = useState(false);
  const [hasSeenHero, setHasSeenHero] = useState(false);

  // Initialize data when logged in
  useEffect(() => {
    if (isLoggedIn && user) {
      initialize();
    }
  }, [isLoggedIn, user]);

  // Check if user has seen the hero animation
  useEffect(() => {
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

  return (
    <>
      {/* Pixel Hero Animation */}
      <AnimatePresence>
        {showHero && <PixelHero onEnter={handleEnter} />}
      </AnimatePresence>

      {/* Main Content */}
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: hasSeenHero ? 0 : 0.3 }}
      >
        {/* Page Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="chinese-large text-pixel-black mb-2">
            欢迎来到Agent世界
          </h1>
          <p className="font-pixel text-xl text-pixel-blue">
            WELCOME TO AGENT WORLD
          </p>
          <p className="font-pixel text-sm text-pixel-black/60 mt-2">
            选择入口开始您的智能体管理之旅
          </p>
        </motion.div>

        {/* Two-Section Dashboard */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Section A: Single Lobster Management */}
          <SectionA>
            <div className="space-y-4">
              <MenuCard
                href="/adopt"
                title="快速领养"
                description="Quick Adopt | 立即获取新伙伴"
                color="bg-pixel-green"
                delay={0.1}
                icon={
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-pixel-green">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                    <ellipse cx="12" cy="12" rx="6" ry="8" fill="none" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                }
              />

              <MenuCard
                href="/upload"
                title="上传Agent"
                description="Upload | 导入训练好的模型"
                color="bg-pixel-blue"
                delay={0.2}
                icon={
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-pixel-blue">
                    <path fill="currentColor" d="M6 2h9l5 5v15H6V2zm8 1v5h5M12 11v6M9 14l3-3 3 3"/>
                  </svg>
                }
              />

              <MenuCard
                href="/market"
                title="Agent世界"
                description="Market | Agent市场与论坛"
                color="bg-pixel-yellow"
                delay={0.3}
                icon={
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-pixel-yellow">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                }
              />

              <MenuCard
                href="/my-den"
                title="我的agent窝"
                description={`My Agents | ${isLoggedIn ? `拥有 ${lobsters.length} 只Agent` : '登录后查看'}`}
                color="bg-pixel-red"
                delay={0.4}
                icon={
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-pixel-red">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                }
              />
            </div>

            {/* Recent Lobsters Preview */}
            <div className="mt-6">
              <h3 className="font-pixel text-base text-pixel-black mb-3">最近Agent</h3>
              {lobsters.length > 0 ? (
                isLoggedIn ? (
                  <div className="grid grid-cols-3 gap-2">
                    {lobsters.slice(0, 3).map((lobster: Lobster) => (
                      <LobsterCard key={lobster.id} lobster={lobster} onDelete={deleteAgentAPI} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {lobsters.slice(0, 3).map((lobster: Lobster) => (
                      <div key={lobster.id} className="relative">
                        <LobsterCard lobster={lobster} silhouette={!isLoggedIn} />
                        <div className="absolute inset-0 bg-pixel-black/85 flex flex-col items-center justify-center z-10">
                          <svg viewBox="0 0 24 24" className="w-6 h-6 text-pixel-yellow mb-1">
                            <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                          </svg>
                          <p className="font-pixel text-pixel-yellow text-xs text-center">登录以解锁</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="border-4 border-pixel-black p-4 text-center bg-pixel-white/50">
                  <p className="font-pixel text-pixel-black/50 text-sm">暂无最近Agent</p>
                </div>
              )}
            </div>
          </SectionA>

          {/* Section B: Architecture Management */}
          <SectionB>
            <div className="space-y-4">
              <MenuCard
                href="/architectures/create"
                title="创建架构"
                description="Create | 设计新的协作架构"
                color="bg-pixel-blue"
                delay={0.1}
                icon={
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-pixel-blue">
                    <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                }
              />

              <MenuCard
                href="/architectures/defaults"
                title="默认架构"
                description="Defaults | 标准模板快速启动"
                color="bg-pixel-gray"
                delay={0.2}
                icon={
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-pixel-gray">
                    <path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                  </svg>
                }
              />

              <MenuCard
                href="/architectures/mine"
                title="我的架构"
                description={`My Architectures | ${isLoggedIn ? '已创建 0 个' : '登录后查看'}`}
                color="bg-pixel-green"
                delay={0.3}
                icon={
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-pixel-green">
                    <path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                }
              />

              <MenuCard
                href="/agent-tea-party"
                title="Agent茶话会"
                description={`Tea Party | ${isLoggedIn ? '与Agent群聊协作' : '登录后使用'}`}
                color="bg-pixel-red"
                delay={0.4}
                icon={
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-pixel-red">
                    <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                    <path fill="currentColor" d="M7 9h10v2H7zm0-3h10v2H7z"/>
                  </svg>
                }
              />
            </div>

            {/* Architecture Preview */}
            <div className="mt-6">
              <h3 className="font-pixel text-base text-pixel-black mb-3">最近架构</h3>
              {(architectures ?? []).length > 0 ? (
                isLoggedIn ? (
                  <div className="space-y-2">
                    {(architectures ?? []).slice(0, 2).map((arch: Architecture) => (
                      <motion.div
                        key={arch.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-pixel-white border-4 border-pixel-black p-3 flex items-center justify-between"
                        style={{ boxShadow: '4px 4px 0px 0px #101010' }}
                      >
                        <div>
                          <h4 className="font-pixel text-pixel-black">{arch.name}</h4>
                          <p className="font-pixel text-xs text-pixel-black/60">
                            {arch.agents.length} members
                          </p>
                        </div>
                        <a
                          href={`/architectures/mine/${arch.id}`}
                          className="px-3 py-1 bg-pixel-blue text-pixel-white border-2 border-pixel-black font-pixel text-xs hover:bg-pixel-gray transition-colors"
                          style={{ boxShadow: '2px 2px 0px 0px #101010' }}
                        >
                          Open
                        </a>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(architectures ?? []).slice(0, 2).map((arch: Architecture) => (
                      <div key={arch.id} className="bg-pixel-white border-4 border-pixel-black p-3 flex items-center justify-between relative" style={{ boxShadow: '4px 4px 0px 0px #101010' }}>
                        <div className="opacity-25 grayscale">
                          <h4 className="font-pixel text-pixel-black">{arch.name}</h4>
                          <p className="font-pixel text-xs text-pixel-black/60">
                            {arch.agents.length} members
                          </p>
                        </div>
                        <div className="absolute inset-0 bg-pixel-black/85 flex flex-col items-center justify-center">
                          <svg viewBox="0 0 24 24" className="w-6 h-6 text-pixel-yellow mb-1">
                            <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                          </svg>
                          <p className="font-pixel text-pixel-yellow text-xs">登录以解锁</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="border-4 border-pixel-black p-4 text-center bg-pixel-white/50">
                  <p className="font-pixel text-pixel-black/50 text-sm">暂无最近架构</p>
                </div>
              )}
            </div>
          </SectionB>
        </div>
      </motion.div>
    </>
  );
}
