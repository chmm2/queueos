import { useToastStore } from '../store/toastStore';

/**
 * Renders the global toast queue in the bottom-right. Mounted once in the
 * console layout and on the public pages.
 */
const STYLES = {
  success: { bg: '#ecfdf5', border: '#a7f3d0', fg: '#047857', dot: '#10b981' },
  error: { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c', dot: '#ef4444' },
  info: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8', dot: '#3b82f6' },
};

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 1000, maxWidth: 340 }}>
      {toasts.map((t) => {
        const s = STYLES[t.type] || STYLES.info;
        return (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            role="status"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: s.bg, border: `1px solid ${s.border}`, color: s.fg,
              padding: '11px 14px', borderRadius: 12, fontSize: 14, cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(0,0,0,.10)', animation: 'toastIn .18s ease-out',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
            <span>{t.message}</span>
          </div>
        );
      })}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
