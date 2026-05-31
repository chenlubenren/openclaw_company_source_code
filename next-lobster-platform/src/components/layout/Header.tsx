'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import { UserMenu } from '@/components/user/UserMenu';

export function Header() {
  const { user, token } = useAuthStore();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="bg-pixel-black border-b-4 border-pixel-white px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-4 no-underline">
            <div className="w-12 h-12 bg-pixel-red border-4 border-pixel-white flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-pixel-white">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h1 className="flex items-center gap-3">
              <span className="chinese-large text-pixel-white">虾兵蟹将</span>
              <span className="font-pixel text-xl text-pixel-white/70">AGENT TEAM PLATFORM</span>
            </h1>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {user && token ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-2 py-1 border-2 border-pixel-white hover:border-pixel-yellow transition-colors"
              >
                <div className="w-8 h-8 bg-pixel-green border-2 border-pixel-white flex items-center justify-center">
                  <span className="font-pixel text-pixel-white text-sm">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="font-pixel text-pixel-white text-sm">{user.username}</span>
                <span className="text-pixel-white/50">▾</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 z-50">
                  <UserMenu onClose={() => setShowUserMenu(false)} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth/login"
                className="px-3 py-1 bg-pixel-blue text-pixel-white border-2 border-pixel-white font-pixel text-sm hover:bg-pixel-green hover:text-pixel-black transition-colors no-underline"
                style={{ boxShadow: '2px 2px 0px 0px #101010' }}
              >
                登录
              </Link>
              <Link
                href="/auth/register"
                className="px-3 py-1 bg-pixel-green text-pixel-black border-2 border-pixel-white font-pixel text-sm hover:bg-pixel-yellow transition-colors no-underline"
                style={{ boxShadow: '2px 2px 0px 0px #101010' }}
              >
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
