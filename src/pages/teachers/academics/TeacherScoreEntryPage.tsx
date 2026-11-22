import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Save, Send } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AcademicTermRecord,
  AssessmentComponentRecord,
  AssessmentScoreRecord,
  ScoreEntryStatus,
  ScoreSubmissionBatchRecord,
} from '../../../types/app.ts';

interface SheetStudent {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  arm_name: string | null;
}

interface ScoreSheetResponse {
  term: AcademicTermRecord;
  components: AssessmentComponentRecord[];
  students: SheetStudent[];
  scores: AssessmentScoreRecord[];
  batch: ScoreSubmissionBatchRecord | null;
  isPublishedLocked: boolean;
}

interface CellDraft {
  score: string;
  status: ScoreEntryStatus;
}

export function TeacherScoreEntryPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<
    Array<{
      assignment_id: string;
      subject_id: string;
      subject_name: string;
      subject_code: string;
      class_id: string | null;
      class_name: string | null;
    }>
  >([]);
  const [assignedClasses, setAssignedClasses] = useState<
    Array<{ class_id: string; class_name: string }>
  >([]);

  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState(searchParams.get('classId') ?? '');
  const [subjectId, setSubjectId] = useState(searchParams.get('subjectId') ?? '');
  const [reason, setReason] = useState('');

  const [sheet, setSheet] = useState<ScoreSheetResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CellDraft>>({});
  const [saving, setSaving] = useState(false);

  const cellKey = (studentId: string, componentId: string) => `${studentId}::${componentId}`;

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ terms: AcademicTermRecord[] }>('/api/school/academics/sessions'),
      apiRequest<{
        activeTerm: AcademicTermRecord | null;
        assignedClasses: Array<{ class_id: string; class_name: string }>;
        assignedSubjects: Array<{
          assignment_id: string;
          subject_id: string;
          subject_name: string;
          subject_code: string;
          class_id: string | null;
          class_name: string | null;
        }>;
      }>('/api/school/teacher-workspace'),
    ])
      .then(([sessRes, twRes]) => {
        if (!active) return;
        const loadedTerms = sessRes.terms ?? [];
        const subs = twRes.assignedSubjects ?? [];
        const clss = twRes.assignedClasses ?? [];
        setTerms(loadedTerms);
        setAssignedSubjects(subs);

        // Build unique class choices from both subject assignments and class teacher assignments
        const classMap = new Map<string, string>();
        for (const c of clss) classMap.set(c.class_id, c.class_name);
        for (const s of subs) {
          if (s.class_id && s.class_name) classMap.set(s.class_id, s.class_name);
        }
        const uniqueClasses = Array.from(classMap.entries()).map(([id, name]) => ({
          class_id: id,
          class_name: name,
        }));
        setAssignedClasses(uniqueClasses);

        const defaultTerm = twRes.activeTerm?.id ?? loadedTerms[0]?.id ?? '';
        setTermId((prev) => prev || defaultTerm);

        if (!subjectId && subs.length > 0) {
          setSubjectId(subs[0].subject_id);
          if (!classId && subs[0].class_id) setClassId(subs[0].class_id);
        }
        if (!classId && uniqueClasses.length > 0) {
          setClassId((prev) => prev || subs[0]?.class_id || uniqueClasses[0].class_id);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load score entry workspace.');
      })
      .finally(() => {
        if (active) setLoadingSetup(false);
      });
    return () => {
      active = false;
    };
  }, [classId, subjectId]);

  const loadSheet = useCallback(async () => {
    if (!termId || !classId || !subjectId) {
      setSheet(null);
      return;
    }
    setLoadingSheet(true);
    setError(null);
    try {
      const res = await apiRequest<ScoreSheetResponse>(
        `/api/school/academics/scores/sheet?academicTermId=${termId}&classId=${classId}&subjectId=${subjectId}`,
      );
      setSheet(res);
      const nextDrafts: Record<string, CellDraft> = {};
      for (const st of res.students) {
        for (const comp of res.components) {
          const existing = res.scores.find(
            (sc) => sc.student_id === st.id && sc.component_id === comp.id,
          );
          nextDrafts[cellKey(st.id, comp.id)] = {
            score:
              existing && existing.score !== null && existing.score !== undefined
                ? String(existing.score)
                : '',
            status: existing?.status ?? 'pending',
          };
        }
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setSheet(null);
      setError(err instanceof Error ? err.message : 'Unable to load score sheet.');
    } finally {
      setLoadingSheet(false);
    }
  }, [classId, subjectId, termId]);

  useEffect(() => {
    void loadSheet();
  }, [loadSheet]);

  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string }>();
    for (const s of assignedSubjects) {
      map.set(s.subject_id, { id: s.subject_id, name: s.subject_name, code: s.subject_code });
    }
    return Array.from(map.values());
  }, [assignedSubjects]);

  const handleSave = async (submitForReview: boolean) => {
    if (!sheet || !termId || !classId || !subjectId) return;
    setSaving(true);
    try {
      const entries: Array<{
        studentId: string;
        componentId: string;
        score: number | null;
        status: ScoreEntryStatus;
      }> = [];

      for (const st of sheet.students) {
        for (const comp of sheet.components) {
          const cell = drafts[cellKey(st.id, comp.id)] ?? { score: '', status: 'pending' };
          const trimmed = cell.score.trim();
          let resolvedStatus: ScoreEntryStatus = cell.status;
          let resolvedScore: number | null = null;

          if (cell.status === 'absent' || cell.status === 'exempt') {
            resolvedScore = null;
          } else if (trimmed !== '') {
            resolvedStatus = 'scored';
            resolvedScore = Number(trimmed);
          } else {
            resolvedStatus = 'pending';
            resolvedScore = null;
          }

          entries.push({
            studentId: st.id,
            componentId: comp.id,
            score: resolvedScore,
            status: resolvedStatus,
          });
        }
      }

      const res = await apiRequest<{ savedCount: number; status: string }>(
        '/api/school/academics/scores/batch',
        {
          method: 'POST',
          body: JSON.stringify({
            academicTermId: termId,
            classId,
            subjectId,
            submitForReview,
            reason: reason.trim(),
            entries,
          }),
        },
      );
      showToast({
        variant: 'success',
        title: submitForReview ? 'Scores submitted for review' : 'Score sheet draft saved',
        description: `Saved ${res.savedCount} cell entries (batch status: ${res.status}).`,
      });
      setReason('');
      await loadSheet();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Failed to save scores',
        description: err instanceof Error ? err.message : 'Unable to save assessment batch.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessment & Exam Score Sheet"
        description="Enter student raw scores per configured assessment component. Leaving a cell blank preserves it as Pending (never auto-converts to 0)."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ts-term">Academic Term</Label>
            <Select id="ts-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.session_name} · {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-cls">Assigned Class</Label>
            <Select id="ts-cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {assignedClasses.map((c) => (
                <option key={c.class_id} value={c.class_id}>
                  {c.class_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ts-sub">Assigned Subject</Label>
            <Select id="ts-sub" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {uniqueSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {sheet?.isPublishedLocked ? (
        <Alert variant="info" title="Published Results Locked">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Results for this class and term are officially published. Any post-publication corrections must be requested through School Administration&rsquo;s Result Amendment workflow.
          </span>
        </Alert>
      ) : null}

      {sheet?.batch ? (
        <Alert variant={sheet.batch.status === 'rejected' ? 'error' : 'info'}>
          Batch Status: <strong className="uppercase">{sheet.batch.status.replace('_', ' ')}</strong>
          {sheet.batch.review_notes ? ` · Review note: ${sheet.batch.review_notes}` : ''}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Student Assessment Matrix</CardTitle>
          <CardDescription>
            {sheet
              ? `${sheet.students.length} active student(s) · ${sheet.components.length} effective assessment component(s)`
              : 'Select term, class, and subject assigned to you'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSetup || loadingSheet ? (
            <p className="text-sm text-slate-500">Loading score sheet...</p>
          ) : assignedSubjects.length === 0 ? (
            <p className="text-sm text-slate-500">
              You do not have active subject assignments yet. Contact your School Administrator.
            </p>
          ) : !sheet || sheet.students.length === 0 ? (
            <p className="text-sm text-slate-500">
              No active students are enrolled in this selected class.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[#0F172A]">
                      <th className="px-3 py-2.5 font-semibold">Admission No</th>
                      <th className="px-3 py-2.5 font-semibold">Student Name</th>
                      {sheet.components.map((comp) => (
                        <th key={comp.id} className="px-3 py-2.5 font-semibold min-w-[170px]">
                          <div>{comp.name}</div>
                          <div className="text-[11px] font-normal text-slate-500 tabular-nums">
                            Max: {comp.max_score} · Weight: {comp.weight_percentage}%
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sheet.students.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 font-mono text-slate-600">
                          {st.admission_number}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[#0F172A] whitespace-nowrap">
                          {st.first_name} {st.last_name}
                          {st.arm_name ? (
                            <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                              ({st.arm_name})
                            </span>
                          ) : null}
                        </td>
                        {sheet.components.map((comp) => {
                          const key = cellKey(st.id, comp.id);
                          const cell = drafts[key] ?? { score: '', status: 'pending' };
                          const disabledCell =
                            sheet.isPublishedLocked ||
                            cell.status === 'absent' ||
                            cell.status === 'exempt';

                          return (
                            <td key={comp.id} className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  min={0}
                                  max={comp.max_score}
                                  step="0.5"
                                  placeholder="—"
                                  aria-label={`${st.first_name} ${st.last_name} ${comp.name}`}
                                  disabled={disabledCell}
                                  className="h-8 w-20 text-right tabular-nums"
                                  value={cell.score}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [key]: {
                                        score: val,
                                        status: val.trim() === '' ? 'pending' : 'scored',
                                      },
                                    }));
                                  }}
                                />
                                <Select
                                  className="h-8 w-24 text-[11px] px-1.5"
                                  disabled={sheet.isPublishedLocked}
                                  value={cell.status}
                                  onChange={(e) => {
                                    const nextStatus = e.target.value as ScoreEntryStatus;
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [key]: {
                                        score:
                                          nextStatus === 'absent' || nextStatus === 'exempt'
                                            ? ''
                                            : cell.score,
                                        status: nextStatus,
                                      },
                                    }));
                                  }}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="scored">Scored</option>
                                  <option value="absent">Absent</option>
                                  <option value="exempt">Exempt</option>
                                </Select>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!sheet.isPublishedLocked ? (
                <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="w-full sm:max-w-sm space-y-1">
                    <Label htmlFor="ts-reason">Revision Note (optional)</Label>
                    <Input
                      id="ts-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Initial CA1 marks entered"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void handleSave(false)}
                    >
                      <Save className="h-4 w-4" aria-hidden="true" />
                      <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                    </Button>
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSave(true)}
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      <span>Submit Batch for Review</span>
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
