import React from 'react';

interface PdfDrawControlsProps {
  drawType: 'question' | 'stem';
  onDrawTypeChange: (t: 'question' | 'stem') => void;
  questionRegions: { id: string }[];
  activeQuestionId: string | null;
  onActiveQuestionIdChange: (id: string) => void;
}

export const PdfDrawControls: React.FC<PdfDrawControlsProps> = ({
  drawType,
  onDrawTypeChange,
  questionRegions,
  activeQuestionId,
  onActiveQuestionIdChange,
}) => (
  <div className="pdf-draw-controls">
    <div className="pdf-mode-tabs">
      {([
        { t: 'question' as const, label: 'Soru' },
        { t: 'stem' as const, label: 'Öncül' },
      ]).map(item => (
        <button
          key={item.t}
          type="button"
          className={`pdf-mode-tab${drawType === item.t ? ` is-active--${item.t}` : ''}`}
          onClick={() => onDrawTypeChange(item.t)}
        >
          {item.label}
        </button>
      ))}
    </div>
    {drawType === 'stem' && questionRegions.length > 0 && (
      <div className="pdf-stem-target">
        <label htmlFor="pdf-stem-parent">Bağlı soru</label>
        <select
          id="pdf-stem-parent"
          value={activeQuestionId ?? ''}
          onChange={e => onActiveQuestionIdChange(e.target.value)}
        >
          {questionRegions.map((q, i) => (
            <option key={q.id} value={q.id}>Soru {i + 1}</option>
          ))}
        </select>
      </div>
    )}
  </div>
);
