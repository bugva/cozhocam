import React from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import type { SaveNotificationMode } from '../../utils/settings';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveIndicatorProps {
  status: SaveStatus;
  onRetry?: () => void;
  notificationMode?: SaveNotificationMode;
}

export const SaveIndicator: React.FC<SaveIndicatorProps> = ({
  status,
  onRetry,
  notificationMode = 'error_only',
}) => {
  if (status === 'idle') return null;
  if (notificationMode === 'off') return null;

  if (status === 'saving') {
    if (notificationMode !== 'brief') return null;
    return (
      <span className="save-indicator save-indicator--saving" role="status">
        <Loader2 size={14} className="spin" />
        Kaydediliyor…
      </span>
    );
  }

  if (status === 'saved') {
    if (notificationMode !== 'brief') return null;
    return (
      <span
        className="save-indicator save-indicator--saved save-indicator--icon-only"
        role="status"
        aria-label="Kaydedildi"
      >
        <Check size={14} />
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="save-indicator save-indicator--error" role="status">
        <AlertCircle size={14} />
        Kayıt başarısız
        {onRetry && (
          <button type="button" className="save-indicator-retry" onClick={onRetry}>
            Yeniden dene
          </button>
        )}
      </span>
    );
  }

  return null;
};
