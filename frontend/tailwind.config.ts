import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1B211F',
        paper: '#F6F5F1',
        copper: {
          50: '#FBF2E8',
          100: '#F2DAB8',
          300: '#E0A855',
          500: '#BD7A2C',
          600: '#96601F',
          800: '#5A3A11',
        },
        chrome: {
          50: '#EAF4F0',
          100: '#C9E6DA',
          300: '#6FBBA0',
          500: '#237A5F',
          600: '#1B5F49',
          800: '#0F3A2C',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
