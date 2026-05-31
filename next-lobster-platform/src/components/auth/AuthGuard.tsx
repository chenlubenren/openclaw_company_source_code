'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { motion } from 'framer-motion';

const PUBLIC_PATHS = ['/', '/auth/login', '/auth/register'];

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = useAuthStore();
  const [checked, setChecked] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Wait for zustand persist to rehydrate from localStorage
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const isPublic = PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith('/auth/')
    );

    if (!isPublic && !token) {
      router.replace('/auth/login');
      return;
    }

    setChecked(true);
  }, [token, hydrated, pathname, router]);

  if (!hydrated || !checked) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-[60vh] flex flex-col items-center justify-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-8 border-pixel-black border-t-pixel-red mx-auto mb-4"
          style={{ boxShadow: '4px 4px 0px 0px #101010' }}
        />
        <p className="font-pixel text-pixel-black/60">LOADING...</p>
      </motion.div>
    );
  }

  return <>{children}</>;
}
