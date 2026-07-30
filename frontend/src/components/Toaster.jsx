import { useToastStore } from '../store/toastStore';

/**
 * The global toast queue, bottom-right. Mounted once per surface (console,
 * login, counter desk) so every action confirms itself.
 */
const TONES = {
  success: 'bg-success-tint border-success-tint-border text-success',
  error: 'bg-clay-tint border-clay-tint-border text-clay-ink',
  info: 'bg-surface border-line text-ink-2',
};

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 max-w-[360px]">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          role="status"
          className={`flex items-center gap-3 text-left px-4 py-3 rounded-tile border shadow-card text-[14px] font-medium animate-rise-fast ${
            TONES[t.type] || TONES.info
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
          <span>{t.message}</span>
        </button>
      ))}
    </div>
  );
}
