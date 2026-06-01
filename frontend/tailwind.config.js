/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Workmate Brand
        wm: {
          bg:       '#232223',  // Anthrazit – Haupt-Hintergrund
          surface:  '#2c2b2c',  // Cards / Sidebar
          border:   '#444444',  // Rahmen, Trennlinien
          muted:    '#B3B3B3',  // Sekundärtext
          orange:   '#FF9100',  // Core Brand Accent
          // Produkt-Akzente
          green:    '#00E676',  // EVENT – Laser Green
          blue:     '#0077FF',  // OS – Electric Blue
          purple:   '#D500F9',  // LIVE – Neon Purple
          cyan:     '#00E5FF',  // ACCESS – Cyber Cyan
          amber:    '#FFC400',  // CHECKUP – Bright Amber
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-green':  '0 0 20px 4px rgba(0,230,118,0.25)',
        'glow-green-sm': '0 0 10px 2px rgba(0,230,118,0.18)',
        'glow-orange': '0 0 20px 4px rgba(255,145,0,0.25)',
      }
    }
  },
  plugins: []
}
