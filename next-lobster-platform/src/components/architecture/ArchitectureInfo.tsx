'use client';

import { motion } from 'framer-motion';
import { Architecture } from '@/types';
import { useStore } from '@/store/useStore';

interface ArchitectureInfoProps {
  architecture: Architecture;
}

export function ArchitectureInfo({ architecture }: ArchitectureInfoProps) {
  const { lobsters } = useStore();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-pixel-white border-4 border-pixel-black p-4 relative"
      style={{ boxShadow: '4px 4px 0px 0px #101010' }}
    >
      <div className="flex items-start gap-4">
        {/* Architecture Icon */}
        <div className="flex-shrink-0">
          <div className="w-16 h-16 bg-pixel-blue border-4 border-pixel-black flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-10 h-10 text-pixel-white">
              <path
                fill="currentColor"
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              />
            </svg>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1">
          <h3 className="font-pixel text-xl text-pixel-black mb-2">
            {architecture.name}
          </h3>
          <p className="font-pixel text-sm text-pixel-black/70 leading-relaxed">
            {architecture.description}
          </p>

          {/* Agent chips: lobster display names; hover shows architecture slot */}
          <div className="mt-3 flex flex-wrap gap-2">
            {architecture.agents.map((agent) => {
              const linked = agent.linkedLobsterId
                ? lobsters.find((l) => l.id === agent.linkedLobsterId)
                : undefined;
              const chipLabel = agent.name || linked?.name || agent.role;
              const titleHint = linked
                ? `${agent.name} · 关联Agent：${linked.name}`
                : agent.role;
              return (
                <span
                  key={agent.id}
                  title={titleHint}
                  className={`
                  px-2 py-1
                  border-2 border-pixel-black
                  font-pixel text-xs
                  ${agent.isManager
                    ? 'bg-pixel-blue text-pixel-white'
                    : 'bg-pixel-green text-pixel-white'}
                `}
                >
                  {chipLabel}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Decorative Corner */}
      <div className="absolute top-0 right-0 w-4 h-4 bg-pixel-black" />
      <div className="absolute bottom-0 left-0 w-4 h-4 bg-pixel-black" />
    </motion.div>
  );
}
