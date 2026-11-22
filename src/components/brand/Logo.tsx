import React from 'react';
import { cn } from '../../lib/utils.ts';

export type LogoVariant = 'primary' | 'white' | 'dark' | 'symbol' | 'compact' | 'app-icon';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  showTagline?: boolean;
  subtitle?: string;
  className?: string;
}

const SYMBOL_SIZES: Record<LogoSize, string> = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
  xl: 'h-14 w-14',
};

const TITLE_SIZES: Record<LogoSize, string> = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
  xl: 'text-2xl',
};

export function DTMonogramSvg({
  tone = 'primary',
  className,
}: {
  tone?: 'primary' | 'white' | 'dark';
  className?: string;
}) {
  const spineColor = tone === 'white' ? '#93C5FD' : '#1E3A8A';
  const dColor = tone === 'white' ? '#FFFFFF' : '#0F172A';
  const tStemColor = tone === 'white' ? '#60A5FA' : tone === 'dark' ? '#0F172A' : '#1E3A8A';
  const tCrossColor = tone === 'dark' ? '#1E3A8A' : '#2563EB';
  const nodeColor = tone === 'white' ? '#60A5FA' : tone === 'dark' ? '#0F172A' : '#2563EB';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect x="6" y="10" width="16" height="5.5" rx="1.5" fill={spineColor} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 19.5H23.5C33.4 19.5 39.5 25.8 39.5 36.75C39.5 47.7 33.4 54 23.5 54H6V19.5ZM14.5 27.5V46H22.8C27.8 46 31 42.4 31 36.75C31 31.1 27.8 27.5 22.8 27.5H14.5Z"
        fill={dColor}
      />
      <rect x="42.5" y="19.5" width="8.5" height="34.5" rx="1" fill={tStemColor} />
      <path d="M26 10H58L53.5 16.5H26V10Z" fill={tCrossColor} />
      <rect x="53.5" y="48.5" width="5.5" height="5.5" rx="1.2" fill={nodeColor} />
    </svg>
  );
}

export function Logo({
  variant = 'primary',
  size = 'md',
  showTagline = false,
  subtitle,
  className,
}: LogoProps) {
  if (variant === 'app-icon') {
    return (
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-xl bg-[#0F172A] border border-[#1E3A8A] p-1.5 shadow-sm shrink-0',
          SYMBOL_SIZES[size],
          className,
        )}
      >
        <DTMonogramSvg tone="white" className="h-full w-full" />
      </div>
    );
  }

  if (variant === 'symbol') {
    return (
      <span className={cn('inline-flex items-center justify-center shrink-0', className)}>
        <DTMonogramSvg tone="primary" className={SYMBOL_SIZES[size]} />
      </span>
    );
  }

  const tone: 'primary' | 'white' | 'dark' =
    variant === 'white' ? 'white' : variant === 'dark' ? 'dark' : 'primary';

  const titleClass = variant === 'white' ? 'text-white' : 'text-[#0F172A]';
  const subtitleClass =
    variant === 'white'
      ? 'text-[#93C5FD]'
      : variant === 'dark'
        ? 'text-slate-600'
        : 'text-[#1E3A8A]';

  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <DTMonogramSvg tone={tone} className={SYMBOL_SIZES[size]} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-bold tracking-tight whitespace-nowrap',
            TITLE_SIZES[size],
            titleClass,
          )}
        >
          {variant === 'compact' ? 'Dave Timi EdTech' : 'Dave Timi EdTech Systems'}
        </span>
        {showTagline || subtitle ? (
          <span
            className={cn(
              'mt-1 text-[10px] font-semibold tracking-[0.12em] uppercase whitespace-nowrap',
              subtitleClass,
            )}
          >
            {subtitle ?? 'Build • Innovate • Transform'}
          </span>
        ) : null}
      </span>
    </span>
  );
}
