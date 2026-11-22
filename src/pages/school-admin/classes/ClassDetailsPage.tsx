import React, { useCallback, useEffect, useState } from 'react';
import { Archive, ArrowLeft, Plus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { ClassArmRecord, SchoolClassRecord } from '../../../types/app.ts';

interface ClassSubjectRow {
  class_subject_id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  category: string;
  is_compulsory: number;
  weekly_periods: number;
}

export function ClassDetailsPage() {
  const { classId } = useParams<{ classId: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cls, setCls] = useState<SchoolClassRecord | null>(null);
  const [arms, setArms] = useState<ClassArmRecord[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [teacherCount, setTeacherCount] = useState(0);
  const [subjects, setSubjects] = useState<ClassSubjectRow[]>([]);

  // Edit class form
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [levelOrder, setLevelOrder] = useState('1');
  const [section, setSection] = useState('');
  const [capacity, setCapacity] = useState('45');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // New arm form
  const [armName, setArmName] = useState('');
  const [armCapacity, setArmCapacity] = useState('40');
  const [armRoom, setArmRoom] = useState('');
  const [addingArm, setAddingArm] = useState(false);

  // Archive confirm
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [armToToggle, setArmToToggle] = useState<ClassArmRecord | null>(null);

  const loadDetails = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        class: SchoolClassRecord;
        arms: ClassArmRecord[];
        students: Array<{ status: string }>;
        teachers: Array<{ is_active: number }>;
        subjects: ClassSubjectRow[];
      }>(`/api/school/classes/${classId}`);
      setCls(res.class);
      setArms(res.arms ?? []);
      setStudentCount((res.students ?? []).filter((s) => s.status === 'active').length);
      setTeacherCount((res.teachers ?? []).filter((t) => t.is_active === 1).length);
      setSubjects(res.subjects ?? []);

      setName(res.class.name);
      setCode(res.class.code);
      setLevelOrder(String(res.class.level_order));
      setSection(res.class.section);
      setCapacity(String(res.class.capacity));
      setDescription(res.class.description);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load class details.');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !cls) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/school/classes/${classId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          levelOrder: Math.max(1, Number(levelOrder) || 1),
          section: section.trim(),
          description: description.trim(),
          capacity: Math.max(1, Number(capacity) || 45),
          status: cls.status,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Class updated',
        description: `${name.trim()} changes were saved.`,
      });
      await loadDetails();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update class.';
      setError(msg);
      showToast({ variant: 'error', title: 'Update failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleAddArm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !armName.trim()) return;
    setAddingArm(true);
    setError(null);
    try {
      await apiRequest(`/api/school/classes/${classId}/arms`, {
        method: 'POST',
        body: JSON.stringify({
          name: armName.trim(),
          capacity: Math.max(1, Number(armCapacity) || 40),
          room: armRoom.trim(),
        }),
      });
      setArmName('');
      setArmRoom('');
      showToast({
        variant: 'success',
        title: 'Class arm created',
        description: `Arm "${armName.trim()}" added to ${cls?.name}.`,
      });
      await loadDetails();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create class arm.';
      setError(msg);
      showToast({ variant: 'error', title: 'Arm creation failed', description: msg });
    } finally {
      setAddingArm(false);
    }
  };

  const handleToggleClassArchive = async () => {
    if (!classId || !cls) return;
    setArchiving(true);
    const nextStatus = cls.status === 'active' ? 'archived' : 'active';
    try {
      await apiRequest(`/api/school/classes/${classId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: cls.name,
          code: cls.code,
          levelOrder: cls.level_order,
          section: cls.section,
          description: cls.description,
          capacity: cls.capacity,
          status: nextStatus,
        }),
      });
      showToast({
        variant: 'success',
        title: nextStatus === 'archived' ? 'Class archived' : 'Class restored',
        description: `${cls.name} status is now ${nextStatus}.`,
      });
      setArchiveConfirmOpen(false);
      await loadDetails();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update class status.';
      showToast({ variant: 'error', title: 'Status change failed', description: msg });
    } finally {
      setArchiving(false);
    }
  };

  const handleToggleArmStatus = async () => {
    if (!classId || !armToToggle) return;
    const nextStatus = armToToggle.status === 'active' ? 'archived' : 'active';
    setArchiving(true);
    try {
      await apiRequest(`/api/school/classes/${classId}/arms/${armToToggle.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: armToToggle.name,
          capacity: armToToggle.capacity,
          room: armToToggle.room,
          status: nextStatus,
        }),
      });
      showToast({
        variant: 'success',
        title: `Arm ${nextStatus}`,
        description: `Arm ${armToToggle.name} updated.`,
      });
      setArmToToggle(null);
      await loadDetails();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update arm.';
      showToast({ variant: 'error', title: 'Update failed', description: msg });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={cls ? `${cls.name} — Class Details` : 'Class Details'}
        description="Edit class profile, manage parallel class arms, inspect curriculum links, and navigate rosters."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/classes">
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>All Classes</span>
              </Button>
            </Link>
            {cls ? (
              <>
                <Link to={`/dashboard/school-admin/classes/${cls.id}/students`}>
                  <Button type="button" size="sm" variant="outline">
                    Students ({studentCount})
                  </Button>
                </Link>
                <Link to={`/dashboard/school-admin/classes/${cls.id}/teachers`}>
                  <Button type="button" size="sm">
                    Teachers ({teacherCount})
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading || !cls ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            {loading ? 'Loading class details...' : 'Class record not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Students</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{studentCount}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 tabular-nums">
                Capacity: {cls.capacity}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Class Arms</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{arms.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Parallel sections</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Assigned Teachers</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{teacherCount}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Form &amp; assistant staff</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Class Subjects</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{subjects.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Mapped curriculum subjects</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Class Settings</CardTitle>
                <CardDescription>Update class attributes or archive when retired</CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setArchiveConfirmOpen(true)}
                className={cls.status === 'active' ? 'text-red-600 hover:bg-red-50' : ''}
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
                <span>{cls.status === 'active' ? 'Archive Class' : 'Restore Class'}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveClass} className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cls-name">Class Name *</Label>
                  <Input
                    id="edit-cls-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cls-code">Code</Label>
                  <Input
                    id="edit-cls-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cls-section">Section</Label>
                  <Input
                    id="edit-cls-section"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cls-level">Level Order *</Label>
                  <Input
                    id="edit-cls-level"
                    type="number"
                    min={1}
                    max={200}
                    required
                    value={levelOrder}
                    onChange={(e) => setLevelOrder(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cls-cap">Total Capacity *</Label>
                  <Input
                    id="edit-cls-cap"
                    type="number"
                    min={1}
                    max={2000}
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cls-desc">Description</Label>
                  <Input
                    id="edit-cls-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Class Arms / Streams</CardTitle>
              <CardDescription>Create and manage individual arms inside {cls.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleAddArm} className="grid gap-3 sm:grid-cols-4 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="new-arm-name">New Arm Name *</Label>
                  <Input
                    id="new-arm-name"
                    required
                    value={armName}
                    onChange={(e) => setArmName(e.target.value)}
                    placeholder="e.g., Gold or B"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-arm-cap">Arm Capacity *</Label>
                  <Input
                    id="new-arm-cap"
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={armCapacity}
                    onChange={(e) => setArmCapacity(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-arm-room">Classroom / Room</Label>
                  <Input
                    id="new-arm-room"
                    value={armRoom}
                    onChange={(e) => setArmRoom(e.target.value)}
                    placeholder="Block A Room 102"
                  />
                </div>
                <Button type="submit" disabled={addingArm}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>{addingArm ? 'Adding...' : 'Add Arm'}</span>
                </Button>
              </form>

              {arms.length === 0 ? (
                <p className="text-xs text-slate-500">No class arms created yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arm Name</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Students / Capacity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arms.map((arm) => (
                      <TableRow key={arm.id}>
                        <TableCell className="font-semibold text-[#0F172A]">{arm.name}</TableCell>
                        <TableCell className="text-xs text-slate-600">{arm.room || '—'}</TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {arm.active_students_count ?? 0} / {arm.capacity}
                        </TableCell>
                        <TableCell className="text-xs capitalize text-slate-700">{arm.status}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setArmToToggle(arm)}
                          >
                            {arm.status === 'active' ? 'Archive' : 'Restore'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Curriculum Subjects Linked ({subjects.length})</CardTitle>
                <CardDescription>Subjects assigned to {cls.name}</CardDescription>
              </div>
              <Link to="/dashboard/school-admin/subjects">
                <Button type="button" size="sm" variant="outline">
                  Manage Subjects
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {subjects.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No subjects mapped to {cls.name} yet. Assign subjects from the Subjects module.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Subject Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Weekly Periods</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjects.map((sub) => (
                      <TableRow key={sub.class_subject_id}>
                        <TableCell className="font-mono text-xs">{sub.subject_code}</TableCell>
                        <TableCell className="font-medium">
                          <Link
                            to={`/dashboard/school-admin/subjects/${sub.subject_id}`}
                            className="text-[#1E3A8A] hover:underline"
                          >
                            {sub.subject_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{sub.category}</TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {sub.is_compulsory === 1 ? 'Compulsory' : 'Optional'}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{sub.weekly_periods}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={archiveConfirmOpen}
        title={cls?.status === 'active' ? `Archive ${cls?.name}` : `Restore ${cls?.name}`}
        description={
          cls?.status === 'active'
            ? 'Archiving removes this class from active registration lists. Active students must be transferred or promoted first.'
            : 'Restoring reactivates this class for student enrollments and teacher assignments.'
        }
        confirmLabel={cls?.status === 'active' ? 'Archive Class' : 'Restore Class'}
        destructive={cls?.status === 'active'}
        busy={archiving}
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={() => void handleToggleClassArchive()}
      />

      <ConfirmDialog
        open={Boolean(armToToggle)}
        title={armToToggle?.status === 'active' ? `Archive Arm ${armToToggle?.name}` : `Restore Arm ${armToToggle?.name}`}
        description="Archived arms remain preserved on historical student placements but cannot receive new enrollments."
        confirmLabel={armToToggle?.status === 'active' ? 'Archive Arm' : 'Restore Arm'}
        destructive={armToToggle?.status === 'active'}
        busy={archiving}
        onCancel={() => setArmToToggle(null)}
        onConfirm={() => void handleToggleArmStatus()}
      />
    </div>
  );
}
