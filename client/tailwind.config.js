/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        te: {
          bg: '#1a1a1a',
          panel: '#252525',
          'panel-dark': '#1e1e1e',
          border: '#3a3a3a',
          'border-light': '#4a4a4a',
          fuchsia: '#d946ef',
          'fuchsia-dim': '#a21caf',
          'fuchsia-glow': 'rgba(217, 70, 239, 0.3)',
          cream: '#f5f0e6',
          'cream-muted': '#a89f8f',
          'cream-dim': '#7a7468',
          lcd: '#0d0712',
          'lcd-dim': '#0a0510',
          'lcd-text': '#e879f9',
          'lcd-text-dim': '#a855f7',
          led: {
            green: '#a855f7',
            'green-glow': 'rgba(168, 85, 247, 0.4)',
            red: '#ff3b30',
            'red-glow': 'rgba(255, 59, 48, 0.4)',
            amber: '#e879f9',
            'amber-glow': 'rgba(232, 121, 249, 0.4)',
          }
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'JetBrains Mono', 'monospace'],
        lcd: ['Space Mono', 'monospace'],
      },
      borderRadius: {
        'te': '12px',
        'te-sm': '8px',
        'te-lg': '16px',
      },
      borderWidth: {
        '3': '3px',
      },
      boxShadow: {
        'te-glow': '0 0 20px rgba(217, 70, 239, 0.2)',
        'te-glow-strong': '0 0 30px rgba(217, 70, 239, 0.4)',
        'led-green': '0 0 8px rgba(0, 255, 136, 0.6)',
        'led-red': '0 0 8px rgba(255, 59, 48, 0.6)',
        'led-amber': '0 0 8px rgba(255, 204, 0, 0.6)',
        'te-inset': 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
        'te-button': '0 4px 0 #1a1a1a, 0 6px 12px rgba(0, 0, 0, 0.4)',
        'te-button-pressed': '0 1px 0 #1a1a1a, 0 2px 4px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'led-pulse': 'led-pulse 2s ease-in-out infinite',
        'lcd-flicker': 'lcd-flicker 0.15s ease-in-out infinite',
        'scan-line': 'scan-line 8s linear infinite',
        'cursor-blink': 'cursor-blink 1s step-end infinite',
      },
      keyframes: {
        'led-pulse': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
        'lcd-flicker': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.98' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      }
    },
  },
  plugins: [],
}
