'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

interface LobsterMascotProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

export function LobsterMascot({ size = 96, animate = true, className }: LobsterMascotProps) {
  const mascot = (
    <Image
      src="/claw_profile/03.png"
      alt="Lobster Mascot"
      width={size}
      height={size}
      className={className}
      priority
      unoptimized
    />
  );

  if (!animate) return mascot;

  return (
    <motion.div
      animate={{ y: [0, -8, 0], rotate: [0, 3, -3, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {mascot}
    </motion.div>
  );
}

interface SmallLobsterProps {
  className?: string;
  delay?: number;
}

export function SmallLobster({ className, delay = 0 }: SmallLobsterProps) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -8, 0], opacity: [0.5, 0.8, 0.5] }}
      transition={{ duration: 3, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
      <Image
        src="/claw_profile/03.png"
        alt=""
        width={40}
        height={40}
        className="opacity-70"
        unoptimized
      />
    </motion.div>
  );
}
