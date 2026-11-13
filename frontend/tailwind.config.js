/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        depth: {
          abyss: '#080c10',
          deep: '#0b1015',
          mid: '#111921',
          surface: '#172028',
          raised: '#1c2835',
          float: '#223040',
        },
        aqua: {
          DEFAULT: '#2dd4a8',
          dim: '#1a7a6a',
          bright: '#5aedc7',
        },
        gold: {
          DEFAULT: '#e8a838',
          dim: '#7a5a20',
        },
        critical: {
          DEFAULT: '#f04848',
          dim: '#7a2020',
        },
        info: {
          DEFAULT: '#4c8dff',
          dim: '#1e3a6e',
        },
        txt: {
          1: '#e8ecf1',
          2: '#94a3b8',
          3: '#5e6e82',
        },
        edge: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          strong: 'rgba(255,255,255,0.10)',
          accent: 'rgba(45,212,168,0.20)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      borderRadius: {
        'panel': '10px',
      },
      maxWidth: {
        'content': '80rem',
      },
      spacing: {
        'sidebar': '60px',
      },
    },
  },
  plugins: [],
}
