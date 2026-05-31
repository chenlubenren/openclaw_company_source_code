'use client';

import { Header } from '@/components/layout/Header';
import { AuthGuard } from '@/components/auth/AuthGuard';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto p-4 bg-pixel-white min-h-[calc(100vh-120px)]">
        <AuthGuard>{children}</AuthGuard>
      </main>
      <footer className="bg-pixel-black border-t-4 border-pixel-red py-4">
        <div className="max-w-7xl mx-auto text-center font-pixel text-pixel-white text-xs">
          <p>虾兵蟹将 - 高效AI团队协作 | Efficient AI Team Collaboration</p>
          <p className="mt-1 text-pixel-red">READY.</p>
        </div>
      </footer>
    </>
  );
}
