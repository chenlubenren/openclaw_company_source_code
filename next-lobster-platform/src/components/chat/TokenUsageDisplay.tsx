'use client';

import { motion } from 'framer-motion';

interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costEstimate?: string;
}

interface TokenUsageDisplayProps {
  stats: TokenStats;
  compact?: boolean;
}

export function TokenUsageDisplay({ stats, compact = false }: TokenUsageDisplayProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-pixel-black/10 border-2 border-pixel-black font-pixel text-xs">
        <span className="text-pixel-black/60">Token:</span>
        <span className="text-pixel-black font-bold">
          {stats.totalTokens.toLocaleString()}
        </span>
        {stats.costEstimate && (
          <>
            <span className="text-pixel-black/40">|</span>
            <span className="text-pixel-green">${stats.costEstimate}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rpg-dialog p-4 border-4 border-pixel-black">
      <h3 className="font-pixel text-sm mb-3 flex items-center gap-2">
        <span>💰</span> Token 消耗
      </h3>
      
      <div className="space-y-3">
        <div>
          <div className="flex justify-between font-pixel text-xs mb-1">
            <span className="text-pixel-black/60">输入</span>
            <span className="text-pixel-blue">{stats.inputTokens.toLocaleString()}</span>
          </div>
          <div className="h-2 bg-pixel-black/10 border border-pixel-black">
            <div
              className="h-full bg-pixel-blue transition-all"
              style={{ width: `${Math.min((stats.inputTokens / stats.totalTokens) * 100, 100)}%` }}
            />
          </div>
        </div>
        
        <div>
          <div className="flex justify-between font-pixel text-xs mb-1">
            <span className="text-pixel-black/60">输出</span>
            <span className="text-pixel-green">{stats.outputTokens.toLocaleString()}</span>
          </div>
          <div className="h-2 bg-pixel-black/10 border border-pixel-black">
            <div
              className="h-full bg-pixel-green transition-all"
              style={{ width: `${Math.min((stats.outputTokens / stats.totalTokens) * 100, 100)}%` }}
            />
          </div>
        </div>
        
        <div className="pt-2 border-t-2 border-pixel-black/20">
          <div className="flex justify-between font-pixel text-sm">
            <span className="text-pixel-black">总计</span>
            <span className="text-pixel-black font-bold">{stats.totalTokens.toLocaleString()}</span>
          </div>
          {stats.costEstimate && (
            <div className="text-right font-pixel text-xs text-pixel-green mt-1">
              ≈ ${stats.costEstimate}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveTokenCounter({ tokensPerSecond = 0 }: { tokensPerSecond?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-3 py-1 bg-pixel-green/20 border-2 border-pixel-green font-pixel text-xs"
    >
      <motion.span
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ repeat: Infinity, duration: 1 }}
        className="w-2 h-2 bg-pixel-green rounded-full"
      />
      <span className="text-pixel-green">
        +{tokensPerSecond}/s
      </span>
    </motion.div>
  );
}
