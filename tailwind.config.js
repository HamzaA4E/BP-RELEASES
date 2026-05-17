/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E3A5F',
          light: '#2a4f7a',
          dark: '#152a45',
        },
        accent: {
          DEFAULT: '#3B82F6',
          light: '#60A5FA',
        },
      },
      width: {
        sidebar: '260px',
        infopanel: '240px',
      },
    },
  },
  plugins: [],
};
