/** @type {import('tailwindcss').Config} */

// Colours, type and corners follow corkcitypartnership.ie: raspberry #B90B4F, green #609C5C,
// neutral greys with #222 text, Lato, buttons with 3px corners and "leaf" boxes rounded on two
// opposite corners. The category colours are mirrored for the PDF in constants/categoryColors.ts.

// The site's neutral greys. They replace Tailwind's blue-tinted slate, so the slate-* classes
// used across the app keep working; 900 is the site's text colour and the dark-mode page.
const neutral = {
  50: '#FAFAFA',
  100: '#F3F3F3',
  200: '#E6E6E6',
  300: '#D1D1D1',
  400: '#A3A3A3',
  500: '#737373',
  600: '#575757',
  700: '#424242',
  750: '#383838',
  800: '#2E2E2E',
  850: '#272727',
  900: '#222222',
  950: '#171717',
};

const green = {
  50: '#F4F8F4',
  100: '#E4ECE4',
  200: '#CADAC8',
  300: '#AAC3A8',
  400: '#86AA83',
  500: '#609C5C', // corkcitypartnership.ie green
  600: '#4D8249', // the same green dark enough for white text and small type
  700: '#436F40',
  800: '#395D36',
  900: '#2E482C',
  950: '#233522',
};

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
  // hover: styles only for a mouse: on phones and tablets a tapped card or button kept its hover
  // colour until something else was tapped
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      // Tailwind v4 names used across components (not built into v3)
      boxShadow: {
        '2xs': '0 1px rgb(0 0 0 / 0.05)',
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        sans: ['Lato', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      // Square corners like the site's buttons and fields; panels use the "leaf" shape instead
      borderRadius: {
        sm: '2px',
        DEFAULT: '3px',
        md: '3px',
        lg: '3px',
        xl: '3px',
        '2xl': '4px',
        '3xl': '6px',
        leaf: '28px 0 28px 0',
        'leaf-sm': '16px 0 16px 0',
        'leaf-xs': '10px 0 10px 0',
      },
      // Muted text (text-slate-400): #A3A3A3 is too faint to read on white (2.5:1), so in light
      // mode it is #737373 (4.7:1); dark mode keeps #A3A3A3, which reads well on #222.
      // Only text changes: borders and backgrounds keep the site's greys.
      textColor: {
        slate: { ...neutral, 400: 'rgb(var(--text-muted) / <alpha-value>)' },
      },
      colors: {
        slate: neutral,
        brand: {
          50: '#FBF0F4',
          100: '#F4DAE5',
          200: '#EAB6CA',
          300: '#E8A9C2',
          400: '#DD7AA3',
          500: '#C32D68',
          600: '#B90B4F', // corkcitypartnership.ie raspberry
          700: '#9E0B45',
          800: '#820C3A',
          850: '#730C34',
          900: '#640C2E',
          950: '#480D24',
        },
        'ccp-green': green,
        // Event categories: the same hues as before, toned down to sit with raspberry and green
        cat: {
          enterprise: {
            50: '#F3F6F9', 100: '#E2E9F0', 200: '#C5D3E0', 300: '#A2B8CE', 400: '#7B9ABA',
            500: '#5880A7', 600: '#3D6B99', 700: '#355C83', 800: '#2E4D6D', 900: '#263C54', 950: '#1E2E3D',
          },
          community: green,
          education: {
            50: '#F7F5F9', 100: '#EAE6F1', 200: '#D5CDE2', 300: '#BCAED1', 400: '#A08DBE',
            500: '#876FAD', 600: '#7457A0', 700: '#644B89', 800: '#534071', 900: '#413257', 950: '#312740',
          },
          special: {
            50: '#FAF7F2', 100: '#F2EADE', 200: '#E5D6BD', 300: '#D5BD95', 400: '#C4A169',
            500: '#B48842', 600: '#A87523', 700: '#8F6520', 800: '#77541C', 900: '#5B4218', 950: '#423115',
          },
          info: {
            50: '#F2F8F8', 100: '#E0ECEC', 200: '#C0DADA', 300: '#9BC3C3', 400: '#71AAAA',
            500: '#4B9494', 600: '#2E8282', 700: '#296F6F', 800: '#245D5D', 900: '#1E4848', 950: '#193535',
          },
          health: {
            50: '#FAF4F6', 100: '#F2E5E9', 200: '#E5CAD4', 300: '#D6ABBA', 400: '#C5889D',
            500: '#B56883', 600: '#A9506F', 700: '#90455F', 800: '#773B50', 900: '#5C2F3E', 950: '#43242F',
          },
          other: neutral,
        },
      },
    },
  },
  plugins: [],
};
