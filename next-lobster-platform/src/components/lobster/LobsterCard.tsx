import { Lobster } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { PixelCard } from '@/components/ui/PixelCard';
import { LobsterSprite } from './LobsterSprite';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

interface LobsterCardProps {
  lobster: Lobster;
  silhouette?: boolean;
  onDelete?: (id: string) => void;
  onConfig?: (lobster: Lobster) => void;
}

export function LobsterCard({ lobster, silhouette = false, onDelete, onConfig }: LobsterCardProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (!silhouette) {
      router.push(`/agent/${lobster.id}`);
    }
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowMenu(!showMenu);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDelete && confirm(`确定要删除 Agent "${lobster.name}" 吗？此操作不可恢复。`)) {
      onDelete(lobster.id);
    }
    setShowMenu(false);
  };

  const handleConfig = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onConfig) {
      onConfig(lobster);
    }
    setShowMenu(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <PixelCard onClick={handleClick} className={`w-full h-full min-h-[300px] flex flex-col ${silhouette ? 'pointer-events-none' : ''}`}>
      {/* Three dots menu button - right side */}
      {!silhouette && (
        <div className="absolute top-2 right-2 z-10" ref={menuRef}>
          <button
            onClick={handleMenuClick}
            className="w-8 h-8 rounded-full bg-pixel-white/80 border-2 border-pixel-black flex items-center justify-center hover:bg-pixel-yellow transition-colors"
            style={{ boxShadow: '2px 2px 0px 0px #101010' }}
          >
            <span className="font-bold text-pixel-black">⋮</span>
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute top-10 right-0 bg-pixel-white border-4 border-pixel-black shadow-lg z-20 w-max"
                style={{ boxShadow: '4px 4px 0px 0px #101010' }}
              >
                {onConfig && (
                  <button
                    onClick={handleConfig}
                    className="w-full px-3 py-2 font-pixel text-sm text-left hover:bg-pixel-blue/20 text-pixel-black flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <span>⚙️</span>
                    <span>配置Agent</span>
                  </button>
                )}
                  <button
                    onClick={handleDelete}
                    className="w-full px-3 py-2 font-pixel text-sm text-left hover:bg-pixel-red/20 text-pixel-black flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <span>🗑️</span>
                    <span>删除此Agent</span>
                  </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      <div className="flex flex-col items-center gap-3 flex-1 justify-between pt-8">
        <LobsterSprite lobster={lobster} size="lg" silhouette={silhouette} />
        <div className="text-center w-full flex flex-col flex-1 justify-end">
          <p className="font-pixel text-base text-pixel-black font-bold mb-1 line-clamp-2 min-h-[2.5rem]">
            {lobster.name}
          </p>
          <p className="font-pixel text-xs text-pixel-black/60 leading-snug min-h-[2.75rem]">
            Function: {lobster.role}
          </p>
          <p className="font-pixel text-xs text-pixel-black/40 mt-1">
            Joined: {new Date(lobster.createdAt).toLocaleDateString('en-US')}
          </p>
        </div>
      </div>
    </PixelCard>
  );
}
