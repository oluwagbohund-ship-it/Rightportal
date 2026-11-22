import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { StudentRecord } from '../../../types/app.ts';

export function ParentRegistrationPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [occupation, setOccupation] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');

  const [initialStudentId, setInitialStudentId] = useState('');
  const [relationship, setRelationship] = useState('Mother');
  const [isPrimaryGuardian, setIsPrimaryGuardian] = useState(true);
  const [canPickup, setCanPickup] = useState(true);
  const [canViewAcademicRecords, setCanViewAcademicRecords] = useState(true);

  const [createLogin, setCreateLogin] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');

  useEffect(() => {
    apiRequest<{ students: StudentRecord[] }>('/api/school/students?limit=100')
      .then((res) => setStudents(res.students ?? []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        occupation: occupation.trim(),
        residentialAddress: residentialAddress.trim(),
        portalAccount: createLogin
          ? { createLogin: true, password: portalPassword }
          : { createLogin: false },
      };

      if (initialStudentId) {
        payload.initialLink = {
          studentId: initialStudentId,
          relationship: relationship.trim() || 'Parent',
          isPrimaryGuardian,
          isEmergencyContact: true,
          canPickup,
          canViewAcademicRecords,
          canReceiveNotifications: true,
        };
      }

      const res = await apiRequest<{ parent: { id: string; full_name: string } }>(
        '/api/school/parents',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      showToast({
        variant: 'success',
        title: 'Parent registered',
        description: `${res.parent.full_name} added to guardian directory.`,
      });
      navigate(`/dashboard/school-admin/parents/${res.parent.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to register parent.';
      setError(msg);
      showToast({ variant: 'error', title: 'Registration failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Register Parent / Guardian"
        description="Create a guardian profile, link an initial student ward, and optionally provision Parent Portal access."
        actions={
          <Link to="/dashboard/school-admin/parents">
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Parents</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Guardian Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="par-name">Full Name *</Label>
              <Input
                id="par-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Dr. Olumide Adeyemi"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="par-phone">Phone Number *</Label>
              <Input
                id="par-phone"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 800 000 0000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="par-email">Email Address</Label>
              <Input
                id="par-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="par-occ">Occupation</Label>
              <Input
                id="par-occ"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="e.g., Civil Engineer"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="par-addr">Residential Address *</Label>
              <Input
                id="par-addr"
                required
                value={residentialAddress}
                onChange={(e) => setResidentialAddress(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Initial Student Ward Linkage (Optional)</CardTitle>
            <CardDescription>
              Connect this guardian to an enrolled student immediately. Additional siblings can be linked later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="par-student">Select Student Ward</Label>
                <Select
                  id="par-student"
                  value={initialStudentId}
                  onChange={(e) => setInitialStudentId(e.target.value)}
                >
                  <option value="">Do not link a ward yet</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.admission_number}) — {s.class_name ?? 'Unassigned'}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="par-rel">Relationship to Student</Label>
                <Input
                  id="par-rel"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  disabled={!initialStudentId}
                  placeholder="Mother, Father, Legal Guardian"
                />
              </div>
            </div>

            {initialStudentId ? (
              <div className="flex flex-wrap gap-5 pt-1 text-sm">
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
                  <span>Can View Academic Records</span>
                </label>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parent Portal Account (Optional)</CardTitle>
            <CardDescription>
              Create an active Parent Portal login linked exclusively to verified wards of this guardian.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="inline-flex items-center gap-2.5 text-sm font-medium text-[#0F172A] cursor-pointer">
              <input
                type="checkbox"
                checked={createLogin}
                onChange={(e) => setCreateLogin(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
              />
              <span>Create Parent Portal login account (requires valid email above)</span>
            </label>

            {createLogin ? (
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="par-portal-pw">Initial Portal Password (min 8 chars) *</Label>
                <Input
                  id="par-portal-pw"
                  type="password"
                  required={createLogin}
                  minLength={8}
                  value={portalPassword}
                  onChange={(e) => setPortalPassword(e.target.value)}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link to="/dashboard/school-admin/parents">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Registering...' : 'Register Parent / Guardian'}
          </Button>
        </div>
      </form>
    </div>
  );
}
