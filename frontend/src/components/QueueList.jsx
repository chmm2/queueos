const STATUS_STYLES = {
  waiting: 'bg-gray-100 text-gray-700',
  serving: 'bg-brand-50 text-brand-700',
  held: 'bg-amber-100 text-amber-700',
  skipped: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  missed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

function formatEta(seconds) {
  if (seconds == null) return '—';
  const mins = Math.round(seconds / 60);
  return mins <= 1 ? '<1 min' : `${mins} min`;
}

export default function QueueList({ tokens, actions }) {
  if (!tokens?.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">No tokens in the queue right now.</p>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {tokens.map((t) => (
        <div key={t._id} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-800">{t.tokenNumber}</span>
            {t.isPriority && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">priority</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[t.status] || ''}`}>
              {t.status}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">ETA {formatEta(t.predictedEtaSeconds)}</span>
            {actions && actions(t)}
          </div>
        </div>
      ))}
    </div>
  );
}
