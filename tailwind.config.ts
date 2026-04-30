import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d0d',
        panel: '#141414',
        border: '#2a2a2a',
        muted: '#666',
      },
    },
  },
  plugins: [],
};

export default config;
