import React, { useEffect, useState } from 'react';
import { BookOpen, Building2, CalendarDays, ClipboardEdit, QrCode, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { TelegramBotConnectCard } from '../../components/shared/TelegramBotConnectCard.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Skeleton, TableSkeleton } from '../../components/ui/skeleton.tsx';
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
        eyebrow="Classroom & Faculty"
        title="Faculty Workspace"
        description="Tenant-scoped educator workspace displaying your assigned classes, subjects, and authorized classroom students."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/teacher/attendance">
              <Button type="button" size="sm">
                <QrCode className="h-4 w-4" aria-hidden="true" />
                <span>Scan ID Attendance</span>
              </Button>
            </Link>
            <Link to="/dashboard/teacher/academics/scores">
              <Button type="button" size="sm" variant="outline">
                <ClipboardEdit className="h-4 w-4" aria-hidden="true" />
                <span>Enter CA &amp; Exam Scores</span>
              </Button>
            </Link>
            <Link to="/dashboard/teacher/academics/comments">
              <Button type="button" size="sm" variant="outline">
                Remarks &amp; Traits
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <TelegramBotConnectCard mode="portal" audience="school" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">School Tenant</CardDescription>
            <Building2 className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-display text-lg font-bold text-[#0F172A] truncate">
              {user?.activeSchoolName ?? '—'}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {teacherRecord ? `Staff ID: ${teacherRecord.staff_id_number}` : `Code: ${user?.activeSchoolCode ?? '—'}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">Faculty Role</CardDescription>
            <UserCheck className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-32 my-0.5" />
            ) : (
              <p className="font-display text-lg font-bold text-[#0F172A] truncate">{profileTitle}</p>
            )}
            <p className="mt-1 text-xs text-slate-500 truncate">
              {teacherRecord?.qualifications || 'Scoped Faculty Educator'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">Current Academic Term</CardDescription>
            <CalendarDays className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-28 my-0.5" />
            ) : (
              <p className="font-display text-lg font-bold text-[#0F172A]">
                {activeTerm ? activeTerm.name : currentSession ? currentSession.term : 'Pending Setup'}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500 truncate">
              {activeTerm
                ? `${activeTerm.session_name} (${activeTerm.start_date} → ${activeTerm.end_date})`
                : currentSession
                  ? currentSession.name
                  : 'No active term configured yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-medium text-slate-600">Assigned Scope</CardDescription>
            <BookOpen className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-36 my-0.5" />
            ) : (
              <p className="font-display text-lg font-bold text-[#0F172A] tabular-nums">
                {assignedClasses.length} classes · {assignedSubjects.length} subjects
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {permittedStudents.length} authorized student(s)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100">
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
        <CardContent className="pt-4">
          {loading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : scoreBatches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-8 px-4 text-center space-y-3">
              <p className="text-xs text-slate-500">
                No score batches submitted yet. Open Score Entry to begin recording student assessments.
              </p>
              <Link to="/dashboard/teacher/academics/scores" className="inline-block">
                <Button type="button" size="sm" variant="outline">
                  Start Score Entry
                </Button>
              </Link>
            </div>
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
          <CardHeader className="border-b border-slate-100">
            <CardTitle>Assigned Classes ({assignedClasses.length})</CardTitle>
            <CardDescription>Classes where you serve as active Class Teacher or form tutor</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : assignedClasses.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No class teacher assignments active yet.</p>
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
          <CardHeader className="border-b border-slate-100">
            <CardTitle>Assigned Subjects ({assignedSubjects.length})</CardTitle>
            <CardDescription>Curriculum subjects assigned to you by School Administration</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : assignedSubjects.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No subject allocations assigned yet.</p>
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
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Permitted Classroom Students ({permittedStudents.length})</CardTitle>
          <CardDescription>
            Students strictly enrolled in classes assigned to you inside {user?.activeSchoolName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : permittedStudents.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
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
