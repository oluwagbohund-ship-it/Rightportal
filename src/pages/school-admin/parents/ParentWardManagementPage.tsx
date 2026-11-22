import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Link2, Trash2 } from 'lucide-react';
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
import type { ParentRecord, StudentGuardianRecord, StudentRecord } from '../../../types/app.ts';

export function ParentWardManagementPage() {
  const { parentId: routeParentId } = useParams<{ parentId?: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [parents, setParents] = useState<ParentRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [selectedParentId, setSelectedParentId] = useState(routeParentId ?? '');
  const [wards, setWards] = useState<StudentGuardianRecord[]>([]);

  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('Mother');
  const [isPrimaryGuardian, setIsPrimaryGuardian] = useState(true);
  const [isEmergencyContact, setIsEmergencyContact] = useState(true);
  const [canPickup, setCanPickup] = useState(true);
  const [canViewAcademicRecords, setCanViewAcademicRecords] = useState(true);
  const [canReceiveNotifications, setCanReceiveNotifications] = useState(true);
  const [linking, setLinking] = useState(false);

  const [unlinkTarget, setUnlinkTarget] = useState<StudentGuardianRecord | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [parRes, stuRes] = await Promise.all([
        apiRequest<{ parents: ParentRecord[] }>('/api/school/parents?limit=100'),
        apiRequest<{ students: StudentRecord[] }>('/api/school/students?limit=100'),
      ]);
      setParents(parRes.parents ?? []);
      setStudents(stuRes.students ?? []);

      const activeParentId = routeParentId || selectedParentId || parRes.parents?.[0]?.id || '';
      if (activeParentId && !selectedParentId) {
        setSelectedParentId(activeParentId);
      }
      if (stuRes.students?.length && !studentId) {
        setStudentId(stuRes.students[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ward management data.');
    } finally {
      setLoading(false);
    }
  }, [routeParentId, selectedParentId, studentId]);

  const activeParentId = routeParentId || selectedParentId;

  const loadWardsForParent = useCallback(async () => {
    if (!activeParentId) {
      setWards([]);
      return;
    }
    try {
      const res = await apiRequest<{ wards: StudentGuardianRecord[] }>(
        `/api/school/parents/${activeParentId}`,
      );
      setWards(res.wards ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load parent wards.');
    }
  }, [activeParentId]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    void loadWardsForParent();
  }, [loadWardsForParent]);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeParentId || !studentId) return;
    setLinking(true);
    setError(null);
    try {
      await apiRequest(`/api/school/parents/${activeParentId}/guardians`, {
        method: 'POST',
        body: JSON.stringify({
          studentId,
          relationship: relationship.trim() || 'Guardian',
          isPrimaryGuardian,
          isEmergencyContact,
          canPickup,
          canViewAcademicRecords,
          canReceiveNotifications,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Ward linked',
        description: 'Guardian-student association verified and permissions saved.',
      });
      await loadWardsForParent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to link guardian.';
      setError(msg);
      showToast({ variant: 'error', title: 'Link failed', description: msg });
    } finally {
      setLinking(false);
    }
  };

  const togglePermission = async (
    ward: StudentGuardianRecord,
    field: 'can_pickup' | 'can_view_academic_records' | 'is_primary_guardian',
  ) => {
    try {
      await apiRequest(`/api/school/parents/guardians/${ward.guardian_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          relationship: ward.relationship,
          isPrimaryGuardian:
            field === 'is_primary_guardian'
              ? ward.is_primary_guardian !== 1
              : ward.is_primary_guardian === 1,
          isEmergencyContact: ward.is_emergency_contact === 1,
          canPickup: field === 'can_pickup' ? ward.can_pickup !== 1 : ward.can_pickup === 1,
          canViewAcademicRecords:
            field === 'can_view_academic_records'
              ? ward.can_view_academic_records !== 1
              : ward.can_view_academic_records === 1,
          canReceiveNotifications: ward.can_receive_notifications === 1,
        }),
      });
      showToast({ variant: 'success', title: 'Guardian permissions updated' });
      await loadWardsForParent();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update permissions.',
      });
    }
  };

  const confirmUnlink = async () => {
    if (!unlinkTarget) return;
    setUnlinking(true);
    try {
      await apiRequest(`/api/school/parents/guardians/${unlinkTarget.guardian_id}`, {
        method: 'DELETE',
      });
      showToast({
        variant: 'success',
        title: 'Guardian link removed',
        description: 'Association removed from this student.',
      });
      setUnlinkTarget(null);
      await loadWardsForParent();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Unlink failed',
        description: err instanceof Error ? err.message : 'Unable to unlink student.',
      });
    } finally {
      setUnlinking(false);
    }
  };

  const activeParent = parents.find((p) => p.id === activeParentId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          activeParent && routeParentId
            ? `${activeParent.full_name} — Ward Management`
            : 'Parent & Ward Linkage'
        }
        description="Connect parents to one or multiple enrolled siblings and enforce granular pickup, academic visibility, and primary guardian permissions."
        actions={
          <Link
            to={
              routeParentId
                ? `/dashboard/school-admin/parents/${routeParentId}`
                : '/dashboard/school-admin/parents'
            }
          >
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{routeParentId ? 'Parent Profile' : 'All Parents'}</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Link Student Ward</CardTitle>
          <CardDescription>
            Parents only gain access to students explicitly linked and permitted here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading directory...</p>
          ) : parents.length === 0 || students.length === 0 ? (
            <p className="text-sm text-slate-600">
              Ensure at least one parent profile and one student record exist before linking wards.
            </p>
          ) : (
            <form onSubmit={handleLink} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                {!routeParentId ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="wm-parent">Select Parent / Guardian *</Label>
                    <Select
                      id="wm-parent"
                      value={selectedParentId}
                      onChange={(e) => setSelectedParentId(e.target.value)}
                    >
                      {parents.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.phone})
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="wm-student">Select Student Ward *</Label>
                  <Select
                    id="wm-student"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.admission_number}) — {s.class_name ?? 'Unassigned'}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wm-rel">Relationship *</Label>
                  <Input
                    id="wm-rel"
                    required
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    placeholder="Mother, Father, Uncle, Guardian"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-5 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrimaryGuardian}
                    onChange={(e) => setIsPrimaryGuardian(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                  />
                  <span>Primary Guardian</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEmergencyContact}
                    onChange={(e) => setIsEmergencyContact(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                  />
                  <span>Emergency Contact</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canPickup}
                    onChange={(e) => setCanPickup(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                  />
                  <span>Authorized Pickup</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canViewAcademicRecords}
                    onChange={(e) => setCanViewAcademicRecords(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                  />
                  <span>Academic Records Access</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canReceiveNotifications}
                    onChange={(e) => setCanReceiveNotifications(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                  />
                  <span>Notifications</span>
                </label>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={linking}>
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  <span>{linking ? 'Linking Ward...' : 'Link Student Ward'}</span>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Verified Wards for {activeParent?.full_name ?? 'Selected Parent'} ({wards.length})
          </CardTitle>
          <CardDescription>Toggle ward-specific permissions or unlink associations</CardDescription>
        </CardHeader>
        <CardContent>
          {wards.length === 0 ? (
            <p className="text-sm text-slate-500">No students currently linked to this parent.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Academics</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wards.map((w) => (
                  <TableRow key={w.guardian_id}>
                    <TableCell>
                      <Link
                        to={`/dashboard/school-admin/students/${w.student_id}`}
                        className="font-semibold text-[#1E3A8A] hover:underline"
                      >
                        {w.first_name} {w.last_name}
                      </Link>
                      <p className="font-mono text-xs text-slate-500">{w.admission_number}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {w.class_name
                        ? `${w.class_name}${w.arm_name ? ` (${w.arm_name})` : ''}`
                        : 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{w.relationship}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void togglePermission(w, 'is_primary_guardian')}
                      >
                        {w.is_primary_guardian === 1 ? 'Yes' : 'No'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void togglePermission(w, 'can_pickup')}
                      >
                        {w.can_pickup === 1 ? 'Allowed' : 'Restricted'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void togglePermission(w, 'can_view_academic_records')}
                      >
                        {w.can_view_academic_records === 1 ? 'Allowed' : 'Hidden'}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setUnlinkTarget(w)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Unlink</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        title="Unlink Student Ward"
        description={`Remove ${unlinkTarget?.first_name ?? ''} ${unlinkTarget?.last_name ?? ''} from ${activeParent?.full_name ?? 'this guardian'}? This immediately revokes Parent Portal visibility for this student.`}
        confirmLabel="Unlink Ward"
        busy={unlinking}
        onCancel={() => setUnlinkTarget(null)}
        onConfirm={() => void confirmUnlink()}
      />
    </div>
  );
}
