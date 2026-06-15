'use client';

import { motion } from 'framer-motion';
import { Architecture } from '@/types';
import { useStore } from '@/store/useStore';
import { AgentNodeAvatar } from '@/components/architecture/AgentNodeAvatar';

interface ArchitectureInfoProps {
  architecture: Architecture;
}

export function ArchitectureInfo({ architecture }: ArchitectureInfoProps) {
  const { lobsters } = useStore();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative border-4 border-pixel-black bg-pixel-white p-4"
      style={{ boxShadow: '4px 4px 0px 0px #101010' }}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="flex h-16 w-16 items-center justify-center border-4 border-pixel-black bg-pixel-blue">
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-pixel-white">
              <path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="mb-2 font-pixel text-xl text-pixel-black">{architecture.name}</h3>
          <p className="font-pixel text-sm leading-relaxed text-pixel-black/70">{architecture.description}</p>

          <div className="mt-3 grid gap-2">
            {architecture.agents.map((agent) => {
              const linked = agent.linkedLobsterId
                ? lobsters.find((item) => item.id === agent.linkedLobsterId)
                : undefined;
              const label = linked?.name || agent.name || agent.role;
              return (
                <div
                  key={agent.id}
                  title={linked ? `${agent.name} / ${linked.name}` : agent.role}
                  className={`flex h-12 items-center gap-2 border-2 border-pixel-black px-2 ${
                    agent.isManager ? 'bg-pixel-blue' : 'bg-pixel-green'
                  }`}
                >
                  <AgentNodeAvatar lobster={linked || null} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-pixel text-sm font-bold text-pixel-white">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="absolute right-0 top-0 h-4 w-4 bg-pixel-black" />
      <div className="absolute bottom-0 left-0 h-4 w-4 bg-pixel-black" />
    </motion.div>
  );
}
