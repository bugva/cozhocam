import React from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { hapticLight } from '../../utils/haptic';

interface ClassicThumbZoneProps {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  canShowSol: boolean;
  solShown: boolean;
  onToggleSol: () => void;
}

export const ClassicThumbZone: React.FC<ClassicThumbZoneProps> = ({
  current,
  total,
  onPrev,
  onNext,
  canShowSol,
  solShown,
  onToggleSol,
}) => (
  <div className="doc-thumb-zone classic-thumb-zone" role="toolbar" aria-label="Soru gezgini">
    {canShowSol && (
      <button
        type="button"
        className={`doc-thumb-btn doc-thumb-btn--primary${solShown ? ' is-active' : ''}`}
        onClick={() => { hapticLight(); onToggleSol(); }}
      >
        {solShown ? <EyeOff size={18} /> : <Eye size={18} />}
        <span>{solShown ? 'Gizle' : 'Çözüm'}</span>
      </button>
    )}
    {total > 1 && (
      <div className="doc-thumb-page-row">
        <button
          type="button"
          className="doc-thumb-btn"
          disabled={current <= 1}
          onClick={() => { hapticLight(); onPrev(); }}
          aria-label="Önceki soru"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="doc-thumb-page-label">{current} / {total}</span>
        <button
          type="button"
          className="doc-thumb-btn"
          disabled={current >= total}
          onClick={() => { hapticLight(); onNext(); }}
          aria-label="Sonraki soru"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    )}
  </div>
);
