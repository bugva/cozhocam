import React from 'react';
import { X } from 'lucide-react';
import type { ToolbarDock } from '../../utils/settings';

interface OnboardingTipProps {
  title: string;
  message: string;
  onDismiss: () => void;
  /** Sabit konum (PDF ipuçları — scroll ile kaymaz) */
  position?: 'top' | 'bottom' | 'right' | 'fixed-top';
  /** Çizim dock konumuna göre yerleşim */
  dock?: ToolbarDock;
}

export const OnboardingTip: React.FC<OnboardingTipProps> = ({
  title,
  message,
  onDismiss,
  position = 'bottom',
  dock,
}) => {
  const className = dock
    ? `onboarding-tip onboarding-tip--dock-${dock}`
    : `onboarding-tip onboarding-tip--${position}`;

  return (
    <div className={className} role="note">
      <div className="onboarding-tip-header">
        <strong>{title}</strong>
        <button type="button" className="onboarding-tip-close" onClick={onDismiss} aria-label="Kapat">
          <X size={14} />
        </button>
      </div>
      <p>{message}</p>
      <button type="button" className="btn btn-primary onboarding-tip-btn" onClick={onDismiss}>
        Tamam
      </button>
    </div>
  );
};
