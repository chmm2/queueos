/**
 * Shared UI primitives — the design system for the console. Every page uses
 * these so headers, cards, stats, badges and empty states look identical
 * across the product.
 */

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="text-sm text-ink-500 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', pad = true }) {
  return (
    <div className={`bg-white rounded-2xl border border-ink-200/70 shadow-card ${pad ? 'p-6' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[0.95rem] font-semibold text-ink-800">{children}</h2>
      {right}
    </div>
  );
}

export function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-200/70 shadow-card px-5 py-4">
      <p className={`text-[1.7rem] leading-none font-semibold tnum ${accent ? 'text-brand-600' : 'text-ink-900'}`}>{value}</p>
      <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mt-2">{label}</p>
      {sub && <p className="text-xs text-ink-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'bg-ink-100 text-ink-600',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
  orange: 'bg-orange-50 text-orange-700',
};

export function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${BADGE_TONES[tone] || BADGE_TONES.neutral}`}>
      {children}
    </span>
  );
}

// Map token statuses to badge tones in one place.
export const STATUS_TONE = {
  waiting: 'neutral',
  serving: 'brand',
  held: 'warning',
  skipped: 'orange',
  completed: 'success',
  missed: 'danger',
  cancelled: 'neutral',
};

export function EmptyState({ title, hint, action }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="mx-auto w-10 h-10 rounded-xl bg-ink-100 grid place-items-center mb-3">
        <span className="text-ink-400 text-lg">·</span>
      </div>
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {hint && <p className="text-sm text-ink-400 mt-1 max-w-xs mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition shadow-sm disabled:opacity-50 disabled:pointer-events-none',
  secondary:
    'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-ink-700 text-sm font-medium transition disabled:opacity-50',
  ghost:
    'inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg hover:bg-ink-100 text-ink-500 text-sm transition',
  danger:
    'inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition',
};

export const field =
  'w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white text-sm text-ink-800 placeholder-ink-400 transition focus:border-brand-400';
