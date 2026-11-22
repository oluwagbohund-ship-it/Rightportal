import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Save } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { AcademicTermRecord, StudentAffectiveTraitRecord } from '../../../types/app.ts';

interface PermittedStudent {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
}

const DEFAULT_TRAITS: Array<{ traitCategory: 'affective' | 'psychomotor'; traitName: string }> = [
  { traitCategory: 'affective', traitName: 'Punctuality' },
  { traitCategory: 'affective', traitName: 'Neatness' },
  { traitCategory: 'affective', traitName: 'Politeness' },
  { traitCategory: 'psychomotor', traitName: 'Handwriting' },
  { traitCategory: 'psychomotor', traitName: 'Sports & Athletics' },
];

export function TeacherCommentsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [students, setStudents] = useState<PermittedStudent[]>([]);
  const [termId, setTermId] = useState('');
  const [studentId, setStudentId] = useState('');

  const [daysOpened, setDaysOpened] = useState('65');
  const [daysPresent, setDaysPresent] = useState('63');
  const [daysAbsent, setDaysAbsent] = useState('2');
  const [lateCount, setLateCount] = useState('0');
  const [traitRatings, setTraitRatings] = useState<Record<string, number>>({
    Punctuality: 5,
    Neatness: 4,
    Politeness: 5,
    Handwriting: 4,
    'Sports & Athletics': 4,
  });
  const [teacherComment, setTeacherComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ terms: AcademicTermRecord[] }>('/api/school/academics/sessions'),
      apiRequest<{
        activeTerm: AcademicTermRecord | null;
        permittedStudents: PermittedStudent[];
      }>('/api/school/teacher-workspace'),
    ])
      .then(([sessRes, twRes]) => {
        if (!active) return;
        const loadedTerms = sessRes.terms ?? [];
        const loadedStudents = twRes.permittedStudents ?? [];
        setTerms(loadedTerms);
        setStudents(loadedStudents);
        setTermId(twRes.activeTerm?.id ?? loadedTerms[0]?.id ?? '');
        if (loadedStudents.length > 0) setStudentId(loadedStudents[0].id);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load workspace.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadStudentExtras = useCallback(async () => {
    if (!termId || !studentId) return;
    try {
      const res = await apiRequest<{
        attendance: {
          days_opened: number;
          days_present: number;
          days_absent: number;
          late_count: number;
        } | null;
        traits: StudentAffectiveTraitRecord[];
        teacherComment: { comment: string } | null;
      }>(`/api/school/academics/report-extras?academicTermId=${termId}&studentId=${studentId}`);

      if (res.attendance) {
        setDaysOpened(String(res.attendance.days_opened));
        setDaysPresent(String(res.attendance.days_present));
        setDaysAbsent(String(res.attendance.days_absent));
        setLateCount(String(res.attendance.late_count));
      } else {
        setDaysOpened('65');
        setDaysPresent('63');
        setDaysAbsent('2');
        setLateCount('0');
      }

      if (res.traits && res.traits.length > 0) {
        const next: Record<string, number> = { ...traitRatings };
        for (const t of res.traits) {
          next[t.trait_name] = t.rating;
        }
        setTraitRatings(next);
      }

      setTeacherComment(res.teacherComment?.comment ?? '');
    } catch {
      // keep form ready
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, termId]);

  useEffect(() => {
    void loadStudentExtras();
  }, [loadStudentExtras]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termId || !studentId) return;
    setSaving(true);
    try {
      await apiRequest('/api/school/academics/report-extras', {
        method: 'POST',
        body: JSON.stringify({
          academicTermId: termId,
          studentId,
          attendance: {
            daysOpened: Number(daysOpened),
            daysPresent: Number(daysPresent),
            daysAbsent: Number(daysAbsent),
            lateCount: Number(lateCount),
          },
          traits: DEFAULT_TRAITS.map((t) => ({
            traitCategory: t.traitCategory,
            traitName: t.traitName,
            rating: traitRatings[t.traitName] ?? 4,
          })),
          teacherComment,
        }),
      });
      showToast({ variant: 'success', title: 'Attendance, traits & teacher comment saved' });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to save report remarks.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance, Behavioral Traits & Teacher Comments"
        description="Record terminal attendance summaries, affective/psychomotor ratings (1–5), and Class Teacher report card comments for your assigned students."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>Student Term Evaluation</span>
          </CardTitle>
          <CardDescription>Select academic term and student inside your assigned classes</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading assigned students...</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-slate-500">
              No students are currently in classes assigned to you.
            </p>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tc-term">Academic Term</Label>
                  <Select id="tc-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.session_name} · {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tc-stu">Permitted Student</Label>
                  <Select
                    id="tc-stu"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  >
                    {students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.admission_number} · {st.first_name} {st.last_name} ({st.class_name})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="att-open">School Days Opened</Label>
                  <Input
                    id="att-open"
                    type="number"
                    min={0}
                    max={365}
                    value={daysOpened}
                    onChange={(e) => setDaysOpened(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="att-pres">Days Present</Label>
                  <Input
                    id="att-pres"
                    type="number"
                    min={0}
                    max={365}
                    value={daysPresent}
                    onChange={(e) => setDaysPresent(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="att-abs">Days Absent</Label>
                  <Input
                    id="att-abs"
                    type="number"
                    min={0}
                    max={365}
                    value={daysAbsent}
                    onChange={(e) => setDaysAbsent(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="att-late">Late Arrivals</Label>
                  <Input
                    id="att-late"
                    type="number"
                    min={0}
                    max={365}
                    value={lateCount}
                    onChange={(e) => setLateCount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Affective &amp; Psychomotor Trait Ratings (Scale 1–5)</Label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {DEFAULT_TRAITS.map((t) => (
                    <div key={t.traitName} className="space-y-1 rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-[#0F172A]">{t.traitName}</p>
                      <p className="text-[11px] capitalize text-slate-500">{t.traitCategory}</p>
                      <Select
                        className="h-8 text-xs mt-1"
                        value={String(traitRatings[t.traitName] ?? 4)}
                        onChange={(e) =>
                          setTraitRatings((prev) => ({
                            ...prev,
                            [t.traitName]: Number(e.target.value),
                          }))
                        }
                      >
                        <option value="5">5 — Excellent</option>
                        <option value="4">4 — Very Good</option>
                        <option value="3">3 — Satisfactory</option>
                        <option value="2">2 — Fair</option>
                        <option value="1">1 — Needs Support</option>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tc-comment">Class Teacher&rsquo;s Report Card Comment</Label>
                <Input
                  id="tc-comment"
                  value={teacherComment}
                  onChange={(e) => setTeacherComment(e.target.value)}
                  placeholder="Demonstrates steady analytical growth and strong classroom leadership."
                  required
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  <Save className="h-4 w-4" aria-hidden="true" />
                  <span>{saving ? 'Saving Evaluation...' : 'Save Report Remarks & Attendance'}</span>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
