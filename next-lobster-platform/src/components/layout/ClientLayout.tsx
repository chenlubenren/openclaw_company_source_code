'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MobileAppNav } from '@/components/layout/MobileAppNav';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  const isMobileChatRoute = pathname.startsWith('/agent/') || pathname.startsWith('/agent-tea-party');
  const mainClassName = isMobileChatRoute
    ? 'h-[100dvh] min-h-[100dvh] max-w-none overflow-hidden bg-pixel-cream p-0 pb-0 md:mx-auto md:h-auto md:min-h-[calc(100vh-120px)] md:max-w-7xl md:overflow-visible md:bg-pixel-white md:p-4 md:pb-4'
    : 'max-w-7xl mx-auto p-4 pb-0 md:pb-4 bg-pixel-white min-h-screen md:min-h-[calc(100vh-120px)]';

  return (
    <>
      <div className="hidden md:block">
        <Header />
      </div>
      <main data-app-main="true" className={mainClassName}>
        <AuthGuard>{children}</AuthGuard>
      </main>
      <footer className="hidden bg-pixel-black border-t-4 border-pixel-red py-4 md:block">
        <div className="max-w-7xl mx-auto text-center font-pixel text-pixel-white text-xs">
          <p>虾兵蟹将 - 高效AI团队协作 | Efficient AI Team Collaboration</p>
          <p className="mt-1 text-pixel-red">READY.</p>
        </div>
      </footer>
      <Suspense fallback={null}>
        <MobileAppNav />
      </Suspense>
    </>
  );
}
