/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // "Warm paper" system — off-white grounds, ink-espresso primary,
        // clay accent. Tokens map 1:1 to the design handoff.
        paper: '#F4F1E8',
        surface: {
          DEFAULT: '#FFFDF8',
          sunken: '#F7F4EC',
          alt: '#F9F6EF',
        },
        sidebar: '#EFEBE0',
        line: {
          DEFAULT: '#E5DFD2',
          soft: '#EDE7DA',
          input: '#E1DACB',
          strong: '#C9C0AD',
        },
        ink: {
          DEFAULT: '#1B1A17',
          2: '#4A443A',
        },
        muted: {
          DEFAULT: '#6B6357',
          2: '#8A8172',
          3: '#A79E8E',
        },
        espresso: {
          DEFAULT: '#2E2A22',
          hover: '#17140F',
          tint: '#F3ECE0',
          'tint-border': '#E6DCC9',
        },
        clay: {
          DEFAULT: '#C2603C',
          ink: '#B04E2E',
          tint: '#F6EEE9',
          'tint-border': '#EBD8CD',
        },
        success: {
          DEFAULT: '#3F7D5A',
          tint: '#EDF3EE',
          'tint-border': '#CFE0D4',
        },
        warning: {
          DEFAULT: '#D8A24A',
          ink: '#98701F',
          tint: '#FBF2E4',
          'tint-border': '#EDDCBE',
        },
        board: {
          bg: '#1B1A17',
          amber: '#F0C48A',
        },
        spark: '#DCCFB8',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '20px',
        tile: '14px',
        pill: '999px',
      },
      boxShadow: {
        rest: '0 2px 0 rgba(43,38,28,.03)',
        lift: '0 14px 34px rgba(43,38,28,.08)',
        card: '0 18px 40px rgba(43,38,28,.07)',
        login: '0 30px 70px rgba(43,38,28,.10)',
        logo: '0 12px 28px rgba(46,42,34,.25)',
      },
      keyframes: {
        // The logo IS the brand: three figures queueing at a desk.
        qFront: {
          '0%,52%': { transform: 'translateX(0)', opacity: '1' },
          '72%,100%': { transform: 'translateX(-34px)', opacity: '0' },
        },
        qMid: {
          '0%,52%': { transform: 'translateX(0)' },
          '74%,100%': { transform: 'translateX(-24px)' },
        },
        qBack: {
          '0%': { transform: 'translateX(28px)', opacity: '0' },
          '22%,52%': { transform: 'translateX(0)', opacity: '1' },
          '74%,100%': { transform: 'translateX(-24px)', opacity: '1' },
        },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.2' } },
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        grow: { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
        ripple: {
          '0%': { transform: 'scale(.8)', opacity: '.5' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
      },
      animation: {
        'q-front': 'qFront 3.6s ease-in-out infinite',
        'q-mid': 'qMid 3.6s ease-in-out infinite',
        'q-back': 'qBack 3.6s ease-in-out infinite',
        blink: 'blink 1.6s ease-in-out infinite',
        rise: 'rise .5s ease both',
        'rise-fast': 'rise .4s ease both',
        floaty: 'floaty 11s ease-in-out infinite',
        grow: 'grow .6s cubic-bezier(.2,.8,.2,1) both',
        ripple: 'ripple 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
