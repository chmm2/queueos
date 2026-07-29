/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Corporate indigo scale — deep, calm, and consistent across the app.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#4f52e0',
          600: '#4038c7',
          700: '#362fa3',
          800: '#2d2a80',
          900: '#1e1b4f',
        },
        ink: {
          50: '#f8f9fb',
          100: '#f1f3f7',
          200: '#e4e7ee',
          300: '#cdd2dd',
          400: '#9aa1b2',
          500: '#6b7284',
          600: '#4d5364',
          700: '#373c4b',
          800: '#232734',
          900: '#14161f',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,22,31,.04), 0 4px 16px rgba(20,22,31,.05)',
        'card-hover': '0 2px 4px rgba(20,22,31,.06), 0 10px 32px rgba(20,22,31,.09)',
        pop: '0 12px 40px rgba(20,22,31,.16)',
      },
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.45 } },
      },
      animation: {
        rise: 'rise .28s ease-out both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
