import React from 'react';
import { Check, Loader2, Settings } from 'lucide-react';
import { SaveIndicator, type SaveStatus } from './SaveIndicator';
import { Breadcrumb } from './Breadcrumb';

export type WorkspaceMode = 'SELECT_QUESTIONS' | 'ADJUST_SOLUTIONS' | 'SOLVE';

interface WorkspaceTopBarProps {
  docName: string;
  mode: WorkspaceMode;
  onGoEdit?: () => void;
  onInferSolutions?: () => void;
  onStartSolving?: () => void;
  canInfer?: boolean;
  isCropping?: boolean;
  drawControls?: React.ReactNode;
  rightExtra?: React.ReactNode;
  saveStatus?: SaveStatus;
  breadcrumbSegments?: string[];
}

const STEPS: { id: WorkspaceMode; label: string; num: number }[] = [
  { id: 'SELECT_QUESTIONS', label: 'Soru', num: 1 },
  { id: 'ADJUST_SOLUTIONS', label: 'Çözüm alanı', num: 2 },
  { id: 'SOLVE', label: 'Çöz', num: 3 },
];

export const WorkspaceTopBar: React.FC<WorkspaceTopBarProps> = ({
  docName,
  mode,
  onInferSolutions,
  onStartSolving,
  canInfer,
  isCropping,
  drawControls,
  rightExtra,
  saveStatus,
  breadcrumbSegments = [],
}) => {
  const stepIndex = STEPS.findIndex(s => s.id === mode);

  return (
    <header className="chrome-topbar">
      <div className="chrome-topbar-start">
        {breadcrumbSegments.length > 0 ? (
          <Breadcrumb segments={breadcrumbSegments} current={docName} />
        ) : (
          <span className="chrome-doc-name" title={docName}>{docName}</span>
        )}
        <nav className="chrome-stepper" aria-label="İlerleme">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`chrome-step${i === stepIndex ? ' is-current' : ''}${i < stepIndex ? ' is-done' : ''}`}
            >
              <span className="chrome-step-num">{s.num}</span>
              <span className="chrome-step-label">{s.label}</span>
            </span>
          ))}
        </nav>
      </div>

      {drawControls && mode === 'SELECT_QUESTIONS' && (
        <div className="chrome-topbar-center">{drawControls}</div>
      )}

      <div className="chrome-topbar-end">
        <SaveIndicator status={saveStatus ?? 'idle'} />
        {rightExtra}
        {mode === 'SELECT_QUESTIONS' && onInferSolutions && (
          <button type="button" className="btn btn-primary chrome-touch-btn" onClick={onInferSolutions} disabled={!canInfer}>
            <Settings size={16} /> Alanları Çıkar
          </button>
        )}
        {mode === 'ADJUST_SOLUTIONS' && onStartSolving && (
          <button type="button" className="btn btn-success chrome-touch-btn" onClick={onStartSolving} disabled={isCropping}>
            {isCropping ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
            {isCropping ? 'Kırpılıyor…' : 'Çözüme Başla'}
          </button>
        )}
      </div>
    </header>
  );
};
