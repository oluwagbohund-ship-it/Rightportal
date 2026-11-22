import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
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
import type { ParentRecord, StudentGuardianRecord } from '../../../types/app.ts';

export function ParentProfilePage() {
  const { parentId } = useParams<{ parentId: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parent, setParent] = useState<ParentRecord | null>(null);
  const [wards, setWards] = useState<StudentGuardianRecord[]>([]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [occupation, setOccupation] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [status, setStatus] = useState<'active' | 'suspended'>('active');

  const loadParent = useCallback(async () => {
    if (!parentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ parent: ParentRecord; wards: StudentGuardianRecord[] }>(
        `/api/school/parents/${parentId}`,
      );
      setParent(res.parent);
      setWards(res.wards ?? []);
      setFullName(res.parent.full_name);
      setEmail(res.parent.email);
      setPhone(res.parent.phone);
      setOccupation(res.parent.occupation);
      setResidentialAddress(res.parent.residential_address);
      setStatus(res.parent.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load parent profile.');
    } finally {
      setLoading(false);
    }
  }, [parentId]);

  useEffect(() => {
    void loadParent();
  }, [loadParent]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentId) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/school/parents/${parentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          occupation: occupation.trim(),
          residentialAddress: residentialAddress.trim(),
          status,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Guardian profile updated',
        description: `${fullName.trim()} changes were saved.`,
      });
      await loadParent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update guardian.';
      setError(msg);
      showToast({ variant: 'error', title: 'Update failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={parent ? `${parent.full_name} — Guardian Profile` : 'Parent Profile'}
        description="Edit guardian contact information, portal account status, and review verified ward associations."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/parents">
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>All Parents</span>
              </Button>
            </Link>
            {parent ? (
              <Link to={`/dashboard/school-admin/parents/${parent.id}/wards`}>
                <Button type="button" size="sm">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span>Manage Wards ({wards.length})</span>
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading || !parent ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            {loading ? 'Loading parent profile...' : 'Parent record not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Guardian Contact &amp; Status</CardTitle>
              <CardDescription>
                Portal Login: {parent.user_id ? 'Provisioned & Linked' : 'Directory Profile Only'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="epar-name">Full Name *</Label>
                  <Input
                    id="epar-name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="epar-phone">Phone *</Label>
                  <Input
                    id="epar-phone"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="epar-email">Email</Label>
                  <Input
                    id="epar-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="epar-occ">Occupation</Label>
                  <Input
                    id="epar-occ"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="epar-addr">Residential Address *</Label>
                  <Input
                    id="epar-addr"
                    required
                    value={residentialAddress}
                    onChange={(e) => setResidentialAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="epar-status">Account Status</Label>
                  <Select
                    id="epar-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'suspended')}
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </Select>
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Guardian Profile'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Linked Student Wards ({wards.length})</CardTitle>
                <CardDescription>Students currently associated with {parent.full_name}</CardDescription>
              </div>
              <Link to={`/dashboard/school-admin/parents/${parent.id}/wards`}>
                <Button type="button" size="sm" variant="outline">
                  Link or Edit Wards
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {wards.length === 0 ? (
                <p className="text-xs text-slate-500">No students linked to this guardian yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Admission No.</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Authorized Access</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wards.map((w) => (
                      <TableRow key={w.guardian_id}>
                        <TableCell className="font-mono text-xs">{w.admission_number}</TableCell>
                        <TableCell className="font-medium">
                          <Link
                            to={`/dashboard/school-admin/students/${w.student_id}`}
                            className="text-[#1E3A8A] hover:underline"
                          >
                            {w.first_name} {w.last_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {w.class_name
                            ? `${w.class_name}${w.arm_name ? ` (${w.arm_name})` : ''}`
                            : 'Unassigned'}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">{w.relationship}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {[
                            w.is_primary_guardian ? 'Primary' : null,
                            w.can_pickup ? 'Pickup' : null,
                            w.can_view_academic_records ? 'Academics' : null,
                            w.can_receive_notifications ? 'Alerts' : null,
                          ]
                            .filter(Boolean)
                            .join(', ') || 'Basic Contact'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
