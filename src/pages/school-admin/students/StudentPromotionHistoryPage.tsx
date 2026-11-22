import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
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
  SchoolClassRecord,
  StudentClassHistoryRecord,
  StudentRecord,
} from '../../../types/app.ts';

export function StudentPromotionHistoryPage() {
  const { studentId: routeStudentId } = useParams<{ studentId?: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [history, setHistory] = useState<StudentClassHistoryRecord[]>([]);

  const [selectedStudentId, setSelectedStudentId] = useState(routeStudentId ?? '');
  const [toClassId, setToClassId] = useState('');
  const [toArmId, setToArmId] = useState('');
  const [actionType, setActionType] = useState<'promotion' | 'transfer' | 'reassignment' | 'demotion'>('promotion');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const targetStuId = routeStudentId || selectedStudentId;
      const [stuRes, clsRes, histRes] = await Promise.all([
        apiRequest<{ students: StudentRecord[] }>('/api/school/students?status=active&limit=100'),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
        apiRequest<{ history: StudentClassHistoryRecord[] }>(
          routeStudentId
            ? `/api/school/students/promotions/history?studentId=${encodeURIComponent(routeStudentId)}`
            : '/api/school/students/promotions/history',
        ),
      ]);

      setStudents(stuRes.students ?? []);
      setClasses(clsRes.classes ?? []);
      setHistory(histRes.history ?? []);

      if (!targetStuId && stuRes.students?.length) {
        setSelectedStudentId(stuRes.students[0].id);
      }
      if (!toClassId && clsRes.classes?.length) {
        setToClassId(clsRes.classes[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load promotion records.');
    } finally {
      setLoading(false);
    }
  }, [routeStudentId, selectedStudentId, toClassId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeStudentId = routeStudentId || selectedStudentId;
  const selectedStudent = students.find((s) => s.id === activeStudentId);
  const destinationClass = classes.find((c) => c.id === toClassId);
  const availableArms = destinationClass?.arms?.filter((a) => a.status === 'active') ?? [];

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudentId || !toClassId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/school/students/${activeStudentId}/promote`, {
        method: 'POST',
        body: JSON.stringify({
          toClassId,
          toArmId: toArmId || null,
          actionType,
          effectiveDate,
          notes: notes.trim(),
        }),
      });
      showToast({
        variant: 'success',
        title: 'Class movement recorded',
        description: 'Historical placement preserved and new enrollment activated.',
      });
      setNotes('');
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to promote student.';
      setError(msg);
      showToast({ variant: 'error', title: 'Movement failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          selectedStudent && routeStudentId
            ? `${selectedStudent.first_name} ${selectedStudent.last_name} — Promotion History`
            : 'Promotions & Class Transfers'
        }
        description="Execute student promotions, class transfers, or arm reassignments while preserving complete immutable placement history."
        actions={
          <Link
            to={
              routeStudentId
                ? `/dashboard/school-admin/students/${routeStudentId}`
                : '/dashboard/school-admin/students'
            }
          >
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{routeStudentId ? 'Student Profile' : 'All Students'}</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Record Class Movement</CardTitle>
          <CardDescription>
            {selectedStudent
              ? `Current Placement: ${selectedStudent.class_name ?? 'Unassigned'}${
                  selectedStudent.arm_name ? ` (${selectedStudent.arm_name})` : ''
                }`
              : 'Select an active student and destination class'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {students.length === 0 || classes.length === 0 ? (
            <p className="text-sm text-slate-600">
              Active students and classes are required before recording promotions or transfers.
            </p>
          ) : (
            <form onSubmit={handlePromote} className="grid gap-4 md:grid-cols-3 items-end">
              {!routeStudentId ? (
                <div className="space-y-1.5">
                  <Label htmlFor="pr-student">Student *</Label>
                  <Select
                    id="pr-student"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.admission_number}) — {s.class_name ?? 'Unassigned'}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="pr-action">Movement Type *</Label>
                <Select
                  id="pr-action"
                  value={actionType}
                  onChange={(e) =>
                    setActionType(
                      e.target.value as 'promotion' | 'transfer' | 'reassignment' | 'demotion',
                    )
                  }
                >
                  <option value="promotion">Academic Promotion</option>
                  <option value="transfer">Class / Arm Transfer</option>
                  <option value="reassignment">Administrative Reassignment</option>
                  <option value="demotion">Class Repetition / Adjustment</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pr-class">Destination Class *</Label>
                <Select
                  id="pr-class"
                  value={toClassId}
                  onChange={(e) => {
                    setToClassId(e.target.value);
                    setToArmId('');
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.active_students_count ?? 0}/{c.capacity})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pr-arm">Destination Arm (Optional)</Label>
                <Select
                  id="pr-arm"
                  value={toArmId}
                  disabled={!toClassId || availableArms.length === 0}
                  onChange={(e) => setToArmId(e.target.value)}
                >
                  <option value="">General Class / No Arm</option>
                  {availableArms.map((a) => (
                    <option key={a.id} value={a.id}>
                      Arm {a.name} ({a.active_students_count ?? 0}/{a.capacity})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pr-date">Effective Date *</Label>
                <Input
                  id="pr-date"
                  type="date"
                  required
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pr-notes">Administrative Notes</Label>
                <Input
                  id="pr-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Passed End-of-Year Promotion Exams"
                />
              </div>

              <div className="md:col-span-3 flex justify-end">
                <Button type="submit" disabled={submitting}>
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  <span>{submitting ? 'Recording Movement...' : 'Execute Movement'}</span>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Class Placement History Ledger ({history.length})</CardTitle>
          <CardDescription>Chronological record preserving every past class &amp; arm assignment</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading history ledger...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500">No promotion or placement records found yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective Date</TableHead>
                  {!routeStudentId ? <TableHead>Student</TableHead> : null}
                  <TableHead>Movement</TableHead>
                  <TableHead>From Class</TableHead>
                  <TableHead>To Class</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs tabular-nums">{item.effective_date}</TableCell>
                    {!routeStudentId ? (
                      <TableCell className="font-medium">
                        <Link
                          to={`/dashboard/school-admin/students/${item.student_id}`}
                          className="text-[#1E3A8A] hover:underline"
                        >
                          {item.first_name} {item.last_name}
                        </Link>
                        {item.admission_number ? (
                          <p className="font-mono text-xs text-slate-500">{item.admission_number}</p>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-xs font-medium capitalize text-[#0F172A]">
                      {item.action_type.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {item.from_class_name
                        ? `${item.from_class_name}${item.from_arm_name ? ` (${item.from_arm_name})` : ''}`
                        : 'Initial Entry'}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-[#1E3A8A]">
                      {item.to_class_name}
                      {item.to_arm_name ? ` (${item.to_arm_name})` : ''}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{item.notes || '—'}</TableCell>
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
