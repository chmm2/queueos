/**
 * The QueueOS mark: three stick figures queued at a service desk.
 *
 * The animation IS the brand — on a 3.6s loop the front figure is served and
 * walks off, everyone steps forward, and a new arrival joins the back. The
 * tile clips the overflow so figures enter and exit cleanly.
 *
 * `static` renders all three at rest (used on the QR badge, where motion would
 * be noise on a printed surface).
 */

// One figure: head + body/arms/legs as a single path, centred on `x`.
function Figure({ x, color, opacity = 1, className }) {
  return (
    <g
      stroke={color}
      strokeWidth="2.6"
      strokeLinecap="round"
      fill="none"
      opacity={opacity}
      className={className}
    >
      <circle cx={x} cy="11" r="3.6" fill={color} stroke="none" />
      <path
        d={`M${x} 15 V26 M${x} 18 L${x - 4.5} 22.5 M${x} 18 L${x + 4.5} 22.5 M${x} 26 L${x - 4.5} 34 M${x} 26 L${x + 4.5} 34`}
      />
    </g>
  );
}

const SIZES = {
  login: { w: 86, h: 56, radius: 'rounded-[18px]', svgW: 76, svgH: 36, shadow: 'shadow-logo' },
  sidebar: { w: 58, h: 40, radius: 'rounded-[12px]', svgW: 50, svgH: 24, shadow: '' },
  badge: { w: 58, h: 44, radius: 'rounded-[13px]', svgW: 50, svgH: 26, shadow: '' },
};

export default function Logo({ size = 'sidebar', static: isStatic = false, className = '' }) {
  const s = SIZES[size] || SIZES.sidebar;
  const CLAY = '#C2603C';
  const CREAM = '#F4F1E8';

  return (
    <div
      className={`relative grid place-items-center overflow-hidden bg-espresso ${s.radius} ${s.shadow} ${className}`}
      style={{ width: s.w, height: s.h }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 96 44" style={{ width: s.svgW, height: s.svgH, overflow: 'visible' }}>
        {/* the service desk */}
        <rect x="2" y="20" width="7" height="18" rx="3" fill={CLAY} opacity=".85" />
        <Figure x={26} color={CLAY} className={isStatic ? '' : 'animate-q-front'} />
        <Figure x={50} color={CREAM} opacity=".85" className={isStatic ? '' : 'animate-q-mid'} />
        <Figure x={74} color={CREAM} opacity=".6" className={isStatic ? '' : 'animate-q-back'} />
      </svg>
    </div>
  );
}

/** Logo + wordmark, used on the login screen and in the sidebar. */
export function Wordmark({ size = 'sidebar', sub, className = '' }) {
  const big = size === 'login';
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Logo size={size} />
      <div className="min-w-0">
        <div
          className={`font-bold tracking-[-.03em] text-ink ${big ? 'text-2xl' : 'text-[17px]'}`}
        >
          QueueOS
        </div>
        {sub && (
          <div className="font-mono text-[10px] tracking-[.2em] uppercase text-muted-2 truncate">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
