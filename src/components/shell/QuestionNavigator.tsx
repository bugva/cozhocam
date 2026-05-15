import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface QuestionNavigatorProps {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export const QuestionNavigator: React.FC<QuestionNavigatorProps> = ({
  current,
  total,
  onPrev,
  onNext,
}) => {
  if (total <= 0) return null;
  return (
    <div className="question-nav" role="navigation" aria-label="Soru gezgini">
      <button type="button" className="question-nav-btn" onClick={onPrev} disabled={current <= 1} aria-label="Önceki soru">
        <ChevronLeft size={20} />
      </button>
      <span className="question-nav-label">Soru {current} / {total}</span>
      <button type="button" className="question-nav-btn" onClick={onNext} disabled={current >= total} aria-label="Sonraki soru">
        <ChevronRight size={20} />
      </button>
    </div>
  );
};
