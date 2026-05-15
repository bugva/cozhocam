import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { hapticLight } from '../utils/haptic';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<{
  confirm: (options: ConfirmOptions) => Promise<boolean>;
} | null>(null);

const ConfirmDialog: React.FC<{
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ options, onConfirm, onCancel }) => (
  <div
    className="confirm-dialog-backdrop"
    role="presentation"
    onClick={onCancel}
  >
    <div
      className="confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onClick={e => e.stopPropagation()}
    >
      <h2 id="confirm-dialog-title" className="confirm-dialog-title">{options.title}</h2>
      <p id="confirm-dialog-message" className="confirm-dialog-message">{options.message}</p>
      <div className="confirm-dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {options.cancelLabel ?? 'İptal'}
        </button>
        <button
          type="button"
          className={`btn${options.danger ? ' btn-danger' : ' btn-primary'}`}
          onClick={onConfirm}
          autoFocus
        >
          {options.confirmLabel ?? 'Onayla'}
        </button>
      </div>
    </div>
  </div>
);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hapticLight();
        pending.resolve(false);
        setPending(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setPending({ ...options, resolve });
    });
  }, []);

  const finish = (result: boolean) => {
    hapticLight();
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <ConfirmDialog
          options={pending}
          onConfirm={() => finish(true)}
          onCancel={() => finish(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
};

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
