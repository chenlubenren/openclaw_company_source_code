'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { useAuthStore } from '@/store/useAuthStore';
import { login } from '@/lib/auth';
import Image from 'next/image';

function PixelStar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 16 16" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="0" width="2" height="16" fill="#D4A533"/>
      <rect x="0" y="7" width="16" height="2" fill="#D4A533"/>
      <rect x="2" y="2" width="2" height="2" fill="#D4A533"/>
      <rect x="12" y="2" width="2" height="2" fill="#D4A533"/>
      <rect x="2" y="12" width="2" height="2" fill="#D4A533"/>
      <rect x="12" y="12" width="2" height="2" fill="#D4A533"/>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { token, user, setAuth, isLoading, setLoading, error, setError, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (token && user) {
      router.push('/');
    }
  }, [token, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();

    if (!email.trim() || !password.trim()) {
      setError('请填写所有字段');
      return;
    }

    setLoading(true);
    try {
      const res = await login({ email: email.trim(), password });
      setAuth(res.accessToken, res.user);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查邮箱和密码');
    }
  }

  if (!mounted) return null;

  return (
    <div className="relative min-h-[60vh] flex items-center justify-center overflow-hidden py-8">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Stars */}
        <PixelStar className="absolute w-4 h-4 top-[10%] left-[8%] animate-pulse" style={{ animationDuration: '2s' }} />
        <PixelStar className="absolute w-3 h-3 top-[15%] right-[12%] animate-pulse" style={{ animationDuration: '3s' }} />
        <PixelStar className="absolute w-5 h-5 bottom-[20%] left-[5%] animate-pulse" style={{ animationDuration: '2.5s' }} />
        <PixelStar className="absolute w-3 h-3 bottom-[30%] right-[8%] animate-pulse" style={{ animationDuration: '1.8s' }} />
        <PixelStar className="absolute w-4 h-4 top-[40%] right-[5%] animate-pulse" style={{ animationDuration: '3.5s' }} />
        <PixelStar className="absolute w-3 h-3 top-[60%] left-[3%] animate-pulse" style={{ animationDuration: '2.2s' }} />
        <PixelStar className="absolute w-3 h-3 bottom-[40%] left-[12%] animate-pulse" style={{ animationDuration: '2.8s' }} />
        <PixelStar className="absolute w-4 h-4 top-[25%] right-[15%] animate-pulse" style={{ animationDuration: '1.5s' }} />

        {/* Floating lobsters */}
        {[0, 1.2, 0.7, 1.8, 2.5, 0.4, 3].map((delay, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              top: [`8%`, `12%`, `15%`, `5%`, `35%`, `50%`, `22%`][i],
              left: [`15%`, `18%`, `8%`, `3%`, `3%`, `3%`, `25%`][i],
              right: i > 1 ? [`18%`, `12%`, `8%`, `5%`, `3%`, `15%`][i - 2] : undefined,
            }}
            animate={{ y: [0, -10, 0], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, delay, ease: 'easeInOut' }}
          >
            <Image
              src="/claw_profile/03.png"
              alt=""
              width={36}
              height={36}
              className="opacity-60"
              unoptimized
            />
          </motion.div>
        ))}

        {/* Big background lobster */}
        <motion.div
          className="absolute bottom-[2%] right-[2%] opacity-[0.06] pointer-events-none"
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src="/claw_profile/03.png"
            alt=""
            width={280}
            height={280}
            unoptimized
          />
        </motion.div>
      </div>

      {/* Login form card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-pixel-white border-4 border-pixel-black" style={{ boxShadow: '8px 8px 0px 0px #101010' }}>
          {/* Title bar */}
          <div className="bg-pixel-red text-pixel-white font-pixel text-xl p-3 text-center border-b-4 border-pixel-black flex items-center justify-center gap-3 -mx-4 -mt-4 mb-2 px-4">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Image src="/claw_profile/03.png" alt="" width={28} height={28} unoptimized />
            </motion.div>
            登 录
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.75 }}
            >
              <Image src="/claw_profile/03.png" alt="" width={28} height={28} unoptimized />
            </motion.div>
          </div>

          {/* Mascot */}
          <div className="flex justify-center mb-2">
            <motion.div
              animate={{ y: [0, -10, 0], rotate: [0, 4, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Image
                src="/claw_profile/03.png"
                alt="Lobster Mascot"
                width={80}
                height={80}
                className="mx-auto"
                style={{ filter: 'drop-shadow(4px 4px 0px #101010)' }}
                unoptimized
              />
            </motion.div>
          </div>

          {/* Tagline */}
          <p className="font-pixel text-xs text-pixel-black/50 text-center mb-4 px-4">
            欢迎回来，Agent船长！
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-pixel-red/10 border-4 border-pixel-red p-3 mb-4 mx-4"
            >
              <p className="font-pixel text-pixel-red text-sm">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
            <div>
              <label className="font-pixel text-sm text-pixel-black mb-1 block">邮箱 / EMAIL</label>
              <PixelInput
                value={email}
                onChange={setEmail}
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="font-pixel text-sm text-pixel-black mb-1 block">密码 / PASSWORD</label>
              <PixelInput
                value={password}
                onChange={setPassword}
                placeholder="********"
              />
            </div>

            <PixelButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={isLoading}
              className="w-full mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    className="inline-block w-4 h-4 border-2 border-pixel-white border-t-transparent rounded-full"
                  />
                  登录中...
                </span>
              ) : (
                '登 录'
              )}
            </PixelButton>
          </form>

          <div className="mt-2 pb-4 text-center">
            <p className="font-pixel text-sm text-pixel-black/60">
              还没有账号？{' '}
              <Link href="/auth/register" className="text-pixel-blue hover:underline">
                立即注册
              </Link>
            </p>
          </div>

          <div className="pb-4 text-center">
            <Link href="/" className="font-pixel text-xs text-pixel-black/40 hover:text-pixel-black/60">
              返回首页
            </Link>
          </div>
        </div>

        {/* Retro tagline */}
        <motion.p
          className="text-center font-pixel text-xs text-pixel-black/40 mt-4"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          INSERT COIN TO PLAY
        </motion.p>
      </motion.div>
    </div>
  );
}
