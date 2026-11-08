import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef8f7', 100: '#d5efeb', 200: '#aee0d8', 500: '#21988a', 600: '#147d73', 700: '#12645e', 800: '#14504c', 900: '#123f3c' },
        ink: '#182b35',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { soft: '0 4px 24px -8px rgb(24 43 53 / 0.10)' },
    },
  },
  plugins: [],
} satisfies Config;
