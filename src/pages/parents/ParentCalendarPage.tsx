import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AcademicSessionRecord } from '../../types/app.ts';

export function ParentCalendarPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AcademicSessionRecord | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ activeSession: AcademicSessionRecord | null }>('/api/school/parent-workspace')
      .then((res) => {
        if (!active) return;
        setActiveSession(res.activeSession);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load school calendar.');
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
        title="Term Calendar"
        description="Official academic term schedule published by your institution."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>School Academic Calendar</CardTitle>
          <CardDescription>
            Published term information for {user?.activeSchoolName ?? 'your institution'}.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          {loading ? (
            <p className="text-slate-500">Loading academic calendar...</p>
          ) : activeSession ? (
            <div className="space-y-2">
              <p>
                <span className="font-semibold text-[#0F172A]">Active Session:</span>{' '}
                {activeSession.name} ({activeSession.term})
              </p>
              <p className="font-mono text-xs tabular-nums text-slate-500">
                {activeSession.start_date} → {activeSession.end_date}
              </p>
            </div>
          ) : (
            <p>No active academic term published by your school yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
