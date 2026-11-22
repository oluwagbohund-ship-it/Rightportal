import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { AcademicSessionRecord, TeacherRecord } from '../../types/app.ts';

interface AssignedClassItem {
  assignment_id: string;
  role_label: string;
  class_id: string;
  class_name: string;
  arm_id: string | null;
  arm_name: string | null;
}

interface AssignedSubjectItem {
  assignment_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  class_name: string | null;
  arm_name: string | null;
}

interface PermittedStudentItem {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  gender: string;
  status: string;
  class_name: string | null;
  arm_name: string | null;
}

interface TeacherActiveTerm {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  session_name: string;
}

interface TeacherScoreBatchSummary {
  id: string;
  status: string;
  updated_at: string;
  class_name: string;
  subject_name: string;
  term_name: string;
}

export function TeacherWorkspacePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileTitle, setProfileTitle] = useState('');
  const [sessions, setSessions] = useState<AcademicSessionRecord[]>([]);
  const [activeTerm, setActiveTerm] = useState<TeacherActiveTerm | null>(null);
  const [scoreBatches, setScoreBatches] = useState<TeacherScoreBatchSummary[]>([]);
  const [teacherRecord, setTeacherRecord] = useState<TeacherRecord | null>(null);
  const [assignedClasses, setAssignedClasses] = useState<AssignedClassItem[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<AssignedSubjectItem[]>([]);
  const [permittedStudents, setPermittedStudents] = useState<PermittedStudentItem[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{
      profile: { title: string; status: string } | null;
      sessions: AcademicSessionRecord[];
      activeTerm?: TeacherActiveTerm | null;
      scoreBatches?: TeacherScoreBatchSummary[];
      teacherRecord: TeacherRecord | null;
      assignedClasses: AssignedClassItem[];
      assignedSubjects: AssignedSubjectItem[];
      permittedStudents: PermittedStudentItem[];
    }>('/api/school/teacher-workspace')
      .then((res) => {
        if (!active) return;
        setProfileTitle(res.profile?.title || res.teacherRecord?.specialization || 'Faculty Educator');
        setSessions(res.sessions ?? []);
        setActiveTerm(res.activeTerm ?? null);
        setScoreBatches(res.scoreBatches ?? []);
        setTeacherRecord(res.teacherRecord ?? null);
        setAssignedClasses(res.assignedClasses ?? []);
        setAssignedSubjects(res.assignedSubjects ?? []);
        setPermittedStudents(res.permittedStudents ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load teacher workspace.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const currentSession = sessions.find((s) => s.is_current === 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faculty Workspace"
        description="Tenant-scoped educator workspace displaying your assigned classes, subjects, and authorized classroom students."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/teacher/academics/scores">
              <Button type="button" size="sm">
                Enter CA &amp; Exam Scores
              </Button>
            </Link>
            <Link to="/dashboard/teacher/academics/comments">
              <Button type="button" size="sm" variant="outline">
                Attendance &amp; Remarks
              </Button>
            </Link>
            <Link to="/dashboard/teacher/sessions">
              <Button type="button" size="sm" variant="outline">
                Academic Calendar
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>School Tenant</CardDescription>
            <CardTitle className="text-lg">{user?.activeSchoolName ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xs text-slate-500">
            {teacherRecord ? `Staff ID: ${teacherRecord.staff_id_number}` : `Code: ${user?.activeSchoolCode ?? '—'}`}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faculty Role</CardDescription>
            <CardTitle className="text-lg">{loading ? '—' : profileTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {teacherRecord?.qualifications || 'Scoped Faculty Educator'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current Academic Term</CardDescription>
            <CardTitle className="text-lg">
              {loading ? '—' : activeTerm ? activeTerm.name : currentSession ? currentSession.term : 'Pending Setup'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {activeTerm
              ? `${activeTerm.session_name} (${activeTerm.start_date} → ${activeTerm.end_date})`
              : currentSession
                ? currentSession.name
                : 'No active term configured yet'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assigned Scope</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {loading ? '—' : `${assignedClasses.length} classes · ${assignedSubjects.length} subjects`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500 tabular-nums">
            {permittedStudents.length} authorized student(s)
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Academic Score Submission Activity ({scoreBatches.length})</CardTitle>
            <CardDescription>
              Recent CA &amp; Examination score batches submitted from your teacher workspace
            </CardDescription>
          </div>
          <Link to="/dashboard/teacher/academics">
            <Button type="button" size="sm" variant="outline">
              Open Academic Hub
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {scoreBatches.length === 0 ? (
            <p className="text-xs text-slate-500">
              No score batches submitted yet. Open Score Entry to begin recording student assessments.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoreBatches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium text-[#0F172A]">{batch.subject_name}</TableCell>
                    <TableCell className="text-xs text-slate-600">{batch.class_name}</TableCell>
                    <TableCell className="text-xs text-slate-600">{batch.term_name}</TableCell>
                    <TableCell className="text-xs capitalize font-semibold text-[#1E3A8A]">
                      {batch.status.replace('_', ' ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assigned Classes ({assignedClasses.length})</CardTitle>
            <CardDescription>Classes where you serve as active Class Teacher or form tutor</CardDescription>
          </CardHeader>
          <CardContent>
            {assignedClasses.length === 0 ? (
              <p className="text-xs text-slate-500">No class teacher assignments active yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Arm</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedClasses.map((c) => (
                    <TableRow key={c.assignment_id}>
                      <TableCell className="font-semibold text-[#0F172A]">{c.class_name}</TableCell>
                      <TableCell className="text-xs text-slate-600">{c.arm_name || 'All Arms'}</TableCell>
                      <TableCell className="text-xs text-slate-700">{c.role_label}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assigned Subjects ({assignedSubjects.length})</CardTitle>
            <CardDescription>Curriculum subjects assigned to you by School Administration</CardDescription>
          </CardHeader>
          <CardContent>
            {assignedSubjects.length === 0 ? (
              <p className="text-xs text-slate-500">No subject allocations assigned yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Class Scope</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedSubjects.map((s) => (
                    <TableRow key={s.assignment_id}>
                      <TableCell className="font-mono text-xs">{s.subject_code}</TableCell>
                      <TableCell className="font-semibold text-[#0F172A]">{s.subject_name}</TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {s.class_name
                          ? `${s.class_name}${s.arm_name ? ` (${s.arm_name})` : ''}`
                          : 'General Subject'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permitted Classroom Students ({permittedStudents.length})</CardTitle>
          <CardDescription>
            Students strictly enrolled in classes assigned to you inside {user?.activeSchoolName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permittedStudents.length === 0 ? (
            <p className="text-sm text-slate-500">
              No students currently fall within your assigned classes or subject allocations.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class / Arm</TableHead>
                  <TableHead>Gender</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permittedStudents.map((st) => (
                  <TableRow key={st.id}>
                    <TableCell className="font-mono text-xs">{st.admission_number}</TableCell>
                    <TableCell className="font-medium text-[#0F172A]">
                      {st.first_name} {st.last_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {st.class_name ?? '—'}
                      {st.arm_name ? ` (${st.arm_name})` : ''}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{st.gender}</TableCell>
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
