import { X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useUI } from '../store/ui';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.kind === 'success' && <CheckCircle2 size={16} color="#2fb67c" />}
          {t.kind === 'error' && <AlertCircle size={16} color="#ff8a8e" />}
          {t.kind === 'progress' && <Loader2 size={16} className="spin" />}
          <span style={{ flex: 1 }}>{t.text}</span>
          {t.kind === 'progress' && t.progress !== undefined && (
            <div className="bar">
              <div style={{ width: `${Math.round(t.progress * 100)}%` }} />
            </div>
          )}
          {t.kind !== 'progress' && (
            <button className="icon-btn sm" style={{ color: 'inherit' }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
