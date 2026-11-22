import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  SchoolClassRecord,
  SubjectRecord,
  TeacherRecord,
  TeacherSubjectAssignmentRecord,
} from '../../../types/app.ts';

export function SubjectAssignmentsPage() {
  const { subjectId: routeSubjectId } = useParams<{ subjectId?: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [assignments, setAssignments] = useState<TeacherSubjectAssignmentRecord[]>([]);

  const [selectedSubjectId, setSelectedSubjectId] = useState(routeSubjectId ?? '');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedArmId, setSelectedArmId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [endTarget, setEndTarget] = useState<TeacherSubjectAssignmentRecord | null>(null);
  const [ending, setEnding] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, tchRes, clsRes] = await Promise.all([
        apiRequest<{
          subjects: SubjectRecord[];
          teacherAssignments: TeacherSubjectAssignmentRecord[];
        }>('/api/school/subjects'),
        apiRequest<{ teachers: TeacherRecord[] }>('/api/school/teachers?status=active&limit=100'),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
      ]);

      setSubjects(subRes.subjects ?? []);
      setTeachers(tchRes.teachers ?? []);
      setClasses(clsRes.classes ?? []);

      const list = routeSubjectId
        ? (subRes.teacherAssignments ?? []).filter((a) => a.subject_id === routeSubjectId)
        : (subRes.teacherAssignments ?? []);
      setAssignments(list);

      if (routeSubjectId) {
        setSelectedSubjectId(routeSubjectId);
      } else if (subRes.subjects?.length && !selectedSubjectId) {
        setSelectedSubjectId(subRes.subjects[0].id);
      }

      if (tchRes.teachers?.length && !selectedTeacherId) {
        setSelectedTeacherId(tchRes.teachers[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load subject assignments.');
    } finally {
      setLoading(false);
    }
  }, [routeSubjectId, selectedSubjectId, selectedTeacherId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeClass = classes.find((c) => c.id === selectedClassId);
  const availableArms = activeClass?.arms?.filter((a) => a.status === 'active') ?? [];

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSubId = routeSubjectId || selectedSubjectId;
    if (!targetSubId || !selectedTeacherId) return;

    setAssigning(true);
    setError(null);
    try {
      await apiRequest(`/api/school/subjects/${targetSubId}/teachers`, {
        method: 'POST',
        body: JSON.stringify({
          teacherId: selectedTeacherId,
          classId: selectedClassId || null,
          armId: selectedClassId && selectedArmId ? selectedArmId : null,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Teacher assigned to subject',
        description: 'Instructional assignment saved and audited.',
      });
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to assign teacher.';
      setError(msg);
      showToast({ variant: 'error', title: 'Assignment failed', description: msg });
    } finally {
      setAssigning(false);
    }
  };

  const confirmEnd = async () => {
    if (!endTarget) return;
    setEnding(true);
    try {
      await apiRequest(
        `/api/school/subjects/${endTarget.subject_id}/teachers/${endTarget.assignment_id}`,
        { method: 'DELETE' },
      );
      showToast({
        variant: 'success',
        title: 'Assignment ended',
        description: 'Subject teaching assignment marked inactive.',
      });
      setEndTarget(null);
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Unable to end assignment.',
      });
    } finally {
      setEnding(false);
    }
  };

  const currentSubject = subjects.find((s) => s.id === routeSubjectId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          currentSubject
            ? `${currentSubject.name} — Teacher Assignments`
            : 'Subject Teaching Assignments'
        }
        description="Allocate active faculty teachers to curriculum subjects, optionally scoped to specific classes and arms."
        actions={
          <Link
            to={
              routeSubjectId
                ? `/dashboard/school-admin/subjects/${routeSubjectId}`
                : '/dashboard/school-admin/subjects'
            }
          >
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{routeSubjectId ? 'Subject Details' : 'All Subjects'}</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Assign Teacher to Subject</CardTitle>
          <CardDescription>
            Teachers assigned to a class subject automatically see that class&apos;s active students in their portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subjects.length === 0 || teachers.length === 0 ? (
            <p className="text-sm text-slate-600">
              Ensure at least one active subject and one active teacher exist before creating assignments.
            </p>
          ) : (
            <form onSubmit={handleAssign} className="grid gap-4 md:grid-cols-5 items-end">
              {!routeSubjectId ? (
                <div className="space-y-1.5">
                  <Label htmlFor="sa-subject">Subject *</Label>
                  <Select
                    id="sa-subject"
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="sa-teacher">Teacher *</Label>
                <Select
                  id="sa-teacher"
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} ({t.staff_id_number})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-class">Class Scope (Optional)</Label>
                <Select
                  id="sa-class"
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setSelectedArmId('');
                  }}
                >
                  <option value="">All / General Subject</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-arm">Arm Scope (Optional)</Label>
                <Select
                  id="sa-arm"
                  value={selectedArmId}
                  disabled={!selectedClassId || availableArms.length === 0}
                  onChange={(e) => setSelectedArmId(e.target.value)}
                >
                  <option value="">All Arms</option>
                  {availableArms.map((a) => (
                    <option key={a.id} value={a.id}>
                      Arm {a.name}
                    </option>
                  ))}
                </Select>
              </div>

              <Button type="submit" disabled={assigning}>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                <span>{assigning ? 'Assigning...' : 'Assign Teacher'}</span>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignments Ledger ({assignments.length})</CardTitle>
          <CardDescription>Active and ended subject teaching records</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading assignments...</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-slate-500">No subject assignments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Class / Arm Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.assignment_id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/dashboard/school-admin/subjects/${a.subject_id}`}
                        className="text-[#1E3A8A] hover:underline"
                      >
                        {a.subject_name ?? currentSubject?.name}
                      </Link>
                      {a.subject_code ? (
                        <span className="ml-2 font-mono text-xs text-slate-500">
                          {a.subject_code}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/dashboard/school-admin/teachers/${a.teacher_id}`}
                        className="font-medium text-[#0F172A] hover:underline"
                      >
                        {a.first_name} {a.last_name}
                      </Link>
                      <p className="font-mono text-xs text-slate-500">{a.staff_id_number}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {a.class_name
                        ? `${a.class_name}${a.arm_name ? ` (${a.arm_name})` : ''}`
                        : 'School-wide / All Classes'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {a.is_active === 1 ? 'Active' : `Ended ${a.ended_at?.slice(0, 10) ?? ''}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.is_active === 1 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEndTarget(a)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          End Assignment
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Historical</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(endTarget)}
        title="End Subject Teaching Assignment"
        description={`End ${endTarget?.first_name ?? ''} ${endTarget?.last_name ?? ''}'s teaching assignment for ${endTarget?.subject_name ?? currentSubject?.name ?? 'this subject'}?`}
        confirmLabel="End Assignment"
        busy={ending}
        onCancel={() => setEndTarget(null)}
        onConfirm={() => void confirmEnd()}
      />
    </div>
  );
}
