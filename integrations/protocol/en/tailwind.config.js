/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
      extend: {
        animation: {
          'bounce-slow': 'bounce 3s infinite',
          'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        },
        fontFamily: {
          sans: ['var(--font-inter)', 'Segoe UI', 'sans-serif'],
          serif: ['var(--font-serif)', 'Georgia', 'serif'],
        },
        colors: {
        primary: {
          50: '#F5EDDF',
          100: '#E4D8C8',
          200: '#80cbc4',
          300: '#4db6ac',
          400: '#C46A3A',
          500: '#9C4221',  // Основной медицинский бирюзовый
          600: '#7C341A',
          700: '#00796b',
          800: '#00695c',
          900: '#1C1612',  // Тот самый глубокий темный изумрудный из бекенда
        },
        secondary: {
          50: '#f1f8e9',
          100: '#dcedc8',
          200: '#c5e1a5',
          300: '#aed581',
          400: '#9ccc65',
          500: '#8bc34a',
          600: '#7cb342',
          700: '#689f38',
          800: '#558b2f',
          900: '#33691e',
        },
      },
    },
  },
  plugins: [],
}

