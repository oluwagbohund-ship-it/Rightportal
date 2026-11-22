import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookPlus, CheckSquare } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  AcademicTermRecord,
  ExtendedAcademicSessionRecord,
  SchoolClassRecord,
  StudentRecord,
  StudentSubjectEnrollmentRecord,
  SubjectRecord,
} from '../../../types/app.ts';

export function SubjectEnrollmentPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ExtendedAcademicSessionRecord[]>([]);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [enrollments, setEnrollments] = useState<StudentSubjectEnrollmentRecord[]>([]);

  const [sessionId, setSessionId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [isCompulsory, setIsCompulsory] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, clsRes, subRes, stuRes] = await Promise.all([
        apiRequest<{ sessions: ExtendedAcademicSessionRecord[]; terms: AcademicTermRecord[] }>(
          '/api/school/academics/sessions',
        ),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
        apiRequest<{ subjects: SubjectRecord[] }>('/api/school/subjects'),
        apiRequest<{ students: StudentRecord[] }>('/api/school/students?limit=200&status=active'),
      ]);
      const loadedSessions = sessRes.sessions ?? [];
      const loadedTerms = sessRes.terms ?? [];
      const loadedClasses = (clsRes.classes ?? []).filter((c) => c.status === 'active');
      const loadedSubjects = (subRes.subjects ?? []).filter((s) => s.status === 'active');
      setSessions(loadedSessions);
      setTerms(loadedTerms);
      setClasses(loadedClasses);
      setSubjects(loadedSubjects);
      setStudents(stuRes.students ?? []);

      if (!sessionId && loadedSessions.length > 0) {
        const current = loadedSessions.find((s) => s.is_current === 1) ?? loadedSessions[0];
        setSessionId(current.id);
      }
      if (!classId && loadedClasses.length > 0) {
        setClassId(loadedClasses[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load subject enrollment setup.');
    } finally {
      setLoading(false);
    }
  }, [classId, sessionId]);

  const loadEnrollments = useCallback(async () => {
    if (!sessionId && !classId) return;
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (classId) params.set('classId', classId);
      const res = await apiRequest<{ enrollments: StudentSubjectEnrollmentRecord[] }>(
        `/api/school/academics/enrollments?${params.toString()}`,
      );
      setEnrollments(res.enrollments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load enrollment roster.');
    }
  }, [classId, sessionId]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadEnrollments();
  }, [loadEnrollments]);

  const classStudents = useMemo(
    () => students.filter((s) => !classId || s.current_class_id === classId),
    [classId, students],
  );

  const sessionTerms = useMemo(
    () => terms.filter((t) => !sessionId || t.academic_session_id === sessionId),
    [sessionId, terms],
  );

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleBulkEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !classId || selectedStudentIds.length === 0 || selectedSubjectIds.length === 0) {
      showToast({
        variant: 'error',
        title: 'Incomplete selection',
        description: 'Select session, class, at least one student, and at least one subject.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        createdCount: number;
        reactivatedCount: number;
        skippedCount: number;
      }>('/api/school/academics/enrollments/bulk', {
        method: 'POST',
        body: JSON.stringify({
          academicSessionId: sessionId,
          academicTermId: termId || null,
          classId,
          studentIds: selectedStudentIds,
          subjectIds: selectedSubjectIds,
          isCompulsory,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Subject enrollment saved',
        description: `Added ${res.createdCount}, reactivated ${res.reactivatedCount}, skipped ${res.skippedCount} duplicate(s).`,
      });
      await loadEnrollments();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Enrollment failed',
        description: err instanceof Error ? err.message : 'Unable to save enrollments.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    enrollmentId: string,
    status: 'active' | 'dropped' | 'completed',
  ) => {
    setUpdatingId(enrollmentId);
    try {
      await apiRequest(`/api/school/academics/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast({ variant: 'success', title: `Enrollment marked ${status}` });
      await loadEnrollments();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update enrollment.',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Subject Enrollment"
        description="Assign compulsory and elective curriculum subjects to students per academic session, term, and class."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookPlus className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
            <span>Bulk Subject Assignment</span>
          </CardTitle>
          <CardDescription>
            Filter by class, pick one or multiple students and subjects, then enroll them together
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBulkEnroll} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="enr-sess">Academic Session</Label>
                <Select
                  id="enr-sess"
                  value={sessionId}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                    setTermId('');
                  }}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enr-term">Academic Term (optional)</Label>
                <Select id="enr-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
                  <option value="">Full Academic Session</option>
                  {sessionTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enr-cls">Target Class</Label>
                <Select
                  id="enr-cls"
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setSelectedStudentIds([]);
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0F172A]">
                    1. Select Students ({selectedStudentIds.length}/{classStudents.length})
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                    onClick={() =>
                      setSelectedStudentIds(
                        selectedStudentIds.length === classStudents.length
                          ? []
                          : classStudents.map((s) => s.id),
                      )
                    }
                  >
                    {selectedStudentIds.length === classStudents.length
                      ? 'Clear All'
                      : 'Select All'}
                  </button>
                </div>
                {loading ? (
                  <p className="text-xs text-slate-500">Loading students...</p>
                ) : classStudents.length === 0 ? (
                  <p className="text-xs text-slate-500">No active students assigned to this class.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {classStudents.map((st) => (
                      <label
                        key={st.id}
                        className="flex items-center gap-2.5 rounded border border-slate-100 px-2.5 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(st.id)}
                          onChange={() => toggleStudent(st.id)}
                        />
                        <span className="font-mono text-slate-500">{st.admission_number}</span>
                        <span className="font-medium text-[#0F172A]">
                          {st.first_name} {st.last_name}
                        </span>
                        {st.arm_name ? (
                          <span className="ml-auto text-slate-500">{st.arm_name}</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0F172A]">
                    2. Select Subjects ({selectedSubjectIds.length}/{subjects.length})
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                    onClick={() =>
                      setSelectedSubjectIds(
                        selectedSubjectIds.length === subjects.length
                          ? []
                          : subjects.map((s) => s.id),
                      )
                    }
                  >
                    {selectedSubjectIds.length === subjects.length ? 'Clear All' : 'Select All'}
                  </button>
                </div>
                {subjects.length === 0 ? (
                  <p className="text-xs text-slate-500">No active curriculum subjects found.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {subjects.map((sub) => (
                      <label
                        key={sub.id}
                        className="flex items-center gap-2.5 rounded border border-slate-100 px-2.5 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSubjectIds.includes(sub.id)}
                          onChange={() => toggleSubject(sub.id)}
                        />
                        <span className="font-mono text-slate-500">{sub.code}</span>
                        <span className="font-medium text-[#0F172A]">{sub.name}</span>
                        <span className="ml-auto text-slate-500">{sub.category}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCompulsory}
                  onChange={(e) => setIsCompulsory(e.target.checked)}
                />
                <span>Mark selected subjects as compulsory for these students</span>
              </label>
              <Button type="submit" disabled={submitting}>
                <CheckSquare className="h-4 w-4" aria-hidden="true" />
                <span>{submitting ? 'Enrolling Students...' : 'Enroll Selected Subjects'}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrolled Subject Roster ({enrollments.length})</CardTitle>
          <CardDescription>
            Filtered by active session &amp; class selection; drop or reactivate individual subject enrollments anytime
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enrollments.length === 0 ? (
            <p className="text-sm text-slate-500">
              No student subject enrollments recorded for this session and class yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enr) => (
                  <TableRow key={enr.id}>
                    <TableCell className="font-mono text-xs">{enr.admission_number}</TableCell>
                    <TableCell className="font-medium text-[#0F172A]">
                      {enr.first_name} {enr.last_name}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-semibold text-[#0F172A]">{enr.subject_name}</span>{' '}
                      <span className="font-mono text-slate-400">({enr.subject_code})</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {enr.term_name || enr.session_name} ·{' '}
                      {enr.is_compulsory === 1 ? 'Compulsory' : 'Elective'}
                    </TableCell>
                    <TableCell className="text-xs font-semibold uppercase text-[#1E3A8A]">
                      {enr.status}
                    </TableCell>
                    <TableCell className="text-right">
                      {enr.status === 'active' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={updatingId === enr.id}
                          onClick={() => void handleStatusChange(enr.id, 'dropped')}
                        >
                          Drop
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={updatingId === enr.id}
                          onClick={() => void handleStatusChange(enr.id, 'active')}
                        >
                          Reactivate
                        </Button>
                      )}
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
