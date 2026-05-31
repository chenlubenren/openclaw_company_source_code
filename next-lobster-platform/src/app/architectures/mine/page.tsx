'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useStore } from '@/store/useStore';
import { Architecture, ArchitectureAgent, Lobster } from '@/types';
import { PixelCard } from '@/components/ui/PixelCard';
import { PixelButton } from '@/components/ui/PixelButton';
import { BackButton } from '@/components/ui/BackButton';

export default function MyArchitecturesPage() {
  const { architectures, lobsters } = useStore();

  return (
    <div>
      <BackButton href="/" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 mt-6"
      >
        <h1 className="chinese-large text-pixel-black mb-2">
          我的架构
        </h1>
        <p className="font-pixel text-xl text-pixel-blue">
          MY ARCHITECTURES
        </p>
        <p className="font-pixel text-sm text-pixel-black/60 mt-2">
          管理所有已创建的团队架构
        </p>
      </motion.div>

      {/* Architecture Grid */}
      {architectures.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {architectures.map((arch: Architecture, index: number) => (
            <motion.div
              key={arch.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <PixelCard
                title={arch.name}
                className="h-full"
              >
                <p className="font-pixel text-sm text-pixel-black/70 mb-4 line-clamp-2">
                  {arch.description}
                </p>

                {/* Agents Preview */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {arch.agents.slice(0, 4).map((agent: ArchitectureAgent, i: number) => {
                    const linked = agent.linkedLobsterId
                      ? lobsters.find((l: Lobster) => l.id === agent.linkedLobsterId)
                      : undefined;
                    const chip = linked?.name ?? agent.name;
                    return (
                      <span
                        key={i}
                        title={linked ? `Slot: ${agent.name}` : undefined}
                        className={`
                        px-2 py-0.5
                        border-2 border-pixel-black
                        font-pixel text-xs
                        ${agent.isManager ? 'bg-pixel-blue text-pixel-white' : 'bg-pixel-green text-pixel-white'}
                      `}
                      >
                        {chip}
                      </span>
                    );
                  })}
                  {arch.agents.length > 4 && (
                    <span className="px-2 py-0.5 font-pixel text-xs text-pixel-black/50">
                      +{arch.agents.length - 4} more
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex justify-between text-xs font-pixel text-pixel-black/60 mb-4">
                  <span>{arch.agents.length} members</span>
                  <span>{new Date(arch.createdAt).toLocaleDateString('en-US')}</span>
                </div>

                <Link href={`/architectures/mine/${arch.id}`}>
                  <PixelButton variant="primary" className="w-full">
                    打开架构
                  </PixelButton>
                </Link>
              </PixelCard>
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="text-6xl mb-4">BUILDING</div>
          <h2 className="chinese-large text-pixel-black mb-4">
            暂无架构
          </h2>
          <p className="font-pixel text-pixel-black/60 mb-6">
            创建新架构来管理您的Agent团队
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/architectures/create">
              <PixelButton variant="primary" size="lg">
                创建架构
              </PixelButton>
            </Link>
            <Link href="/architectures/defaults">
              <PixelButton variant="secondary" size="lg">
                查看模板
              </PixelButton>
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
