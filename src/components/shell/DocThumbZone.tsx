import React from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { hapticLight } from '../../utils/haptic';

interface DocThumbZoneProps {
  pageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  canToggleSol: boolean;
  solShown: boolean;
  onToggleSol: () => void;
  solLabel?: string;
}

export const DocThumbZone: React.FC<DocThumbZoneProps> = ({
  pageIndex,
  totalPages,
  onPrevPage,
  onNextPage,
  canToggleSol,
  solShown,
  onToggleSol,
  solLabel = 'Çözüm',
}) => (
  <div className="doc-thumb-zone" role="toolbar" aria-label="Hızlı işlemler">
    {canToggleSol && (
      <button
        type="button"
        className={`doc-thumb-btn doc-thumb-btn--primary${solShown ? ' is-active' : ''}`}
        onClick={() => { hapticLight(); onToggleSol(); }}
      >
        {solShown ? <EyeOff size={18} /> : <Eye size={18} />}
        <span>{solShown ? 'Gizle' : solLabel}</span>
      </button>
    )}
    {totalPages > 1 && (
      <div className="doc-thumb-page-row">
        <button
          type="button"
          className="doc-thumb-btn"
          disabled={pageIndex <= 0}
          onClick={() => { hapticLight(); onPrevPage(); }}
          aria-label="Önceki sayfa"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="doc-thumb-page-label">{pageIndex + 1} / {totalPages}</span>
        <button
          type="button"
          className="doc-thumb-btn"
          disabled={pageIndex >= totalPages - 1}
          onClick={() => { hapticLight(); onNextPage(); }}
          aria-label="Sonraki sayfa"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    )}
  </div>
);
