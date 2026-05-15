import React from 'react';
import { X } from 'lucide-react';

interface OnboardingTipProps {
  title: string;
  message: string;
  onDismiss: () => void;
  position?: 'top' | 'bottom' | 'right';
}

export const OnboardingTip: React.FC<OnboardingTipProps> = ({
  title,
  message,
  onDismiss,
  position = 'bottom',
}) => (
  <div className={`onboarding-tip onboarding-tip--${position}`} role="note">
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
