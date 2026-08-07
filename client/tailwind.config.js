/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f4f7f5',
          100: '#e6ede8',
          200: '#cdd9d0',
          300: '#a8bdb0',
          400: '#7f9a88',
          500: '#637d6c',
          600: '#506658',
          700: '#425448',
          800: '#38463c',
          900: '#2f3b33',
        },
        accent: {
          50: '#faf8f4',
          100: '#f2ece2',
          200: '#e4d8c6',
          300: '#cfbea3',
          400: '#b8a082',
          500: '#9f8668',
          600: '#856f55',
          700: '#6d5c47',
        },
        surface: '#fcfdfc',
        cream: '#f5f7f6',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 2px 16px rgba(47, 59, 51, 0.05)',
        soft: '0 1px 8px rgba(47, 59, 51, 0.04)',
      },
    },
  },
  plugins: [],
};
