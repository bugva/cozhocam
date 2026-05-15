import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  compact?: boolean;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  compact,
}) => (
  <div className={`zoom-controls${compact ? ' zoom-controls--compact' : ''}`}>
    <button type="button" className="zoom-btn" onClick={onZoomOut} aria-label="Uzaklaştır">
      <Minus size={16} />
    </button>
    <button type="button" className="zoom-btn zoom-btn--label" onClick={onZoomReset} aria-label="Yakınlaştırmayı sıfırla">
      {Math.round(zoom * 100)}%
    </button>
    <button type="button" className="zoom-btn" onClick={onZoomIn} aria-label="Yakınlaştır">
      <Plus size={16} />
    </button>
  </div>
);
