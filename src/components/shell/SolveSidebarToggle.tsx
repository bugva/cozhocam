import React from 'react';
import { Menu } from 'lucide-react';
import { hapticLight } from '../../utils/haptic';

interface SolveSidebarToggleProps {
  onOpen: () => void;
  className?: string;
}

export const SolveSidebarToggle: React.FC<SolveSidebarToggleProps> = ({ onOpen, className = '' }) => (
  <button
    type="button"
    className={`sidebar-toggle-btn chrome-topbar-menu-btn${className ? ` ${className}` : ''}`}
    onClick={() => { hapticLight(); onOpen(); }}
    aria-label="Kütüphaneyi aç"
    title="Kütüphane"
  >
    <Menu size={18} />
  </button>
);
