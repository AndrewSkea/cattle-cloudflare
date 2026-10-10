import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          50: '#f1f7f3', 100: '#dcebe1', 200: '#bbd7c5', 300: '#8fbba1', 400: '#5f9a79',
          500: '#3f7d5c', 600: '#2f6449', 700: '#275040', 800: '#213f34', 900: '#1b342c', 950: '#0e1d18',
        },
        wheat: {
          50: '#fbf7ee', 100: '#f5ebd3', 200: '#ebd5a5', 300: '#dfb96f', 400: '#d4a049', 500: '#c8923a',
          600: '#a9722d', 700: '#875627', 800: '#6f4626', 900: '#5d3b23',
        },
        clay: {
          50: '#fcf4f1', 100: '#f8e5de', 200: '#f0c8bb', 300: '#e5a28e', 400: '#d6755b', 500: '#c65a3f',
          600: '#b04532', 700: '#92372b', 800: '#793029', 900: '#652c26',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 3px rgba(28, 25, 23, 0.06)',
        lift: '0 4px 12px rgba(28, 25, 23, 0.08), 0 2px 4px rgba(28, 25, 23, 0.04)',
        pop: '0 20px 40px -12px rgba(28, 25, 23, 0.25)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-up': 'slide-up 200ms ease-out',
        'scale-in': 'scale-in 150ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
