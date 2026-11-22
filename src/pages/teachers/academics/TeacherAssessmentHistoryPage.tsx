import React, { useEffect, useState } from 'react';
import { ClipboardList, History } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AssessmentScoreHistoryRecord,
  ScoreSubmissionBatchRecord,
} from '../../../types/app.ts';

export function TeacherAssessmentHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<ScoreSubmissionBatchRecord[]>([]);
  const [history, setHistory] = useState<AssessmentScoreHistoryRecord[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ batches: ScoreSubmissionBatchRecord[] }>('/api/school/academics/score-batches'),
      apiRequest<{ history: AssessmentScoreHistoryRecord[] }>(
        '/api/school/academics/scores/history',
      ),
    ])
      .then(([bRes, hRes]) => {
        if (!active) return;
        setBatches(bRes.batches ?? []);
        setHistory(hRes.history ?? []);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load assessment history.');
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
        title="Assessment Submissions & Audit Trail"
        description="Track every submitted score batch status and inspect your complete historical score change audit log."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>Score Submission Batches ({batches.length})</span>
          </CardTitle>
          <CardDescription>Review statuses from School Administration</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading submission batches...</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-slate-500">No score submission batches recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class / Subject</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review Notes</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-semibold text-[#0F172A]">
                      {b.class_name} · {b.subject_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{b.term_name}</TableCell>
                    <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
                      {b.status.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{b.review_notes || '—'}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-slate-500">
                      {b.updated_at}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>Score Entry Audit History ({history.length})</span>
          </CardTitle>
          <CardDescription>Chronological log of scores entered and updated by your account</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading audit history...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500">No score edits logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Subject / Component</TableHead>
                  <TableHead className="tabular-nums">Score Transition</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs tabular-nums text-slate-500">
                      {h.created_at}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-[#0F172A]">
                      {h.first_name} {h.last_name}{' '}
                      <span className="font-mono text-slate-400">({h.admission_number})</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {h.subject_name} · {h.component_name}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {h.old_score ?? '—'} →{' '}
                      <strong className="text-[#1E3A8A]">
                        {h.new_score !== null ? h.new_score : h.new_status}
                      </strong>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{h.reason}</TableCell>
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
