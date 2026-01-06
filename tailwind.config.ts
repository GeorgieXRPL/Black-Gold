/**
 * @fileoverview Tailwind CSS configuration for Black Gold mining platform
 * Theme: Coal/Industrial aesthetic with ember and gold accents
 */

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core coal blacks
        coal: {
          950: '#0a0a0a',
          900: '#121212',
          800: '#1a1a1a',
          700: '#2a2a2a',
          600: '#3a3a3a',
          500: '#4a4a4a',
        },
        // Ember orange accent
        ember: {
          DEFAULT: '#f97316',
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // Gold accent
        gold: {
          DEFAULT: '#fbbf24',
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
      },
      fontFamily: {
        display: ['var(--font-bebas)', 'Bebas Neue', 'Impact', 'sans-serif'],
        heading: ['var(--font-oswald)', 'Oswald', 'Impact', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'Consolas', 'monospace'],
      },
      animation: {
        'ember-float': 'emberFloat 3s ease-in-out infinite',
        'ember-glow': 'emberGlow 2s ease-in-out infinite',
        'pulse-ember': 'pulseEmber 2s ease-in-out infinite',
        'mine-pulse': 'minePulse 1s ease-in-out infinite',
        'barrel-fill': 'barrelFill 0.5s ease-out forwards',
        'stat-update': 'statUpdate 0.3s ease-out',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'coal-shimmer': 'coalShimmer 3s linear infinite',
      },
      keyframes: {
        emberFloat: {
          '0%, 100%': { transform: 'translateY(0) scale(1)', opacity: '0.8' },
          '50%': { transform: 'translateY(-20px) scale(1.1)', opacity: '1' },
        },
        emberGlow: {
          '0%, 100%': { boxShadow: '0 0 5px #f97316, 0 0 10px #f9731640' },
          '50%': { boxShadow: '0 0 20px #f97316, 0 0 40px #f9731680' },
        },
        pulseEmber: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        minePulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
        barrelFill: {
          '0%': { width: '0%' },
          '100%': { width: 'var(--fill-percent)' },
        },
        statUpdate: {
          '0%': { transform: 'scale(1.1)', color: '#fbbf24' },
          '100%': { transform: 'scale(1)', color: 'inherit' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        coalShimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'coal-gradient': 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
        'ember-gradient': 'linear-gradient(135deg, #f97316 0%, #fbbf24 100%)',
        'industrial-pattern': `repeating-linear-gradient(
          45deg,
          transparent,
          transparent 10px,
          rgba(255,255,255,0.02) 10px,
          rgba(255,255,255,0.02) 20px
        )`,
      },
      boxShadow: {
        'ember': '0 0 20px rgba(249, 115, 22, 0.4)',
        'gold': '0 0 20px rgba(251, 191, 36, 0.4)',
        'coal': 'inset 0 2px 10px rgba(0, 0, 0, 0.8)',
        'inner-ember': 'inset 0 0 20px rgba(249, 115, 22, 0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
