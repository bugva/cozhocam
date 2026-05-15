import React from 'react';
import { X, ListChecks, LayoutGrid } from 'lucide-react';
import { hapticLight } from '../../utils/haptic';

interface SolveExitSheetProps {
  open: boolean;
  onClose: () => void;
  onSelectQuestions: () => void;
  onSelectSolutions: () => void;
}

export const SolveExitSheet: React.FC<SolveExitSheetProps> = ({
  open,
  onClose,
  onSelectQuestions,
  onSelectSolutions,
}) => {
  if (!open) return null;

  return (
    <>
      <button type="button" className="solve-exit-backdrop" onClick={onClose} aria-label="Kapat" />
      <div className="solve-exit-sheet" role="dialog" aria-labelledby="solve-exit-title">
        <header className="solve-exit-sheet-header">
          <span id="solve-exit-title">Düzenlemeye dön</span>
          <button type="button" className="solve-exit-sheet-close" onClick={onClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </header>
        <p className="solve-exit-sheet-hint">Kayıtlı çizimleriniz korunur.</p>
        <div className="solve-exit-sheet-actions">
          <button
            type="button"
            className="solve-exit-option"
            onClick={() => { hapticLight(); onSelectQuestions(); }}
          >
            <span className="solve-exit-option-icon solve-exit-option-icon--question">
              <ListChecks size={20} />
            </span>
            <span className="solve-exit-option-text">
              <span className="solve-exit-option-title">Soru seçimi</span>
              <span className="solve-exit-option-desc">Soru ve öncül kutularını düzenle</span>
            </span>
          </button>
          <button
            type="button"
            className="solve-exit-option"
            onClick={() => { hapticLight(); onSelectSolutions(); }}
          >
            <span className="solve-exit-option-icon solve-exit-option-icon--solution">
              <LayoutGrid size={20} />
            </span>
            <span className="solve-exit-option-text">
              <span className="solve-exit-option-title">Çözüm alanları</span>
              <span className="solve-exit-option-desc">Çözüm bölgelerini ayarla</span>
            </span>
          </button>
        </div>
      </div>
    </>
  );
};
