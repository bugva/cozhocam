import React from 'react';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbProps {
  segments: string[];
  current: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ segments, current }) => (
  <nav className="chrome-breadcrumb" aria-label="Konum">
    {segments.map(seg => (
      <React.Fragment key={seg}>
        <span className="chrome-breadcrumb-seg">{seg}</span>
        <ChevronRight size={12} className="chrome-breadcrumb-sep" aria-hidden />
      </React.Fragment>
    ))}
    <span className="chrome-breadcrumb-current" title={current}>
      {current}
    </span>
  </nav>
);
