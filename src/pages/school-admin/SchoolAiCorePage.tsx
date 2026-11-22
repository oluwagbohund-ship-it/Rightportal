import React, { useEffect, useState } from 'react';
import { AiCoreFoundationView } from '../../components/dashboard/AiCoreFoundationView.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AiCoreBlueprint } from '../../types/app.ts';

export function SchoolAiCorePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<AiCoreBlueprint | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<AiCoreBlueprint>('/api/school/ai-core')
      .then((res) => {
        if (!active) return;
        setBlueprint(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load DT AI CORE blueprint.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="DT AI CORE"
        description="Tenant-scoped educational analytics and administrative intelligence modules prepared for future activation."
      />
      <AiCoreFoundationView blueprint={blueprint} loading={loading} error={error} />
    </div>
  );
}
