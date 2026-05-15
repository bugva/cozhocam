import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { hapticLight } from '../../utils/haptic';

interface SolveFocusToggleProps {
  focusMode: boolean;
  onToggle: () => void;
}

export const SolveFocusToggle: React.FC<SolveFocusToggleProps> = ({ focusMode, onToggle }) => (
  <button
    type="button"
    className={`tool-btn${focusMode ? ' is-active' : ''}`}
    onClick={() => { hapticLight(); onToggle(); }}
    aria-label={focusMode ? 'Tam ekrandan çık' : 'Tam ekran'}
    title={focusMode ? 'Tam ekrandan çık' : 'Tam ekran'}
  >
    {focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
  </button>
);
