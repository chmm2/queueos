/**
 * Shared UI primitives for the warm-paper system. Every console screen builds
 * from these so spacing, radii, borders and motion stay consistent.
 */

/** Clay mono label that sits above a page title. */
export function Eyebrow({ children }) {
  return (
    <p className="font-mono text-[11px] tracking-[.2em] uppercase text-clay mb-2.5">{children}</p>
  );
}

/** Small uppercase mono label used inside cards and stat tiles. */
export function MicroLabel({ children, className = '' }) {
  return (
    <p className={`font-mono text-[10px] tracking-[.18em] uppercase text-muted-3 ${className}`}>
      {children}
    </p>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8 animate-rise">
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-[42px] leading-[1.05] font-bold tracking-[-.035em] text-ink">{title}</h1>
        {description && <p className="text-[16px] text-muted mt-2.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** `hover` lifts the card 3px — used for anything clickable. */
export function Card({ children, className = '', pad = true, hover = false, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={`bg-surface border border-line rounded-card shadow-rest transition-all duration-200 ${
        hover ? 'hover:-translate-y-[3px] hover:shadow-lift' : ''
      } ${pad ? 'p-6' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, right, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-5 ${className}`}>
      <h2 className="text-[17px] font-bold tracking-[-.02em] text-ink">{children}</h2>
      {right}
    </div>
  );
}

/** KPI tile: big number, optional delta, mono caption. */
export function StatCard({ label, value, delta, deltaTone = 'success', accent }) {
  const tone =
    deltaTone === 'clay' ? 'text-clay' : deltaTone === 'muted' ? 'text-muted-2' : 'text-success';
  return (
    <Card className="px-6 py-5">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span
          className={`text-[38px] leading-none font-bold tracking-[-.035em] tnum ${
            accent === 'clay' ? 'text-clay' : 'text-ink'
          }`}
        >
          {value}
        </span>
        {delta && <span className={`font-mono text-xs ${tone}`}>{delta}</span>}
      </div>
      <MicroLabel className="mt-3">{label}</MicroLabel>
    </Card>
  );
}

const TONES = {
  neutral: 'bg-espresso-tint border-espresso-tint-border text-ink-2',
  clay: 'bg-clay-tint border-clay-tint-border text-clay-ink',
  success: 'bg-success-tint border-success-tint-border text-success',
  warning: 'bg-warning-tint border-warning-tint-border text-warning-ink',
  espresso: 'bg-espresso border-espresso text-paper',
};

export function Badge({ tone = 'neutral', children, className = '', dot = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-pill border text-[11px] font-semibold ${
        TONES[tone] || TONES.neutral
      } ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-blink" />}
      {children}
    </span>
  );
}

/** Token/queue status → badge tone. */
export const STATUS_TONE = {
  waiting: 'neutral',
  serving: 'espresso',
  held: 'warning',
  skipped: 'warning',
  completed: 'success',
  missed: 'clay',
  cancelled: 'neutral',
  open: 'success',
  paused: 'warning',
  closed: 'neutral',
};

export function EmptyState({ title, hint, action, dashed = false }) {
  return (
    <div
      className={`text-center py-12 px-6 ${
        dashed ? 'border border-dashed border-line-input rounded-tile' : ''
      }`}
    >
      <p className="text-[15px] font-semibold text-ink-2">{title}</p>
      {hint && <p className="text-sm text-muted-2 mt-1.5 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-[11px] bg-espresso hover:bg-espresso-hover text-paper text-[14px] font-semibold transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none',
  secondary:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[11px] border border-line-input bg-surface hover:border-line-strong text-muted hover:text-ink text-[14px] font-semibold transition-colors duration-150 disabled:opacity-45',
  ghost:
    'inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-clay transition-colors',
  danger:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[11px] border border-clay-tint-border bg-clay-tint hover:bg-clay hover:text-paper text-clay-ink text-[14px] font-semibold transition-colors duration-150',
};

export const field =
  'w-full px-4 py-3 rounded-[11px] border border-line-input bg-surface-sunken text-[15px] text-ink placeholder-muted-3 transition-colors';

export const fieldMono = `${field} font-mono`;

/** A row of bars used on branch cards and the login floater. */
export function Sparkline({ values, height = 48, recent = 3 }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-[2px] origin-bottom animate-grow ${
            i >= values.length - recent ? 'bg-clay' : 'bg-spark'
          }`}
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, animationDelay: `${i * 28}ms` }}
        />
      ))}
    </div>
  );
}

/** Thin load/progress bar; turns clay once it passes `warnAt`. */
export function LoadBar({ value, max = 100, warnAt = 0.7, height = 6, tone }) {
  const pct = Math.min(100, (value / Math.max(max, 1)) * 100);
  const over = value / Math.max(max, 1) > warnAt;
  const color = tone || (over ? 'bg-clay' : 'bg-espresso');
  return (
    <div className="w-full rounded-pill bg-espresso-tint overflow-hidden" style={{ height }}>
      <div
        className={`h-full rounded-pill transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Success-tinted pill with a blinking dot — the "this is live" signal. */
export function LivePill({ label = 'Live' }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-success-tint border border-success-tint-border text-success text-[11px] font-bold tracking-[.12em] uppercase font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-success animate-blink" />
      {label}
    </span>
  );
}
