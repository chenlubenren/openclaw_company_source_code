'use client';

import Link from 'next/link';
import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useOpenClawDesktopBridge } from '@/lib/desktop';

const PUBLIC_PATHS = ['/', '/auth/login', '/auth/register'];

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, hasHydrated } = useAuthStore();
  const desktopBridge = useOpenClawDesktopBridge();
  const isDesktop = Boolean(desktopBridge);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith('/auth/')
  );

  useEffect(() => {
    if (isDesktop) return;
    if (!isPublic && hasHydrated && !token) {
      router.replace('/auth/login');
    }
  }, [token, hasHydrated, isPublic, isDesktop, router]);

  useEffect(() => {
    if (isDesktop && pathname.startsWith('/auth/')) {
      router.replace('/');
    }
  }, [isDesktop, pathname, router]);

  if (isDesktop) {
    if (pathname.startsWith('/auth/')) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center text-center">
          <p className="font-pixel text-sm text-pixel-black/50">Opening local desktop mode...</p>
        </div>
      );
    }
    return <>{children}</>;
  }

  if (isPublic) {
    return <>{children}</>;
  }

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-center">
        <p className="font-pixel text-sm text-pixel-black/50">加载登录状态...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="border-4 border-pixel-black bg-pixel-white p-6" style={{ boxShadow: '6px 6px 0 #101010' }}>
          <p className="font-pixel text-xl text-pixel-black">需要登录后继续</p>
          <p className="mt-2 font-pixel text-sm text-pixel-black/60">正在前往登录页，也可以直接点击下方按钮。</p>
          <Link
            href="/auth/login"
            className="mt-4 inline-block border-4 border-pixel-black bg-pixel-blue px-5 py-3 font-pixel text-pixel-white"
            style={{ boxShadow: '4px 4px 0 #101010' }}
          >
            去登录
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
