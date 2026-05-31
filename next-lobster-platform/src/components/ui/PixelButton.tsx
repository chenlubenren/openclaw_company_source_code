'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface PixelButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

export function PixelButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
  title,
}: PixelButtonProps) {
  const variantStyles = {
    primary: 'bg-pixel-red text-pixel-white hover:bg-pixel-orange border-pixel-brown',
    secondary: 'bg-pixel-yellow text-pixel-black hover:bg-pixel-orange border-pixel-brown',
    danger: 'bg-pixel-black text-pixel-white hover:bg-pixel-red border-pixel-red'
  };

  const sizeStyles = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <motion.button
      type={type}
      title={title}
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`
        font-pixel
        border-4
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
        transition-colors duration-100
        relative
        active:top-[2px] active:left-[2px]
      `}
      style={{
        boxShadow: disabled ? '2px 2px 0px 0px #666' : '4px 4px 0px 0px #101010'
      }}
    >
      {children}
    </motion.button>
  );
}
