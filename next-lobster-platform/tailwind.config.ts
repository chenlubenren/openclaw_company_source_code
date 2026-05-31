import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'pixel-black': '#101010',
        'pixel-white': '#F8F8F8',
        'pixel-gray': '#6B6B6B',
        'pixel-red': '#A83232',
        'pixel-green': '#2D7D46',
        'pixel-blue': '#3A5BA0',
        'pixel-yellow': '#D4A533',
      },
      fontFamily: {
        pixel: ['VT323', 'monospace'],
      },
      boxShadow: {
        'pixel': '4px 4px 0px 0px #101010',
        'pixel-inset': 'inset 4px 4px 0px 0px #101010',
        'pixel-sm': '2px 2px 0px 0px #101010',
        'pixel-lg': '6px 6px 0px 0px #101010',
      },
      animation: {
        'shake': 'shake 0.3s ease-in-out infinite',
        'bounce-pixel': 'bounce-pixel 1s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'typewriter': 'typewriter 0.5s steps(1) infinite',
      },
      keyframes: {
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px)' },
          '75%': { transform: 'translateX(2px)' },
        },
        'bounce-pixel': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      imageRendering: {
        'pixelated': 'pixelated',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.pixelated': {
          'image-rendering': 'pixelated',
          'image-rendering': '-moz-crisp-edges',
          'image-rendering': 'crisp-edges',
        },
      });
    },
  ],
}
export default config
