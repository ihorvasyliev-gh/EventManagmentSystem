/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        slate: {
          750: '#243144',
          850: '#162032',
        },
        brand: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#d91b1b', // Official Cork City Partnership Red
          700: '#b91c1c',
          800: '#991b1b',
          850: '#7f1d1d',
          900: '#681313',
          950: '#450a0a',
        },
        ccp: {
          red: {
            DEFAULT: '#E10000',
            50: '#fef2f2',
            100: '#fee2e2',
            200: '#fecaca',
            300: '#fca5a5',
            400: '#f87171',
            500: '#ef4444',
            600: '#d91b1b',
            700: '#b91c1c',
            800: '#991b1b',
            900: '#681313',
          },
          green: {
            DEFAULT: '#3EA80B',
            50: '#f0fdf4',
            100: '#dcfce7',
            200: '#bbf7d0',
            300: '#86efac',
            400: '#4ade80',
            500: '#3EA80B',
            600: '#2e963c',
            700: '#247730',
            800: '#1c5e26',
            900: '#14451c',
          },
        },
      },
    },
  },
  plugins: [],
};
