import React from 'react';
import { Menu, FolderOpen } from 'lucide-react';
import { SaveIndicator, type SaveStatus } from './SaveIndicator';
import { hapticLight } from '../../utils/haptic';

interface SolveChromeActionsProps {
  onOpenLibrary?: () => void;
  saveStatus?: SaveStatus;
}

export const SolveChromeActions: React.FC<SolveChromeActionsProps> = ({ onOpenLibrary, saveStatus }) => {
  const open = () => {
    hapticLight();
    onOpenLibrary?.();
  };

  return (
    <>
      <SaveIndicator status={saveStatus ?? 'idle'} />
      {onOpenLibrary && (
        <>
          <button type="button" className="btn btn-ghost chrome-touch-btn" onClick={open} aria-label="Kütüphane">
            <Menu size={18} />
          </button>
          <button type="button" className="btn btn-ghost chrome-touch-btn solve-library-btn" onClick={open}>
            <FolderOpen size={16} />
            <span className="solve-library-btn-label">Kütüphane</span>
          </button>
        </>
      )}
    </>
  );
};
