'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

// Network graph background component
function NetworkGraph() {
  const nodes = useMemo(() => {
    return Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      x: 5 + Math.random() * 90,
      y: 5 + Math.random() * 90,
      size: 6 + Math.floor(Math.random() * 10),
      delay: Math.random() * 3,
      duration: 2 + Math.random() * 2,
      color: ['#3A5BA0', '#2D7D46', '#A83232', '#D4A533', '#6B6B6B'][Math.floor(Math.random() * 5)],
    }));
  }, []);

  const edges = useMemo(() => {
    const edgeList = [];
    for (let i = 0; i < nodes.length; i++) {
      const connections = 2 + Math.floor(Math.random() * 4);
      for (let j = 0; j < connections; j++) {
        const target = (i + 1 + Math.floor(Math.random() * (nodes.length - 1))) % nodes.length;
        if (!edgeList.some(e => (e.from === i && e.to === target) || (e.from === target && e.to === i))) {
          edgeList.push({
            from: i,
            to: target,
            delay: Math.random() * 2,
            color: Math.random() > 0.5 ? '#3A5BA0' : '#2D7D46',
          });
        }
      }
    }
    return edgeList;
  }, [nodes]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Dense grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(16,16,16,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16,16,16,0.5) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Animated edges */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.2 }}>
        <defs>
          <linearGradient id="edgeGradientBlue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3A5BA0" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#3A5BA0" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="edgeGradientGreen" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2D7D46" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#2D7D46" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {edges.map((edge, i) => {
          const from = nodes[edge.from];
          const to = nodes[edge.to];
          const gradientId = edge.color === '#3A5BA0' ? 'edgeGradientBlue' : 'edgeGradientGreen';
          return (
            <motion.line
              key={i}
              x1={`${from.x}%`}
              y1={`${from.y}%`}
              x2={`${to.x}%`}
              y2={`${to.y}%`}
              stroke={`url(#${gradientId})`}
              strokeWidth="1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.2, 0.6, 0.2] }}
              transition={{
                duration: 3,
                delay: edge.delay,
                repeat: Infinity,
              }}
            />
          );
        })}
      </svg>

      {/* Animated nodes */}
      {nodes.map((node) => (
        <motion.div
          key={node.id}
          className="absolute rounded-full"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: node.size,
            height: node.size,
            backgroundColor: node.color,
            transform: 'translate(-50%, -50%)',
          }}
          animate={{
            opacity: [0.4, 1, 0.4],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: node.duration,
            delay: node.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* More pulse rings */}
      {nodes.slice(0, 10).map((node, i) => (
        <motion.div
          key={`pulse-${i}`}
          className="absolute rounded-full border"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: 16,
            height: 16,
            borderColor: node.color,
            transform: 'translate(-50%, -50%)',
          }}
          animate={{
            scale: [1, 4],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 2.5,
            delay: i * 0.3,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}

      {/* Floating particles */}
      {Array.from({ length: 40 }).map((_, i) => {
        const colors = ['#3A5BA0', '#2D7D46', '#D4A533', '#A83232'];
        return (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1 h-1 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            }}
            animate={{
              y: [-20, 20],
              x: [-10, 10, -10],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: 4 + Math.random() * 4,
              delay: Math.random() * 5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        );
      })}
    </div>
  );
}

// Floating data packets
function DataPacket({ delay, startX, startY, endX, endY }: { delay: number; startX: number; startY: number; endX: number; endY: number }) {
  return (
    <motion.div
      className="absolute w-2 h-2 bg-pixel-green rounded-sm"
      style={{ opacity: 0.6 }}
      animate={{
        x: [0, (endX - startX) * 5, (startX - endX) * 3, (endX - startX) * 8, 0],
        y: [0, (endY - startY) * 5, (startY - endY) * 3, (endY - startY) * 8, 0],
        opacity: [0, 0.7, 0.5, 0.3, 0],
      }}
      transition={{
        duration: 10,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

interface PixelHeroProps {
  onEnter: () => void;
}

export function PixelHero({ onEnter }: PixelHeroProps) {
  const [mounted, setMounted] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setShowButton(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const dataPackets = useMemo(() => {
    if (!mounted) return [];
    return Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      delay: Math.random() * 4,
      startX: 10 + Math.random() * 80,
      startY: 10 + Math.random() * 80,
      endX: 10 + Math.random() * 80,
      endY: 10 + Math.random() * 80,
    }));
  }, [mounted]);

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-pixel-white flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Network Graph Background */}
      <NetworkGraph />

      {/* Floating Data Packets */}
      {dataPackets.map((packet) => (
        <DataPacket key={packet.id} {...packet} />
      ))}

      {/* Main Content */}
      <motion.div
        className="relative z-10 text-center"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: 'spring',
          stiffness: 100,
          damping: 15,
          delay: 0.15,
        }}
      >
        {/* Logo */}
        <motion.div
          className="relative inline-block"
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src="/claw_profile/03.png"
            alt="Lobster Mascot"
            width={150}
            height={150}
            className="mx-auto pixelated"
            unoptimized
          />
        </motion.div>

        {/* Title - Updated */}
        <motion.h1
          className="chinese-large text-pixel-blue mt-4"
          style={{ textShadow: '1px 1px 0 rgba(58, 91, 160, 0.1)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          欢迎来到虾兵蟹将的世界
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="font-pixel text-pixel-blue/60 text-lg mt-2 tracking-widest"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          WELCOME TO AGENT WORLD
        </motion.p>

        {/* Loading Bar */}
        <motion.div
          className="flex flex-col items-center mt-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="w-44 h-2.5 border-2 border-pixel-blue/25 bg-pixel-white relative overflow-hidden">
            <motion.div
              className="h-full bg-pixel-green"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ delay: 0.9, duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <p className="font-pixel text-pixel-black/30 text-xs mt-2">Loading...</p>
        </motion.div>

        {/* Enter Button */}
        {showButton && (
          <motion.button
            onClick={onEnter}
            className="mt-5 px-5 py-2.5 bg-pixel-blue border-4 border-pixel-black font-pixel text-base text-pixel-white hover:bg-pixel-yellow hover:text-pixel-black transition-all duration-150"
            style={{ boxShadow: '4px 4px 0px rgba(16,16,16,0.12)' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
              ▶ ENTER ▷
            </motion.span>
          </motion.button>
        )}
      </motion.div>

      {/* Version */}
      <motion.p
        className="absolute bottom-5 font-pixel text-pixel-black/15 text-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        OPENCLAW v1.0.0
      </motion.p>
    </motion.div>
  );
}
