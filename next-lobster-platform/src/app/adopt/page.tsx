'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { BackButton } from '@/components/ui/BackButton';
import { adoptOfficialLobster } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';

const OFFICIAL_LOBSTER_AVATAR = '/claw_profile/03.png';

export default function AdoptPage() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { initialize } = useStore();
  const [name, setName] = useState('');
  const [isHatching, setIsHatching] = useState(false);
  const [hatchProgress, setHatchProgress] = useState(0);
  const [error, setError] = useState('');

  const handleAdopt = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isHatching) return;

    if (!token) {
      setError('请先登录，再领取官方龙虾。');
      return;
    }

    setIsHatching(true);
    setHatchProgress(15);
    setError('');

    let progressTimer: number | undefined;
    try {
      progressTimer = window.setInterval(() => {
        setHatchProgress((current) => Math.min(current + 8, 88));
      }, 120);

      const agent = await adoptOfficialLobster(trimmedName);
      window.clearInterval(progressTimer);
      setHatchProgress(100);
      await initialize();

      window.setTimeout(() => {
        router.push(`/agent/${agent.id}`);
      }, 350);
    } catch (adoptError) {
      if (progressTimer) window.clearInterval(progressTimer);
      setError(adoptError instanceof Error ? adoptError.message : '领取官方龙虾失败。');
      setIsHatching(false);
      setHatchProgress(0);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <BackButton href="/" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 border-4 border-pixel-black bg-white p-6"
        style={{ boxShadow: '8px 8px 0px 0px #101010' }}
      >
        <h1 className="mb-2 text-center font-pixel text-3xl text-pixel-black">
          领取官方龙虾
        </h1>
        <p className="mb-6 text-center font-pixel text-sm text-pixel-black/60">
          给它起一个名字，系统会基于当前官方龙虾模板创建真实后端 Agent。
        </p>

        <div className="mb-8 flex justify-center">
          <motion.div
            animate={
              isHatching
                ? {
                    scale: [1, 1.06, 1],
                    rotate: [0, -4, 4, 0],
                  }
                : {}
            }
            transition={{ duration: 0.55, repeat: isHatching ? Infinity : 0 }}
            className="relative"
          >
            <motion.div
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-36 w-36 items-center justify-center bg-transparent"
            >
              <img
                src={OFFICIAL_LOBSTER_AVATAR}
                alt="官方龙虾"
                className="h-28 w-28 object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </motion.div>

            {isHatching && (
              <div className="mt-4">
                <div className="h-4 w-36 border-2 border-pixel-white bg-pixel-black">
                  <motion.div
                    className="h-full bg-pixel-green"
                    animate={{ width: `${hatchProgress}%` }}
                    transition={{ duration: 0.12 }}
                  />
                </div>
                <p className="mt-1 text-center font-pixel text-sm text-pixel-black">
                  创建中... {hatchProgress}%
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {error && (
          <div className="mb-4 border-4 border-pixel-red bg-pixel-red/10 p-3">
            <p className="font-pixel text-sm text-pixel-red">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-2 block font-pixel text-pixel-black">
              Agent 名字
            </label>
            <PixelInput
              value={name}
              onChange={setName}
              placeholder="给官方龙虾起个名字..."
              className="w-full"
              disabled={isHatching}
            />
          </div>

          <PixelButton
            onClick={handleAdopt}
            disabled={!name.trim() || isHatching}
            variant="primary"
            size="lg"
            className="w-full"
          >
            {isHatching ? '正在创建真实 Agent...' : '领取官方龙虾'}
          </PixelButton>
        </div>
      </motion.div>
    </div>
  );
}
