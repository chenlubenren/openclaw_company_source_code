'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

const PUBLIC_PATHS = ['/', '/auth/login', '/auth/register'];

export function useRouteGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { token, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    const isPublic = PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith('/auth/')
    );

    if (!isPublic && !token) {
      router.push('/auth/login');
    }
  }, [token, isLoading, pathname, router]);
}
