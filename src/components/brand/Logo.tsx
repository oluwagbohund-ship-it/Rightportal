import React, { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

export const BRAND_LOGO_URL =
  '/assets/aistudio/file_00000000bfa48211935825107a39d709_cd7bd4b9.png';

export type LogoVariant = 'primary' | 'white' | 'dark' | 'symbol' | 'compact' | 'app-icon';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  showTagline?: boolean;
  subtitle?: string;
  className?: string;
}

const IMAGE_HEIGHTS: Record<LogoSize, string> = {
  xs: 'h-10',
  sm: 'h-12',
  md: 'h-14',
  lg: 'h-16',
  xl: 'h-20',
};

const ICON_BOX_SIZES: Record<LogoSize, string> = {
  xs: 'h-9 w-9 p-1',
  sm: 'h-11 w-11 p-1.5',
  md: 'h-12 w-12 p-1.5',
  lg: 'h-14 w-14 p-1.5',
  xl: 'h-16 w-16 p-2',
};

export function DTMonogramSvg({
  className,
}: {
  tone?: 'primary' | 'white' | 'dark';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-lg bg-[#1E3A8A] text-white shrink-0',
          className,
        )}
      >
        <GraduationCap className="h-5 w-5" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={BRAND_LOGO_URL}
      alt="Dave Timi EdTech Systems Logo"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('object-contain select-none shrink-0', className)}
    />
  );
}

export function Logo({
  variant = 'primary',
  size = 'md',
  className,
}: LogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (variant === 'app-icon') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm shrink-0 overflow-hidden',
          ICON_BOX_SIZES[size],
          className,
        )}
      >
        {imgFailed ? (
          <GraduationCap className="h-6 w-6 text-[#1E3A8A]" aria-hidden="true" />
        ) : (
          <img
            src={BRAND_LOGO_URL}
            alt="Dave Timi EdTech Systems"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-contain select-none"
          />
        )}
      </span>
    );
  }

  const isOnDarkSurface = variant === 'white';

  return (
    <span
      className={cn(
        'inline-flex items-center select-none shrink-0',
        isOnDarkSurface &&
          'rounded-xl bg-white px-3 py-2 shadow-sm border border-slate-200/80',
        className,
      )}
    >
      {imgFailed ? (
        <span className="inline-flex items-center gap-2 font-bold text-sm text-[#0F172A]">
          <GraduationCap className="h-5 w-5 text-[#1E3A8A]" aria-hidden="true" />
          <span>Dave Timi EdTech Systems</span>
        </span>
      ) : (
        <img
          src={BRAND_LOGO_URL}
          alt="Dave Timi EdTech Systems"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={cn('w-auto object-contain', IMAGE_HEIGHTS[size])}
        />
      )}
    </span>
  );
}
