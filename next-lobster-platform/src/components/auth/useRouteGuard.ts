'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useOpenClawDesktopBridge } from '@/lib/desktop';

const PUBLIC_PATHS = ['/', '/auth/login', '/auth/register'];

export function useRouteGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { token, isLoading, hasHydrated } = useAuthStore();
  const desktopBridge = useOpenClawDesktopBridge();
  const isDesktop = Boolean(desktopBridge);

  useEffect(() => {
    if (isDesktop) {
      if (pathname.startsWith('/auth/')) {
        router.push('/');
      }
      return;
    }
    if (isLoading || !hasHydrated) return;

    const isPublic = PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith('/auth/')
    );

    if (!isPublic && !token) {
      router.push('/auth/login');
    }
  }, [token, isLoading, hasHydrated, isDesktop, pathname, router]);
}
