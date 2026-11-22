import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AcademicSessionRecord } from '../../types/app.ts';

export function TeacherSessionsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AcademicSessionRecord[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{ sessions: AcademicSessionRecord[] }>('/api/school/teacher-workspace')
      .then((res) => {
        if (!active) return;
        setSessions(res.sessions);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load academic calendar.');
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
        title="Academic Calendar"
        description="Published academic sessions and active instructional terms configured by your School Administrator."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>School Academic Sessions</CardTitle>
          <CardDescription>
            Active and scheduled terms for {user?.activeSchoolName ?? 'your school'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading academic calendar...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-slate-500">
              No academic sessions configured for this school yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-semibold text-[#0F172A]">{s.name}</TableCell>
                    <TableCell className="text-xs text-slate-600">{s.term}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500 tabular-nums">
                      {s.start_date} → {s.end_date}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold text-[#1E3A8A]">
                      {s.is_current === 1 ? 'Active Term' : 'Scheduled'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
