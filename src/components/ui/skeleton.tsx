import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('dt-skeleton rounded-md', className)}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5 py-2" aria-busy="true" aria-label="Loading records">
      <div className="grid gap-3 border-b border-slate-200 pb-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, idx) => (
          <Skeleton key={idx} className="h-3.5 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div
          key={rIdx}
          className="grid gap-3 py-2 border-b border-slate-100 last:border-0"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, cIdx) => (
            <Skeleton key={cIdx} className={cIdx === 0 ? 'h-4 w-24' : 'h-4 w-3/4'} />
          ))}
        </div>
      ))}
    </div>
  );
}
