import React, { useCallback, useEffect, useState } from 'react';
import { Award, CalendarClock } from 'lucide-react';
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
  ExaminationRecord,
  ExaminationScheduleRecord,
  ExaminationScoreRecord,
  SchoolClassRecord,
  StudentRecord,
  SubjectRecord,
  TeacherRecord,
} from '../../../types/app.ts';

export function ExaminationManagementPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [examinations, setExaminations] = useState<ExaminationRecord[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [schedules, setSchedules] = useState<ExaminationScheduleRecord[]>([]);
  const [examScores, setExamScores] = useState<ExaminationScoreRecord[]>([]);
  const [classStudents, setClassStudents] = useState<StudentRecord[]>([]);

  // Create exam form
  const [termId, setTermId] = useState('');
  const [title, setTitle] = useState('');
  const [examType, setExamType] = useState('Terminal Examination');
  const [startDate, setStartDate] = useState('2026-12-01');
  const [endDate, setEndDate] = useState('2026-12-11');
  const [maxScore, setMaxScore] = useState('60');
  const [creatingExam, setCreatingExam] = useState(false);

  // Schedule form
  const [schedClassId, setSchedClassId] = useState('');
  const [schedSubjectId, setSchedSubjectId] = useState('');
  const [schedDate, setSchedDate] = useState('2026-12-02');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDuration, setSchedDuration] = useState('90');
  const [schedVenue, setSchedVenue] = useState('Main Examination Hall');
  const [schedInvigilatorId, setSchedInvigilatorId] = useState('');
  const [addingSchedule, setAddingSchedule] = useState(false);

  // Quick score entry for selected schedule/subject
  const [scoreClassId, setScoreClassId] = useState('');
  const [scoreSubjectId, setScoreSubjectId] = useState('');
  const [scoreDrafts, setScoreDrafts] = useState<
    Record<string, { score: string; status: ExaminationScoreRecord['status'] }>
  >({});
  const [savingScores, setSavingScores] = useState(false);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, clsRes, subRes, tRes, exRes] = await Promise.all([
        apiRequest<{ terms: AcademicTermRecord[] }>('/api/school/academics/sessions'),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
        apiRequest<{ subjects: SubjectRecord[] }>('/api/school/subjects'),
        apiRequest<{ teachers: TeacherRecord[] }>('/api/school/teachers?limit=100'),
        apiRequest<{ examinations: ExaminationRecord[] }>('/api/school/academics/examinations'),
      ]);
      const loadedTerms = sessRes.terms ?? [];
      const loadedClasses = (clsRes.classes ?? []).filter((c) => c.status === 'active');
      const loadedSubjects = (subRes.subjects ?? []).filter((s) => s.status === 'active');
      const loadedExams = exRes.examinations ?? [];

      setTerms(loadedTerms);
      setClasses(loadedClasses);
      setSubjects(loadedSubjects);
      setTeachers(tRes.teachers ?? []);
      setExaminations(loadedExams);

      if (!termId && loadedTerms.length > 0) {
        const cur = loadedTerms.find((t) => t.is_current === 1) ?? loadedTerms[0];
        setTermId(cur.id);
      }
      if (!schedClassId && loadedClasses.length > 0) {
        setSchedClassId(loadedClasses[0].id);
        setScoreClassId(loadedClasses[0].id);
      }
      if (!schedSubjectId && loadedSubjects.length > 0) {
        setSchedSubjectId(loadedSubjects[0].id);
        setScoreSubjectId(loadedSubjects[0].id);
      }
      if (!selectedExamId && loadedExams.length > 0) {
        setSelectedExamId(loadedExams[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load examination console.');
    } finally {
      setLoading(false);
    }
  }, [schedClassId, schedSubjectId, selectedExamId, termId]);

  const loadExamDetails = useCallback(async () => {
    if (!selectedExamId) {
      setSchedules([]);
      setExamScores([]);
      return;
    }
    try {
      const res = await apiRequest<{
        schedules: ExaminationScheduleRecord[];
        scores: ExaminationScoreRecord[];
      }>(`/api/school/academics/examinations/${selectedExamId}/schedules`);
      setSchedules(res.schedules ?? []);
      setExamScores(res.scores ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load examination timetable.');
    }
  }, [selectedExamId]);

  const loadScoreStudents = useCallback(async () => {
    if (!scoreClassId) {
      setClassStudents([]);
      return;
    }
    try {
      const res = await apiRequest<{ students: StudentRecord[] }>(
        `/api/school/students?classId=${scoreClassId}&status=active&limit=100`,
      );
      const list = res.students ?? [];
      setClassStudents(list);
      const next: Record<string, { score: string; status: ExaminationScoreRecord['status'] }> = {};
      for (const st of list) {
        const existing = examScores.find(
          (es) => es.student_id === st.id && es.subject_id === scoreSubjectId,
        );
        next[st.id] = {
          score: existing?.score !== null && existing?.score !== undefined ? String(existing.score) : '',
          status: existing?.status ?? 'present',
        };
      }
      setScoreDrafts(next);
    } catch {
      // keep existing
    }
  }, [examScores, scoreClassId, scoreSubjectId]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadExamDetails();
  }, [loadExamDetails]);

  useEffect(() => {
    void loadScoreStudents();
  }, [loadScoreStudents]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingExam(true);
    try {
      const res = await apiRequest<{ examination: ExaminationRecord }>(
        '/api/school/academics/examinations',
        {
          method: 'POST',
          body: JSON.stringify({
            academicTermId: termId,
            title,
            examType,
            startDate,
            endDate,
            maxScore: Number(maxScore),
            status: 'scheduled',
          }),
        },
      );
      setTitle('');
      setSelectedExamId(res.examination.id);
      showToast({ variant: 'success', title: 'Examination created & scheduled' });
      await loadSetup();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Creation failed',
        description: err instanceof Error ? err.message : 'Unable to create examination.',
      });
    } finally {
      setCreatingExam(false);
    }
  };

  const handleStatusChange = async (examId: string, status: ExaminationRecord['status']) => {
    try {
      await apiRequest(`/api/school/academics/examinations/${examId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast({ variant: 'success', title: `Examination status set to ${status}` });
      await loadSetup();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to change status.',
      });
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId) return;
    setAddingSchedule(true);
    try {
      await apiRequest(`/api/school/academics/examinations/${selectedExamId}/schedules`, {
        method: 'POST',
        body: JSON.stringify({
          classId: schedClassId,
          subjectId: schedSubjectId,
          examDate: schedDate,
          startTime: schedTime,
          durationMinutes: Number(schedDuration),
          venue: schedVenue,
          maxScore: Number(maxScore),
          invigilatorTeacherId: schedInvigilatorId || null,
        }),
      });
      showToast({ variant: 'success', title: 'Subject schedule added to timetable' });
      await loadExamDetails();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Schedule failed',
        description: err instanceof Error ? err.message : 'Unable to add exam schedule.',
      });
    } finally {
      setAddingSchedule(false);
    }
  };

  const handleSaveExamScores = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId || !scoreSubjectId || classStudents.length === 0) return;
    setSavingScores(true);
    try {
      await apiRequest(`/api/school/academics/examinations/${selectedExamId}/scores`, {
        method: 'POST',
        body: JSON.stringify({
          subjectId: scoreSubjectId,
          entries: classStudents.map((st) => {
            const draft = scoreDrafts[st.id] ?? { score: '', status: 'pending' };
            return {
              studentId: st.id,
              status: draft.status,
              score:
                draft.status === 'absent' || draft.score.trim() === ''
                  ? null
                  : Number(draft.score),
            };
          }),
        }),
      });
      showToast({ variant: 'success', title: 'Examination scores recorded' });
      await loadExamDetails();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Score save failed',
        description: err instanceof Error ? err.message : 'Unable to save examination scores.',
      });
    } finally {
      setSavingScores(false);
    }
  };

  const selectedExam = examinations.find((ex) => ex.id === selectedExamId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examination Management & Schedules"
        description="Organize terminal examinations, assign venues and invigilators, track CBT-ready timetables, and record exam participation scores."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>School Examinations ({examinations.length})</span>
            </CardTitle>
            <CardDescription>Select an examination to configure timetables and record scripts</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading examinations...</p>
            ) : examinations.length === 0 ? (
              <p className="text-sm text-slate-500">No examinations created yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Term &amp; Dates</TableHead>
                    <TableHead className="text-right tabular-nums">Max</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examinations.map((ex) => (
                    <TableRow
                      key={ex.id}
                      className={selectedExamId === ex.id ? 'bg-slate-50' : undefined}
                    >
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setSelectedExamId(ex.id)}
                          className="text-left font-semibold text-[#1E3A8A] hover:underline"
                        >
                          {ex.title}
                        </button>
                        <p className="text-xs text-slate-500">
                          {ex.exam_type} · {ex.schedules_count ?? 0} subject(s)
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 tabular-nums">
                        {ex.term_name}
                        <br />
                        {ex.start_date} → {ex.end_date}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ex.max_score}</TableCell>
                      <TableCell className="text-xs font-semibold uppercase text-[#0F172A]">
                        {ex.status.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Select
                          className="h-8 text-xs w-32 ml-auto"
                          value={ex.status}
                          onChange={(e) =>
                            void handleStatusChange(
                              ex.id,
                              e.target.value as ExaminationRecord['status'],
                            )
                          }
                        >
                          <option value="draft">Draft</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="under_review">Under Review</option>
                          <option value="published">Published</option>
                        </Select>
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
            <CardTitle>Create Examination</CardTitle>
            <CardDescription>Open an examination cycle inside a term</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateExam} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="ex-term">Academic Term</Label>
                <Select
                  id="ex-term"
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                  required
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.session_name} · {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-title">Examination Title</Label>
                <Input
                  id="ex-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="First Term Terminal Examination"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ex-type">Exam Type</Label>
                  <Input
                    id="ex-type"
                    value={examType}
                    onChange={(e) => setExamType(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-max">Max Score</Label>
                  <Input
                    id="ex-max"
                    type="number"
                    min={1}
                    max={1000}
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ex-start">Start Date</Label>
                  <Input
                    id="ex-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-end">End Date</Label>
                  <Input
                    id="ex-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={creatingExam || !termId} className="w-full">
                {creatingExam ? 'Creating...' : 'Create Examination'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {selectedExam ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                <span>Timetable — {selectedExam.title}</span>
              </CardTitle>
              <CardDescription>Subject exam sittings, hall venues &amp; assigned invigilators</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={handleAddSchedule} className="grid gap-3 sm:grid-cols-2 border-b border-slate-200 pb-5">
                <div className="space-y-1">
                  <Label htmlFor="sc-cls">Class</Label>
                  <Select
                    id="sc-cls"
                    value={schedClassId}
                    onChange={(e) => setSchedClassId(e.target.value)}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sc-sub">Subject</Label>
                  <Select
                    id="sc-sub"
                    value={schedSubjectId}
                    onChange={(e) => setSchedSubjectId(e.target.value)}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sc-date">Date</Label>
                  <Input
                    id="sc-date"
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="sc-time">Time</Label>
                    <Input
                      id="sc-time"
                      type="time"
                      value={schedTime}
                      onChange={(e) => setSchedTime(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sc-dur">Min</Label>
                    <Input
                      id="sc-dur"
                      type="number"
                      min={15}
                      value={schedDuration}
                      onChange={(e) => setSchedDuration(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sc-ven">Venue</Label>
                  <Input
                    id="sc-ven"
                    value={schedVenue}
                    onChange={(e) => setSchedVenue(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sc-inv">Invigilator</Label>
                  <Select
                    id="sc-inv"
                    value={schedInvigilatorId}
                    onChange={(e) => setSchedInvigilatorId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.first_name} {t.last_name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" size="sm" disabled={addingSchedule}>
                    {addingSchedule ? 'Scheduling...' : 'Add Subject Sitting'}
                  </Button>
                </div>
              </form>

              {schedules.length === 0 ? (
                <p className="text-xs text-slate-500">No timetable sittings added yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class / Subject</TableHead>
                      <TableHead>Date &amp; Time</TableHead>
                      <TableHead>Venue</TableHead>
                      <TableHead>Invigilator</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((sc) => (
                      <TableRow key={sc.id}>
                        <TableCell className="text-xs font-medium text-[#0F172A]">
                          {sc.class_name} · {sc.subject_name}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-slate-600">
                          {sc.exam_date} · {sc.start_time} ({sc.duration_minutes}m)
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{sc.venue || '—'}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {sc.invigilator_name || '—'}
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
              <CardTitle>Exam Participation &amp; Script Scores</CardTitle>
              <CardDescription>
                Record exam sitting marks (max {selectedExam.max_score} pts) or attendance status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="es-cls">Class</Label>
                  <Select
                    id="es-cls"
                    value={scoreClassId}
                    onChange={(e) => setScoreClassId(e.target.value)}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="es-sub">Subject</Label>
                  <Select
                    id="es-sub"
                    value={scoreSubjectId}
                    onChange={(e) => setScoreSubjectId(e.target.value)}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {classStudents.length === 0 ? (
                <p className="text-xs text-slate-500">No active students in selected class.</p>
              ) : (
                <form onSubmit={handleSaveExamScores} className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classStudents.map((st) => {
                        const row = scoreDrafts[st.id] ?? { score: '', status: 'present' };
                        return (
                          <TableRow key={st.id}>
                            <TableCell className="text-xs font-medium text-[#0F172A]">
                              {st.first_name} {st.last_name}
                              <span className="ml-1.5 font-mono text-slate-400">
                                {st.admission_number}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Select
                                className="h-8 text-xs"
                                value={row.status}
                                onChange={(e) =>
                                  setScoreDrafts((prev) => ({
                                    ...prev,
                                    [st.id]: {
                                      ...row,
                                      status: e.target.value as ExaminationScoreRecord['status'],
                                    },
                                  }))
                                }
                              >
                                <option value="present">Present</option>
                                <option value="absent">Absent</option>
                                <option value="exempt">Exempt</option>
                                <option value="pending">Pending</option>
                                <option value="malpractice_hold">Hold</option>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                max={selectedExam.max_score}
                                step="0.5"
                                disabled={row.status === 'absent' || row.status === 'exempt'}
                                className="h-8 w-24 ml-auto text-right tabular-nums"
                                value={row.score}
                                onChange={(e) =>
                                  setScoreDrafts((prev) => ({
                                    ...prev,
                                    [st.id]: { ...row, score: e.target.value },
                                  }))
                                }
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={savingScores}>
                      {savingScores ? 'Saving Exam Scores...' : 'Save Exam Scores'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
