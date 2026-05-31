'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export function SectionA({ children }: { children?: ReactNode }) {
  return (
    <div className="bg-pixel-white border-4 border-pixel-black p-4" style={{ boxShadow: '6px 6px 0px 0px #101010' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-pixel-red border-4 border-pixel-black flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-pixel-white">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>
        <h2 className="font-pixel text-xl text-pixel-black">Single agent</h2>
      </div>
      {children}
    </div>
  );
}

export function SectionB({ children }: { children?: ReactNode }) {
  return (
    <div className="bg-pixel-white border-4 border-pixel-black p-4" style={{ boxShadow: '6px 6px 0px 0px #101010' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-pixel-blue border-4 border-pixel-black flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-pixel-white">
            <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
        </div>
        <h2 className="font-pixel text-xl text-pixel-black">Agent team</h2>
      </div>
      {children}
    </div>
  );
}

interface MenuCardProps {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  color: string;
  delay?: number;
}

export function MenuCard({ href, icon, title, description, color, delay = 0 }: MenuCardProps) {
  return (
    <Link href={href}>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay }}
        whileHover={{ scale: 1.02, x: 4 }}
        className={`
          ${color}
          border-4 border-pixel-black
          p-4
          cursor-pointer
          flex items-center gap-4
          group
        `}
        style={{ boxShadow: '4px 4px 0px 0px #101010' }}
      >
        <div className="w-12 h-12 bg-pixel-white border-2 border-pixel-black flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="font-pixel text-base text-pixel-white group-hover:text-pixel-yellow transition-colors">
            {title}
          </h3>
          <p className="font-pixel text-xs text-pixel-white/80">
            {description}
          </p>
        </div>
        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-pixel-white">
            <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </div>
      </motion.div>
    </Link>
  );
}
