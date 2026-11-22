import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AcademicSessionRecord } from '../../types/app.ts';

export function StudentTermPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AcademicSessionRecord | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ activeSession: AcademicSessionRecord | null }>('/api/school/student-workspace')
      .then((res) => {
        if (!active) return;
        setActiveSession(res.activeSession);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load current term schedule.');
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
        title="Current Term"
        description="Active academic session schedule published by your School Administrator."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Current Academic Term Schedule</CardTitle>
          <CardDescription>
            Official academic term dates for {user?.activeSchoolName ?? 'your school'}.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          {loading ? (
            <p className="text-slate-500">Loading active academic term...</p>
          ) : activeSession ? (
            <div className="space-y-2.5">
              <p>
                <span className="font-semibold text-[#0F172A]">Session:</span>{' '}
                {activeSession.name}
              </p>
              <p>
                <span className="font-semibold text-[#0F172A]">Term:</span> {activeSession.term}
              </p>
              <p>
                <span className="font-semibold text-[#0F172A]">Schedule Window:</span>{' '}
                <span className="font-mono text-xs tabular-nums">
                  {activeSession.start_date} to {activeSession.end_date}
                </span>
              </p>
            </div>
          ) : (
            <p>No active term is currently published for your school.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
