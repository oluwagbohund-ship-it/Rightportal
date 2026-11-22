import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileText, History } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AcademicTermRecord,
  AssessmentScoreHistoryRecord,
  ReportCardTemplateRecord,
  SchoolClassRecord,
  ScoreSubmissionBatchRecord,
  StudentRecord,
} from '../../../types/app.ts';

export function ResultReviewPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [batches, setBatches] = useState<ScoreSubmissionBatchRecord[]>([]);
  const [scoreHistory, setScoreHistory] = useState<AssessmentScoreHistoryRecord[]>([]);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [template, setTemplate] = useState<ReportCardTemplateRecord | null>(null);

  // Class result review workflow
  const [reviewTermId, setReviewTermId] = useState('');
  const [reviewClassId, setReviewClassId] = useState('');
  const [updatingClassStatus, setUpdatingClassStatus] = useState(false);

  // Principal comment form
  const [commentStudentId, setCommentStudentId] = useState('');
  const [principalComment, setPrincipalComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [reviewingBatchId, setReviewingBatchId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchRes, histRes, sessRes, clsRes, stuRes, tplRes] = await Promise.all([
        apiRequest<{ batches: ScoreSubmissionBatchRecord[] }>('/api/school/academics/score-batches'),
        apiRequest<{ history: AssessmentScoreHistoryRecord[] }>(
          '/api/school/academics/scores/history',
        ),
        apiRequest<{ terms: AcademicTermRecord[] }>('/api/school/academics/sessions'),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
        apiRequest<{ students: StudentRecord[] }>('/api/school/students?limit=200&status=active'),
        apiRequest<{ template: ReportCardTemplateRecord }>(
          '/api/school/academics/report-card-template',
        ),
      ]);
      setBatches(batchRes.batches ?? []);
      setScoreHistory(histRes.history ?? []);
      const loadedTerms = sessRes.terms ?? [];
      const loadedClasses = (clsRes.classes ?? []).filter((c) => c.status === 'active');
      const loadedStudents = stuRes.students ?? [];

      setTerms(loadedTerms);
      setClasses(loadedClasses);
      setStudents(loadedStudents);
      setTemplate(tplRes.template ?? null);

      if (!reviewTermId && loadedTerms.length > 0) {
        const cur = loadedTerms.find((t) => t.is_current === 1) ?? loadedTerms[0];
        setReviewTermId(cur.id);
      }
      if (!reviewClassId && loadedClasses.length > 0) {
        setReviewClassId(loadedClasses[0].id);
      }
      if (!commentStudentId && loadedStudents.length > 0) {
        setCommentStudentId(loadedStudents[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load result review workspace.');
    } finally {
      setLoading(false);
    }
  }, [commentStudentId, reviewClassId, reviewTermId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleBatchDecision = async (
    batchId: string,
    decision: 'under_review' | 'approved' | 'rejected',
  ) => {
    setReviewingBatchId(batchId);
    try {
      await apiRequest(`/api/school/academics/score-batches/${batchId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          reviewNotes: `Reviewed by School Admin (${decision})`,
        }),
      });
      showToast({ variant: 'success', title: `Batch marked ${decision.replace('_', ' ')}` });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Batch review failed',
        description: err instanceof Error ? err.message : 'Unable to update batch.',
      });
    } finally {
      setReviewingBatchId(null);
    }
  };

  const handleClassResultStage = async (action: 'mark_under_review' | 'approve') => {
    if (!reviewTermId || !reviewClassId) return;
    setUpdatingClassStatus(true);
    try {
      await apiRequest('/api/school/academics/results/publish', {
        method: 'POST',
        body: JSON.stringify({
          academicTermId: reviewTermId,
          classId: reviewClassId,
          action,
        }),
      });
      showToast({
        variant: 'success',
        title:
          action === 'approve'
            ? 'Class results approved and ready for publication'
            : 'Class results placed under review',
      });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Stage update failed',
        description: err instanceof Error ? err.message : 'Compute results first.',
      });
    } finally {
      setUpdatingClassStatus(false);
    }
  };

  const handleSavePrincipalComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTermId || !commentStudentId) return;
    setSavingComment(true);
    try {
      await apiRequest('/api/school/academics/report-extras', {
        method: 'POST',
        body: JSON.stringify({
          academicTermId: reviewTermId,
          studentId: commentStudentId,
          principalComment,
        }),
      });
      showToast({ variant: 'success', title: 'Principal comment recorded on report card' });
      setPrincipalComment('');
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to save Principal remark.',
      });
    } finally {
      setSavingComment(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;
    setSavingTemplate(true);
    try {
      await apiRequest('/api/school/academics/report-card-template', {
        method: 'PUT',
        body: JSON.stringify({
          name: template.name,
          headerSubtitle: template.header_subtitle,
          showPosition: template.show_position === 1,
          showClassAverage: template.show_class_average === 1,
          showAttendance: template.show_attendance === 1,
          showAffectiveTraits: template.show_affective_traits === 1,
          showGradingScale: template.show_grading_scale === 1,
          principalTitle: template.principal_title,
          footerNote: template.footer_note,
        }),
      });
      showToast({ variant: 'success', title: 'Report card template configuration saved' });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to update template.',
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Result Review, Teacher Batches & Report Card Settings"
        description="Verify teacher score submission batches, inspect score audit history, approve computed class results, set Principal comments, and configure institutional report card templates."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {/* Teacher Score Batches Verification Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>Teacher Score Submission Queue ({batches.length})</span>
          </CardTitle>
          <CardDescription>Approve or return submitted subject assessment sheets before computation</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading submission batches...</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-slate-500">No teacher score batches submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class / Subject</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-semibold text-[#0F172A]">
                      {b.class_name} · {b.subject_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{b.term_name}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {b.submitted_by_name || 'Faculty'}
                    </TableCell>
                    <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
                      {b.status.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-right">
                      {b.status === 'published' ? (
                        <span className="text-xs text-slate-400">Locked (Published)</span>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            disabled={reviewingBatchId === b.id}
                            onClick={() => void handleBatchDecision(b.id, 'approved')}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={reviewingBatchId === b.id}
                            onClick={() => void handleBatchDecision(b.id, 'rejected')}
                            className="text-red-600 hover:bg-red-50"
                          >
                            Return
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Approve Class Results + Principal Remark */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Class Result Review Sign-Off</span>
            </CardTitle>
            <CardDescription>Transition computed class results through Under Review → Approved</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rv-term">Term</Label>
                <Select
                  id="rv-term"
                  value={reviewTermId}
                  onChange={(e) => setReviewTermId(e.target.value)}
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.session_name} · {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rv-cls">Class</Label>
                <Select
                  id="rv-cls"
                  value={reviewClassId}
                  onChange={(e) => setReviewClassId(e.target.value)}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={updatingClassStatus}
                onClick={() => void handleClassResultStage('mark_under_review')}
              >
                Mark Under Review
              </Button>
              <Button
                type="button"
                disabled={updatingClassStatus}
                onClick={() => void handleClassResultStage('approve')}
              >
                Approve Computed Class Results
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Principal / Head of School Report Comment</CardTitle>
            <CardDescription>Record official Principal remark on a student&rsquo;s term report card</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePrincipalComment} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pc-stu">Student</Label>
                <Select
                  id="pc-stu"
                  value={commentStudentId}
                  onChange={(e) => setCommentStudentId(e.target.value)}
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.admission_number} · {s.first_name} {s.last_name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-txt">Principal&rsquo;s Remark</Label>
                <Input
                  id="pc-txt"
                  value={principalComment}
                  onChange={(e) => setPrincipalComment(e.target.value)}
                  placeholder="Exemplary academic focus. Promoted with distinction."
                  required
                />
              </div>
              <Button type="submit" disabled={savingComment || !commentStudentId}>
                {savingComment ? 'Saving Remark...' : 'Save Principal Comment'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Report Card Template Configuration */}
      {template ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Report Card Layout &amp; Template Policy</span>
            </CardTitle>
            <CardDescription>Customize headings, visibility toggles, and official signature title across all report cards</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveTemplate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-sub">Header Subtitle</Label>
                <Input
                  id="tpl-sub"
                  value={template.header_subtitle}
                  onChange={(e) => setTemplate({ ...template, header_subtitle: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-prin">Head Signatory Title</Label>
                <Input
                  id="tpl-prin"
                  value={template.principal_title}
                  onChange={(e) => setTemplate({ ...template, principal_title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-foot">Footer Note</Label>
                <Input
                  id="tpl-foot"
                  value={template.footer_note}
                  onChange={(e) => setTemplate({ ...template, footer_note: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-5 text-xs text-slate-700 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={template.show_position === 1}
                    onChange={(e) =>
                      setTemplate({ ...template, show_position: e.target.checked ? 1 : 0 })
                    }
                  />
                  <span>Show Class &amp; Subject Positions</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={template.show_class_average === 1}
                    onChange={(e) =>
                      setTemplate({ ...template, show_class_average: e.target.checked ? 1 : 0 })
                    }
                  />
                  <span>Show Subject Class Average</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={template.show_attendance === 1}
                    onChange={(e) =>
                      setTemplate({ ...template, show_attendance: e.target.checked ? 1 : 0 })
                    }
                  />
                  <span>Show Term Attendance</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={template.show_affective_traits === 1}
                    onChange={(e) =>
                      setTemplate({ ...template, show_affective_traits: e.target.checked ? 1 : 0 })
                    }
                  />
                  <span>Show Affective &amp; Psychomotor Traits</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={template.show_grading_scale === 1}
                    onChange={(e) =>
                      setTemplate({ ...template, show_grading_scale: e.target.checked ? 1 : 0 })
                    }
                  />
                  <span>Show Grading Key</span>
                </label>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                <Button type="submit" disabled={savingTemplate}>
                  {savingTemplate ? 'Saving Template...' : 'Save Report Card Template'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Assessment Score Edit Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>Score Edit Audit Trail ({scoreHistory.length})</span>
          </CardTitle>
          <CardDescription>Immutable log of assessment score entries and revisions</CardDescription>
        </CardHeader>
        <CardContent>
          {scoreHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No score edits recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Subject / Component</TableHead>
                  <TableHead className="tabular-nums">Change</TableHead>
                  <TableHead>Actor &amp; Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoreHistory.slice(0, 25).map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs tabular-nums text-slate-500">
                      {h.created_at}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-[#0F172A]">
                      {h.first_name} {h.last_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {h.subject_name} · {h.component_name}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {h.old_score ?? '—'} → <strong>{h.new_score ?? h.new_status}</strong>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {h.actor_name || 'User'} · {h.reason}
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
