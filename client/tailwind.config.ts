/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // KAVOX Brand
        kavox: {
          black:    '#0A0A0A',
          charcoal: '#1C1C1C',
          gray:     '#6B6B6B',
          silver:   '#ADADAD',
          cream:    '#FAF8F5',
          sand:     '#F2EDE6',
          tan:      '#D4C4B0',
          brown:    '#8B6F5E',
          dark:     '#3D2B1F',
          // Accent - warm gold/copper
          accent:   '#C8956C',
          'accent-light': '#F0D9C8',
          'accent-dark':  '#A07050',
        },
      },
      fontFamily: {
        display:  ['var(--font-playfair)', 'Georgia', 'serif'],
        body:     ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        heading:  ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono:     ['var(--font-jetbrains)', 'monospace'],
      },
      spacing: {
        '18':  '4.5rem',
        '88':  '22rem',
        '104': '26rem',
        '120': '30rem',
      },
      borderRadius: {
        'kavox': '2px',
        '4xl': '2rem',
      },
      boxShadow: {
        'kavox-sm':  '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'kavox':     '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        'kavox-lg':  '0 24px 64px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.08)',
        'kavox-xl':  '0 40px 80px rgba(0,0,0,0.18)',
        'accent':    '0 8px 32px rgba(200,149,108,0.25)',
        'card-hover':'0 16px 48px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06)',
      },
      animation: {
        'fade-in':       'fadeIn 0.4s ease-out',
        'fade-in-up':    'fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-left': 'slideInLeft 0.4s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right':'slideInRight 0.4s cubic-bezier(0.16,1,0.3,1)',
        'scale-in':      'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'shimmer':       'shimmer 1.8s linear infinite',
        'float':         'float 6s ease-in-out infinite',
        'spin-slow':     'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn:       { from: { opacity: 0 }, to: { opacity: 1 } },
        fadeInUp:     { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideInLeft:  { from: { opacity: 0, transform: 'translateX(-20px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        slideInRight: { from: { opacity: 0, transform: 'translateX(20px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        scaleIn:      { from: { opacity: 0, transform: 'scale(0.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
        shimmer:      { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        float:        { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      },
      backgroundImage: {
        'gradient-kavox': 'linear-gradient(135deg, #FAF8F5 0%, #F2EDE6 100%)',
        'gradient-dark':  'linear-gradient(135deg, #1C1C1C 0%, #0A0A0A 100%)',
        'gradient-accent':'linear-gradient(135deg, #C8956C 0%, #D4A574 100%)',
        'shimmer-base':   'linear-gradient(90deg, #f0ede8 0%, #e8e3dc 50%, #f0ede8 100%)',
      },
      transitionTimingFunction: {
        'kavox': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      screens: {
        'xs': '375px',
        '3xl': '1800px',
      },
    },
  },
  plugins: [],
};
