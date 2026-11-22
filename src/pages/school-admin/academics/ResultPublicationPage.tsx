import React, { useCallback, useEffect, useState } from 'react';
import { FileEdit, Lock, Send } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AcademicTermRecord,
  AssessmentComponentRecord,
  ComputedResultRecord,
  ResultAmendmentRecord,
  ResultPublicationRecord,
  SchoolClassRecord,
} from '../../../types/app.ts';

export function ResultPublicationPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [components, setComponents] = useState<AssessmentComponentRecord[]>([]);
  const [publications, setPublications] = useState<ResultPublicationRecord[]>([]);
  const [subjectResults, setSubjectResults] = useState<ComputedResultRecord[]>([]);
  const [amendments, setAmendments] = useState<ResultAmendmentRecord[]>([]);

  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Authorized amendment form
  const [computedResultId, setComputedResultId] = useState('');
  const [componentId, setComponentId] = useState('');
  const [newScore, setNewScore] = useState('');
  const [newStatus, setNewStatus] = useState<'scored' | 'absent' | 'exempt'>('scored');
  const [reason, setReason] = useState('');
  const [amending, setAmending] = useState(false);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, clsRes, compRes] = await Promise.all([
        apiRequest<{ terms: AcademicTermRecord[] }>('/api/school/academics/sessions'),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
        apiRequest<{ components: AssessmentComponentRecord[] }>(
          '/api/school/academics/assessment-components',
        ),
      ]);
      const loadedTerms = sessRes.terms ?? [];
      const loadedClasses = (clsRes.classes ?? []).filter((c) => c.status === 'active');
      const loadedComponents = (compRes.components ?? []).filter((c) => c.is_active === 1);

      setTerms(loadedTerms);
      setClasses(loadedClasses);
      setComponents(loadedComponents);

      if (!termId && loadedTerms.length > 0) {
        const cur = loadedTerms.find((t) => t.is_current === 1) ?? loadedTerms[0];
        setTermId(cur.id);
      }
      if (!classId && loadedClasses.length > 0) setClassId(loadedClasses[0].id);
      if (!componentId && loadedComponents.length > 0) setComponentId(loadedComponents[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load publication console.');
    } finally {
      setLoading(false);
    }
  }, [classId, componentId, termId]);

  const loadScope = useCallback(async () => {
    if (!termId || !classId) return;
    try {
      const [resData, amData] = await Promise.all([
        apiRequest<{
          publications: ResultPublicationRecord[];
          subjectResults: ComputedResultRecord[];
        }>(`/api/school/academics/results?academicTermId=${termId}&classId=${classId}`),
        apiRequest<{ amendments: ResultAmendmentRecord[] }>(
          `/api/school/academics/results/amendments?academicTermId=${termId}`,
        ),
      ]);
      const srList = resData.subjectResults ?? [];
      setPublications(resData.publications ?? []);
      setSubjectResults(srList);
      setAmendments(amData.amendments ?? []);
      if (srList.length > 0 && !srList.some((r) => r.id === computedResultId)) {
        setComputedResultId(srList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load publication status.');
    }
  }, [classId, computedResultId, termId]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadScope();
  }, [loadScope]);

  const handlePublish = async () => {
    if (!termId || !classId) return;
    setPublishing(true);
    try {
      const res = await apiRequest<{ count: number }>('/api/school/academics/results/publish', {
        method: 'POST',
        body: JSON.stringify({
          academicTermId: termId,
          classId,
          action: 'publish',
        }),
      });
      setConfirmPublish(false);
      showToast({
        variant: 'success',
        title: 'Results officially published',
        description: `${res.count} student report card(s) are now unlocked for student & parent portals.`,
      });
      await loadScope();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Publication failed',
        description: err instanceof Error ? err.message : 'Unable to publish results.',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleAmend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!computedResultId || !componentId) return;
    setAmending(true);
    try {
      await apiRequest('/api/school/academics/results/amend', {
        method: 'POST',
        body: JSON.stringify({
          computedResultId,
          componentId,
          newScore: newStatus === 'scored' ? Number(newScore) : null,
          newStatus,
          reason,
        }),
      });
      setReason('');
      setNewScore('');
      showToast({
        variant: 'success',
        title: 'Post-publication amendment applied & audited',
        description: 'Averages, grades, and class rankings have been recomputed.',
      });
      await loadScope();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Amendment failed',
        description: err instanceof Error ? err.message : 'Unable to amend result.',
      });
    } finally {
      setAmending(false);
    }
  };

  const publishedCount = publications.filter(
    (p) => p.status === 'published' || p.status === 'amended',
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Result Publication & Authorized Amendments"
        description="Release verified class report cards to students and parents, or execute formally audited post-publication corrections."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>Class Result Publication Control</span>
          </CardTitle>
          <CardDescription>
            Students and guardians can never view draft or under-review results until explicitly published here
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pub-term">Academic Term</Label>
              <Select id="pub-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.session_name} · {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub-cls">Class</Label>
              <Select id="pub-cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              disabled={loading || publications.length === 0 || publishing}
              onClick={() => setConfirmPublish(true)}
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>Publish Class Results ({publications.length})</span>
            </Button>
          </div>

          {publications.length > 0 ? (
            <Alert variant={publishedCount === publications.length ? 'success' : 'info'}>
              {publishedCount} of {publications.length} computed student report cards in this class are currently published.
            </Alert>
          ) : (
            <Alert variant="info">
              No computed results exist for this class and term yet. Visit Results Computation first.
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileEdit className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Post-Publication Result Amendment</span>
            </CardTitle>
            <CardDescription>
              Authorized correction workflow. Automatically logs old/new values and recomputes rankings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subjectResults.length === 0 ? (
              <p className="text-sm text-slate-500">
                Compute class results before submitting an amendment.
              </p>
            ) : (
              <form onSubmit={handleAmend} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="am-res">Student &amp; Subject Result</Label>
                  <Select
                    id="am-res"
                    value={computedResultId}
                    onChange={(e) => setComputedResultId(e.target.value)}
                    required
                  >
                    {subjectResults.map((sr) => (
                      <option key={sr.id} value={sr.id}>
                        {sr.first_name} {sr.last_name} — {sr.subject_name} ({sr.percentage_score}%, {sr.grade})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="am-comp">Assessment Component to Correct</Label>
                  <Select
                    id="am-comp"
                    value={componentId}
                    onChange={(e) => setComponentId(e.target.value)}
                    required
                  >
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Max {c.max_score} · Weight {c.weight_percentage}%)
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="am-status">Corrected Status</Label>
                    <Select
                      id="am-status"
                      value={newStatus}
                      onChange={(e) =>
                        setNewStatus(e.target.value as 'scored' | 'absent' | 'exempt')
                      }
                    >
                      <option value="scored">Scored</option>
                      <option value="absent">Absent</option>
                      <option value="exempt">Exempt</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="am-score">New Raw Score</Label>
                    <Input
                      id="am-score"
                      type="number"
                      step="0.5"
                      min={0}
                      max={1000}
                      disabled={newStatus !== 'scored'}
                      value={newScore}
                      onChange={(e) => setNewScore(e.target.value)}
                      required={newStatus === 'scored'}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="am-reason">Mandatory Audit Reason (min 8 chars)</Label>
                  <Input
                    id="am-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Verified script remarking error (+4 points)"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" disabled={amending} className="w-full">
                  {amending ? 'Applying Amendment...' : 'Submit Audited Result Amendment'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Amendments Audit Ledger ({amendments.length})</CardTitle>
            <CardDescription>Immutable record of all post-publication score adjustments</CardDescription>
          </CardHeader>
          <CardContent>
            {amendments.length === 0 ? (
              <p className="text-sm text-slate-500">
                No post-publication amendments recorded for this term.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student / Subject</TableHead>
                    <TableHead>Old → New</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Officer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {amendments.map((am) => {
                    let oldVal = '—';
                    let newVal = '—';
                    try {
                      const o = JSON.parse(am.old_values_json) as { percentageScore?: number; grade?: string };
                      const n = JSON.parse(am.new_values_json) as { percentageScore?: number; grade?: string };
                      oldVal = `${o.percentageScore ?? '-'}% (${o.grade ?? '-'})`;
                      newVal = `${n.percentageScore ?? '-'}% (${n.grade ?? '-'})`;
                    } catch {
                      // fallback
                    }
                    return (
                      <TableRow key={am.id}>
                        <TableCell className="text-xs font-medium text-[#0F172A]">
                          {am.first_name} {am.last_name}
                          <br />
                          <span className="text-slate-500">{am.subject_name}</span>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {oldVal} → <strong className="text-[#1E3A8A]">{newVal}</strong>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{am.reason}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {am.amended_by_name || 'Admin'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmPublish}
        title="Publish Class Results"
        description="Publishing makes these terminal report cards visible to verified students and parents and locks teacher score sheets against casual edits. Proceed?"
        confirmLabel="Publish Results"
        busy={publishing}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={() => void handlePublish()}
      />
    </div>
  );
}
