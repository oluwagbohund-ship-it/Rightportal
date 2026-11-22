import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function CBTOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiRequest<any>('/api/school/cbt/overview')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load CBT overview.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Computer-Based Testing (CBT)"
        description="Exam question bank, objective & essay testing, secure responsive runner, and Phase 3 Results Engine synchronization."
        actions={
          <div className="flex items-center gap-3">
            <Link to="/dashboard/school-admin/academics/examinations">
              <Button type="button" size="sm" variant="outline">
                Question Bank
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading CBT overview...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Question Bank</CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums">
                  {data?.counts?.questionsCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Active exam questions</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>CBT Examinations</CardDescription>
                <CardTitle className="text-3xl font-bold text-blue-600 tabular-nums">
                  {data?.counts?.examsCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Scheduled and published exams</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Student Attempts</CardDescription>
                <CardTitle className="text-3xl font-bold text-indigo-600 tabular-nums">
                  {data?.counts?.attemptsCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Completed test sittings</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Synced to Results</CardDescription>
                <CardTitle className="text-3xl font-bold text-emerald-600 tabular-nums">
                  {data?.counts?.syncedResultsCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Connected to Phase 3 CA components</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent CBT Examinations</CardTitle>
              <CardDescription>Overview of examinations created in the system.</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.recentExams?.length === 0 ? (
                <p className="text-sm text-slate-500">No CBT examinations created yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.recentExams?.map((ex: any) => (
                      <TableRow key={ex.id}>
                        <TableCell className="font-medium text-slate-900">{ex.title}</TableCell>
                        <TableCell className="text-xs">{ex.subject_name}</TableCell>
                        <TableCell className="text-xs">{ex.class_name}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{ex.duration_minutes} mins</TableCell>
                        <TableCell>
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md capitalize bg-blue-50 text-blue-700">
                            {ex.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
