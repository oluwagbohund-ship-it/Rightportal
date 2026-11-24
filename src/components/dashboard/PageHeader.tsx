import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1 min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium text-[#2563EB] tracking-tight">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F172A] leading-tight">
          {title}
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{description}</p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

