import React from 'react';
import { AlertCircle } from 'lucide-react';

interface SaveErrorBannerProps {
  onRetry: () => void;
}

export const SaveErrorBanner: React.FC<SaveErrorBannerProps> = ({ onRetry }) => (
  <div className="save-error-banner" role="alert">
    <AlertCircle size={16} />
    <span>Değişiklikler kaydedilemedi.</span>
    <button type="button" className="btn btn-ghost save-error-banner-retry" onClick={onRetry}>
      Yeniden dene
    </button>
  </div>
);
