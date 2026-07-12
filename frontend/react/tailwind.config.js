/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // RaLab5 — design system NGE (FicheLayout)
        nge: {
          DEFAULT: '#003170',
          dark: '#00224f',
          deep: '#002C77',
          ink: '#001a3d',
          yellow: {
            DEFAULT: '#ffcc00',
            dark: '#e6b900',
          },
        },
        bg: '#f8fafc',
        sidebar: '#003170',
        accent: {
          DEFAULT: '#003170',
          hover: '#00224f',
        },
        surface: '#ffffff',
        border: '#dbe1ea',
        text: {
          DEFAULT: '#172033',
          muted: '#69758a',
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
