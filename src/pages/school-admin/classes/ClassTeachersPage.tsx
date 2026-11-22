import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
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
import type { ClassArmRecord, SchoolClassRecord, TeacherRecord } from '../../../types/app.ts';

interface ClassTeacherAssignmentRow {
  assignment_id: string;
  role_label: string;
  arm_id: string | null;
  arm_name: string | null;
  assigned_at: string;
  is_active: number;
  ended_at: string | null;
  teacher_id: string;
  staff_id_number: string;
  first_name: string;
  last_name: string;
  email: string;
  specialization: string;
}

export function ClassTeachersPage() {
  const { classId } = useParams<{ classId: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cls, setCls] = useState<SchoolClassRecord | null>(null);
  const [arms, setArms] = useState<ClassArmRecord[]>([]);
  const [assignments, setAssignments] = useState<ClassTeacherAssignmentRow[]>([]);
  const [teachersList, setTeachersList] = useState<TeacherRecord[]>([]);

  const [teacherId, setTeacherId] = useState('');
  const [armId, setArmId] = useState('');
  const [roleLabel, setRoleLabel] = useState('Class Teacher');
  const [assigning, setAssigning] = useState(false);

  const [endTarget, setEndTarget] = useState<ClassTeacherAssignmentRow | null>(null);
  const [ending, setEnding] = useState(false);

  const loadData = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const [clsRes, tchRes] = await Promise.all([
        apiRequest<{
          class: SchoolClassRecord;
          arms: ClassArmRecord[];
          teachers: ClassTeacherAssignmentRow[];
        }>(`/api/school/classes/${classId}`),
        apiRequest<{ teachers: TeacherRecord[] }>('/api/school/teachers?status=active&limit=100'),
      ]);
      setCls(clsRes.class);
      setArms((clsRes.arms ?? []).filter((a) => a.status === 'active'));
      setAssignments(clsRes.teachers ?? []);
      setTeachersList(tchRes.teachers ?? []);
      if (tchRes.teachers?.length && !teacherId) {
        setTeacherId(tchRes.teachers[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load class teacher assignments.');
    } finally {
      setLoading(false);
    }
  }, [classId, teacherId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !teacherId) return;
    setAssigning(true);
    setError(null);
    try {
      await apiRequest(`/api/school/classes/${classId}/teachers`, {
        method: 'POST',
        body: JSON.stringify({
          teacherId,
          armId: armId || null,
          roleLabel: roleLabel.trim() || 'Class Teacher',
        }),
      });
      showToast({
        variant: 'success',
        title: 'Teacher assigned',
        description: `Educator linked to ${cls?.name ?? 'class'}.`,
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

  const handleEndAssignment = async () => {
    if (!classId || !endTarget) return;
    setEnding(true);
    try {
      await apiRequest(`/api/school/classes/${classId}/teachers/${endTarget.assignment_id}`, {
        method: 'DELETE',
      });
      showToast({
        variant: 'success',
        title: 'Assignment ended',
        description: `${endTarget.first_name} ${endTarget.last_name}'s class assignment was closed.`,
      });
      setEndTarget(null);
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to end assignment.';
      showToast({ variant: 'error', title: 'Action failed', description: msg });
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={cls ? `${cls.name} — Class Teachers` : 'Class Teachers'}
        description="Assign form tutors and assistant teachers to this class or a specific class arm."
        actions={
          <Link to={`/dashboard/school-admin/classes/${classId}`}>
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Class Details</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Assign Teacher to {cls?.name ?? 'Class'}</CardTitle>
          <CardDescription>
            Active teachers assigned here gain scoped read access to enrolled students in their Teacher Workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teachersList.length === 0 ? (
            <p className="text-sm text-slate-600">
              No active teachers found.{' '}
              <Link to="/dashboard/school-admin/teachers/register" className="font-semibold text-[#1E3A8A] hover:underline">
                Register a teacher first
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={handleAssign} className="grid gap-4 sm:grid-cols-4 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="ct-teacher">Active Teacher *</Label>
                <Select
                  id="ct-teacher"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                >
                  {teachersList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} ({t.staff_id_number})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ct-arm">Class Arm (Optional)</Label>
                <Select
                  id="ct-arm"
                  value={armId}
                  onChange={(e) => setArmId(e.target.value)}
                >
                  <option value="">All Arms / General Class</option>
                  {arms.map((arm) => (
                    <option key={arm.id} value={arm.id}>
                      Arm {arm.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ct-role">Assignment Role</Label>
                <Input
                  id="ct-role"
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  placeholder="Class Teacher / Form Tutor"
                />
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
          <CardTitle>Class Teacher Assignments Ledger ({assignments.length})</CardTitle>
          <CardDescription>Active and historical form teacher assignments for this class</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading teacher assignments...</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-slate-500">No class teachers assigned yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Educator</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Arm Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.assignment_id}>
                    <TableCell className="font-mono text-xs">{a.staff_id_number}</TableCell>
                    <TableCell className="font-medium">
                      <Link
                        to={`/dashboard/school-admin/teachers/${a.teacher_id}`}
                        className="text-[#1E3A8A] hover:underline"
                      >
                        {a.first_name} {a.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{a.role_label}</TableCell>
                    <TableCell className="text-xs text-slate-600">{a.arm_name || 'Entire Class'}</TableCell>
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
        title="End Class Teacher Assignment"
        description={`End ${endTarget?.first_name ?? ''} ${endTarget?.last_name ?? ''}'s active assignment for ${cls?.name ?? 'this class'}? Past records remain preserved.`}
        confirmLabel="End Assignment"
        busy={ending}
        onCancel={() => setEndTarget(null)}
        onConfirm={() => void handleEndAssignment()}
      />
    </div>
  );
}
