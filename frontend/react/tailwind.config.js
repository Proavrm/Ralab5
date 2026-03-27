/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design system RaLab — inspiré des CSS variables du HTML legacy
        bg: '#f4f4f0',
        sidebar: '#1e1e2e',
        accent: {
          DEFAULT: '#5b6af0',
          hover: '#4a58d4',
        },
        surface: '#ffffff',
        border: '#e2e2dc',
        text: {
          DEFAULT: '#1a1a2e',
          muted: '#6b6b80',
        },
        danger: '#e24b4a',
        success: '#1d9e75',
        warn: '#ef9f27',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
}
