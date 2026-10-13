import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm neutrals. Overriding `gray` means every existing gray-* class
        // (borders, secondary text, dividers) sits on the ivory background
        // instead of reading cool blue-grey.
        gray: colors.stone,
        ink: '#1A1814',
        paper: '#FAF7F1',
        // Sand: the slightly deeper cream used for the footer and hero panels.
        sand: {
          50: '#F6F1E7',
          100: '#EFE7D8',
          200: '#E4D8C2',
        },
        // Accent — a muted gold. Primary actions, links, focus, and
        // "pending / in progress" states. Name kept for continuity.
        copper: {
          50: '#FBF6EA',
          100: '#F3E7C6',
          200: '#E8D49E',
          300: '#D8BB72',
          400: '#C8A452',
          500: '#B48F3E',
          600: '#957330',
          700: '#7A5D26',
          800: '#5B451C',
        },
        // Verified / success / local content. A muted green that sits with gold.
        chrome: {
          50: '#EEF5F0',
          100: '#D5E8DB',
          300: '#8DBB9C',
          500: '#3F7D58',
          600: '#2F6446',
          700: '#244E37',
          800: '#1B3A29',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26, 24, 20, 0.04), 0 4px 16px -8px rgba(26, 24, 20, 0.10)',
        lift: '0 2px 4px rgba(26, 24, 20, 0.04), 0 18px 36px -14px rgba(26, 24, 20, 0.20)',
        gold: '0 8px 20px -8px rgba(149, 115, 48, 0.55)',
      },
    },
  },
  plugins: [],
};

export default config;
