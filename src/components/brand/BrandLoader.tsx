import React from 'react';
import { BRAND_LOGO_URL } from './Logo.tsx';
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
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md p-2.5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-full border-2 border-transparent border-t-[#2563EB] border-r-[#1E3A8A] motion-safe:animate-spin"
        />
        <img
          src={BRAND_LOGO_URL}
          alt="Dave Timi EdTech Systems rolling logo"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain motion-safe:animate-logo-roll select-none"
        />
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
