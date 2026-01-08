/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#050505',
          surface: '#0a0a0a',
          border: '#1a1a1a',
          muted: '#2a2a2a',
          text: '#e5e5e5',
          'text-muted': '#737373',
          accent: '#8b5cf6',
          'accent-glow': 'rgba(139, 92, 246, 0.15)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.1)' },
          '100%': { boxShadow: '0 0 40px rgba(139, 92, 246, 0.3)' },
        }
      }
    },
  },
  plugins: [],
}
