/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        jewel: {
          ink: '#2d241d',
          brown: '#8b5e34',
          gold: '#c8922c',
          cream: '#fff7e8',
          rose: '#f48fb1',
          teal: '#16a5a0',
          blue: '#4d8dff',
          mint: '#6fd6b6',
        },
      },
      boxShadow: {
        glow: '0 0 32px rgba(248, 207, 129, 0.55)',
        card: '0 18px 55px rgba(92, 63, 36, 0.14)',
      },
    },
  },
  plugins: [],
}
