import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">{title}</h1>
        <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{description}</p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
