'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

interface UserMenuProps {
  onClose: () => void;
}

export function UserMenu({ onClose }: UserMenuProps) {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/');
    onClose();
  };

  const handleProviders = () => {
    onClose();
    router.push('/settings/providers');
  };

  return (
    <div
      className="w-72 bg-pixel-white border-4 border-pixel-black"
      style={{ boxShadow: '6px 6px 0px 0px #101010' }}
    >
      {/* User Info */}
      <div className="p-4 border-b-4 border-pixel-black bg-pixel-cream">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-pixel-yellow border-4 border-pixel-black flex items-center justify-center font-pixel text-xl">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <p className="font-pixel text-base font-bold text-pixel-black">{user?.username || 'User'}</p>
            <p className="font-pixel text-xs text-pixel-black/50">{user?.email || ''}</p>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="py-2">
        {/* Provider Config */}
        <button
          onClick={handleProviders}
          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-pixel-yellow/30 transition-colors text-left"
        >
          <span className="text-lg">🔑</span>
          <div>
            <div className="font-pixel text-sm text-pixel-black">供应商配置</div>
            <div className="font-pixel text-xs text-pixel-black/50">管理 API Keys</div>
          </div>
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-pixel-red/20 transition-colors text-left"
        >
          <span className="text-lg">🚪</span>
          <div>
            <div className="font-pixel text-sm text-pixel-red">退出登录</div>
            <div className="font-pixel text-xs text-pixel-black/50">切换账户</div>
          </div>
        </button>
      </div>
    </div>
  );
}
