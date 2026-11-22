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
import { formatBytes, readFileAsBase64 } from '../../../lib/files.ts';
import type { SchoolClassRecord, SubjectRecord } from '../../../types/app.ts';

export function TeacherRegistrationPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);

  const [staffIdNumber, setStaffIdNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [employmentDate, setEmploymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [qualifications, setQualifications] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<'active' | 'on_leave'>('active');

  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  const [createLogin, setCreateLogin] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
      apiRequest<{ subjects: SubjectRecord[] }>('/api/school/subjects'),
    ])
      .then(([clsRes, subRes]) => {
        if (!active) return;
        setClasses(clsRes.classes ?? []);
        setSubjects(subRes.subjects ?? []);
      })
      .catch(() => {
        // optional lists
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleId = (id: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{ teacher: { id: string; first_name: string; last_name: string } }>(
        '/api/school/teachers',
        {
          method: 'POST',
          body: JSON.stringify({
            staffIdNumber: staffIdNumber.trim().toUpperCase(),
            firstName: firstName.trim(),
            middleName: middleName.trim(),
            lastName: lastName.trim(),
            gender,
            dateOfBirth: dateOfBirth.trim(),
            email: email.trim(),
            phone: phone.trim(),
            residentialAddress: residentialAddress.trim(),
            employmentDate,
            qualifications: qualifications.trim(),
            specialization: specialization.trim(),
            employmentStatus,
            assignedSubjectIds: selectedSubjectIds,
            assignedClassIds: selectedClassIds,
            portalAccount: createLogin
              ? { createLogin: true, password: portalPassword }
              : { createLogin: false },
          }),
        },
      );

      if (photoFile) {
        const contentBase64 = await readFileAsBase64(photoFile);
        await apiRequest(`/api/school/teachers/${res.teacher.id}/photo`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: photoFile.name,
            mimeType: photoFile.type || 'image/jpeg',
            contentBase64,
          }),
        });
      }

      showToast({
        variant: 'success',
        title: 'Teacher registered',
        description: `${res.teacher.first_name} ${res.teacher.last_name} was onboarded to faculty.`,
      });
      navigate(`/dashboard/school-admin/teachers/${res.teacher.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to register teacher.';
      setError(msg);
      showToast({ variant: 'error', title: 'Registration failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Register Academic Teacher"
        description="Onboard a faculty educator with Staff ID, qualifications, optional class/subject assignments, and portal access."
        actions={
          <Link to="/dashboard/school-admin/teachers">
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Teachers</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal &amp; Employment Information</CardTitle>
            <CardDescription>Required institutional staff identification and contact record</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tch-staff-id">Staff ID Number *</Label>
              <Input
                id="tch-staff-id"
                required
                value={staffIdNumber}
                onChange={(e) => setStaffIdNumber(e.target.value)}
                placeholder="e.g., STF-001"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-emp-date">Employment Date *</Label>
              <Input
                id="tch-emp-date"
                type="date"
                required
                value={employmentDate}
                onChange={(e) => setEmploymentDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-status">Employment Status</Label>
              <Select
                id="tch-status"
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value as 'active' | 'on_leave')}
              >
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-first">First Name *</Label>
              <Input
                id="tch-first"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-middle">Middle Name</Label>
              <Input
                id="tch-middle"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-last">Last Name *</Label>
              <Input
                id="tch-last"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-gender">Gender *</Label>
              <Select
                id="tch-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-dob">Date of Birth</Label>
              <Input
                id="tch-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-phone">Phone Number *</Label>
              <Input
                id="tch-phone"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 800 000 0000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-email">Email Address *</Label>
              <Input
                id="tch-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="educator@school.edu"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-qual">Qualifications</Label>
              <Input
                id="tch-qual"
                value={qualifications}
                onChange={(e) => setQualifications(e.target.value)}
                placeholder="e.g., B.Sc. Ed, TRCN"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-spec">Subject Specialization</Label>
              <Input
                id="tch-spec"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="e.g., Mathematics & Physics"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="tch-address">Residential Address</Label>
              <Input
                id="tch-address"
                value={residentialAddress}
                onChange={(e) => setResidentialAddress(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tch-photo">Profile Photo (Optional)</Label>
              <Input
                id="tch-photo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium"
              />
              {photoFile ? (
                <p className="text-xs text-slate-500">
                  {photoFile.name} ({formatBytes(photoFile.size)})
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Initial Class Assignments</CardTitle>
              <CardDescription>Assign as Class Teacher to active classes (optional)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-56 overflow-y-auto">
              {classes.length === 0 ? (
                <p className="text-xs text-slate-500">No active classes created yet.</p>
              ) : (
                classes.map((cls) => (
                  <label
                    key={cls.id}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedClassIds.includes(cls.id)}
                      onChange={() => toggleId(cls.id, selectedClassIds, setSelectedClassIds)}
                      className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                    />
                    <span className="font-medium text-[#0F172A]">{cls.name}</span>
                    <span className="text-xs text-slate-500">({cls.section})</span>
                  </label>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Initial Subject Assignments</CardTitle>
              <CardDescription>Select curriculum subjects taught by this educator</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-56 overflow-y-auto">
              {subjects.length === 0 ? (
                <p className="text-xs text-slate-500">No active subjects created yet.</p>
              ) : (
                subjects.map((sub) => (
                  <label
                    key={sub.id}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubjectIds.includes(sub.id)}
                      onChange={() => toggleId(sub.id, selectedSubjectIds, setSelectedSubjectIds)}
                      className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                    />
                    <span className="font-medium text-[#0F172A]">{sub.name}</span>
                    <span className="font-mono text-xs text-slate-500">{sub.code}</span>
                  </label>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Teacher Portal Account (Optional)</CardTitle>
            <CardDescription>
              Provision immediate sign-in access for this educator using their school email and tenant code.
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
              <span>Create active Teacher Portal login account</span>
            </label>

            {createLogin ? (
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="tch-portal-pw">Initial Portal Password (min 8 chars) *</Label>
                <Input
                  id="tch-portal-pw"
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
          <Link to="/dashboard/school-admin/teachers">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Registering Teacher...' : 'Complete Teacher Registration'}
          </Button>
        </div>
      </form>
    </div>
  );
}
