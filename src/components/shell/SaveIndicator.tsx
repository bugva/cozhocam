import React from 'react';
import { Loader2, Check } from 'lucide-react';

export type SaveStatus = 'idle' | 'saving' | 'saved';

export const SaveIndicator: React.FC<{ status: SaveStatus }> = ({ status }) => {
  if (status === 'idle') return null;
  return (
    <span className={`save-indicator save-indicator--${status}`} role="status">
      {status === 'saving' ? (
        <>
          <Loader2 size={14} className="spin" />
          Kaydediliyor…
        </>
      ) : (
        <>
          <Check size={14} />
          Kaydedildi
        </>
      )}
    </span>
  );
};
