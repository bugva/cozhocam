import React from 'react';
import { SaveIndicator, type SaveStatus } from './SaveIndicator';
import type { SaveNotificationMode } from '../../utils/settings';

interface SolveChromeActionsProps {
  saveStatus?: SaveStatus;
  onSaveRetry?: () => void;
  saveNotification?: SaveNotificationMode;
}

export const SolveChromeActions: React.FC<SolveChromeActionsProps> = ({
  saveStatus,
  onSaveRetry,
  saveNotification,
}) => (
  <SaveIndicator
    status={saveStatus ?? 'idle'}
    onRetry={onSaveRetry}
    notificationMode={saveNotification}
  />
);
