import React from 'react';
import { DTMonogramSvg } from './Logo.tsx';
import { cn } from '../../lib/utils.ts';

interface BrandLoaderProps {
  label?: string;
  fullScreen?: boolean;
  className?: string;
}

export function BrandLoader({
  label = 'Loading Dave Timi EdTech Systems...',
  fullScreen = false,
  className,
}: BrandLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-4 bg-[#F8FAFC] text-[#0F172A]',
        fullScreen ? 'min-h-screen px-4' : 'min-h-[42vh] py-12 px-4',
        className,
      )}
    >
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <DTMonogramSvg tone="primary" className="h-10 w-10 motion-safe:animate-pulse" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-[#0F172A]">{label}</p>
        <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#1E3A8A]">
          Build • Innovate • Transform
        </p>
      </div>
    </div>
  );
}
