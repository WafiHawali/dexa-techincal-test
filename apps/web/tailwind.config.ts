import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef8f7', 100: '#d5efeb', 200: '#aee0d8', 300: '#78c9bd', 500: '#21988a', 600: '#147d73', 700: '#12645e', 800: '#14504c', 900: '#123f3c' },
        ink: '#182b35',
      },
    },
  },
  plugins: [],
} satisfies Config;
