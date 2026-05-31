'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { useAuthStore } from '@/store/useAuthStore';
import { register } from '@/lib/auth';
import Image from 'next/image';

function Seashell({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 16" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="16" height="12" fill="#D4A533" rx="2"/>
      <rect x="4" y="6" width="12" height="1" fill="#B8860B"/>
      <rect x="4" y="8" width="12" height="1" fill="#B8860B"/>
      <rect x="4" y="10" width="12" height="1" fill="#B8860B"/>
      <rect x="6" y="4" width="1" height="12" fill="#B8860B"/>
      <rect x="10" y="4" width="1" height="12" fill="#B8860B"/>
      <rect x="14" y="4" width="1" height="12" fill="#B8860B"/>
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { token, user, setAuth, isLoading, setLoading, error, setError, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
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
    setValidationError('');

    if (!email.trim() || !username.trim() || !password.trim() || !confirmPassword.trim()) {
      setValidationError('请填写所有字段');
      return;
    }
    if (password !== confirmPassword) {
      setValidationError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setValidationError('密码长度至少 6 个字符');
      return;
    }
    if (username.length < 3) {
      setValidationError('用户名长度至少 3 个字符');
      return;
    }

    setLoading(true);
    try {
      const res = await register({
        email: email.trim(),
        username: username.trim(),
        password,
      });
      setAuth(res.accessToken, res.user);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
    }
  }

  const displayError = validationError || error;

  if (!mounted) return null;

  const bgImages = ['01', '02', '03', '04'];
  const floatingPositions = [
    { top: '5%', left: '10%', img: '01', delay: 0 },
    { top: '8%', right: '12%', img: '02', delay: 1.5 },
    { top: '30%', left: '3%', img: '03', delay: 0.8 },
    { top: '20%', right: '5%', img: '04', delay: 2 },
    { top: '12%', left: '22%', img: '02', delay: 0.3 },
    { top: '45%', left: '5%', img: '01', delay: 1.1 },
    { top: '50%', right: '3%', img: '03', delay: 0.6 },
    { top: '65%', left: '8%', img: '04', delay: 1.8 },
    { top: '70%', right: '10%', img: '01', delay: 2.5 },
    { top: '40%', left: '18%', img: '02', delay: 1.2 },
  ];

  return (
    <div className="relative min-h-[60vh] flex items-center justify-center overflow-hidden py-8">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Seashells */}
        <motion.div className="absolute bottom-[5%] left-[15%]" style={{ opacity: 0.25 }}
          animate={{ rotate: [0, 5, 0, -5, 0] }}
          transition={{ duration: 3, repeat: Infinity }}>
          <Seashell className="w-6 h-5" />
        </motion.div>
        <motion.div className="absolute bottom-[3%] right-[20%]" style={{ opacity: 0.25 }}
          animate={{ rotate: [0, -5, 0, 5, 0] }}
          transition={{ duration: 4, repeat: Infinity }}>
          <Seashell className="w-5 h-4" />
        </motion.div>

        {/* Floating agents */}
        {floatingPositions.map((pos, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{ top: pos.top, left: pos.left, right: pos.right }}
            animate={{ y: [0, -10, 0], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, delay: pos.delay, ease: 'easeInOut' }}
          >
            <Image
              src={`/claw_profile/${pos.img}.png`}
              alt=""
              width={38}
              height={38}
              className="opacity-60"
              unoptimized
            />
          </motion.div>
        ))}

        {/* Big background agent */}
        <motion.div
          className="absolute bottom-[2%] left-[2%] opacity-[0.07] pointer-events-none"
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src="/claw_profile/01.png"
            alt=""
            width={320}
            height={320}
            unoptimized
          />
        </motion.div>
      </div>

      {/* Register form card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-pixel-white border-4 border-pixel-black" style={{ boxShadow: '8px 8px 0px 0px #101010' }}>
          {/* Title bar */}
          <div className="bg-pixel-blue text-pixel-white font-pixel text-xl p-3 text-center border-b-4 border-pixel-black flex items-center justify-center gap-3 -mx-4 -mt-4 mb-2 px-4">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Image src="/claw_profile/03.png" alt="" width={28} height={28} unoptimized />
            </motion.div>
            注 册
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
              animate={{ y: [0, -10, 0], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
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
            加入Agent世界，开启 AI 团队协作之旅
          </p>

          {displayError && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-pixel-red/10 border-4 border-pixel-red p-3 mb-4 mx-4"
            >
              <p className="font-pixel text-pixel-red text-sm">{displayError}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 px-4 pb-4">
            <div>
              <label className="font-pixel text-sm text-pixel-black mb-1 block">邮箱 / EMAIL</label>
              <PixelInput
                value={email}
                onChange={setEmail}
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="font-pixel text-sm text-pixel-black mb-1 block">用户名 / USERNAME</label>
              <PixelInput
                value={username}
                onChange={setUsername}
                placeholder="my_lobster_name"
              />
              <p className="font-pixel text-xs text-pixel-black/50 mt-1">3位以上，字母/数字/下划线</p>
            </div>

            <div>
              <label className="font-pixel text-sm text-pixel-black mb-1 block">密码 / PASSWORD</label>
              <PixelInput
                value={password}
                onChange={setPassword}
                placeholder="********"
              />
            </div>

            <div>
              <label className="font-pixel text-sm text-pixel-black mb-1 block">确认密码 / CONFIRM</label>
              <PixelInput
                value={confirmPassword}
                onChange={setConfirmPassword}
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
                  注册中...
                </span>
              ) : (
                '注 册'
              )}
            </PixelButton>
          </form>

          <div className="mt-2 pb-4 text-center">
            <p className="font-pixel text-sm text-pixel-black/60">
              已有账号？{' '}
              <Link href="/auth/login" className="text-pixel-blue hover:underline">
                立即登录
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
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          NEW PLAYER DETECTED
        </motion.p>
      </motion.div>
    </div>
  );
}
