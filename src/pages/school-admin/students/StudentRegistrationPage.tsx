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
import type { ParentRecord, SchoolClassRecord } from '../../../types/app.ts';

export function StudentRegistrationPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [parents, setParents] = useState<ParentRecord[]>([]);

  const [admissionNumber, setAdmissionNumber] = useState('');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [nationality, setNationality] = useState('Nigerian');
  const [stateOfOrigin, setStateOfOrigin] = useState('');
  const [previousSchool, setPreviousSchool] = useState('');

  const [currentClassId, setCurrentClassId] = useState('');
  const [currentArmId, setCurrentArmId] = useState('');

  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('Mother');

  const [guardianParentId, setGuardianParentId] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('Parent');

  const [createLogin, setCreateLogin] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
      apiRequest<{ parents: ParentRecord[] }>('/api/school/parents?limit=100'),
    ])
      .then(([clsRes, parRes]) => {
        if (!active) return;
        setClasses(clsRes.classes ?? []);
        setParents(parRes.parents ?? []);
        if (clsRes.classes?.length) {
          setCurrentClassId(clsRes.classes[0].id);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedClass = classes.find((c) => c.id === currentClassId);
  const availableArms = selectedClass?.arms?.filter((a) => a.status === 'active') ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        admissionNumber: admissionNumber.trim(),
        admissionDate,
        firstName: firstName.trim(),
        middleName: middleName.trim(),
        lastName: lastName.trim(),
        dateOfBirth,
        gender,
        studentEmail: studentEmail.trim(),
        studentPhone: studentPhone.trim(),
        residentialAddress: residentialAddress.trim(),
        nationality: nationality.trim(),
        stateOfOrigin: stateOfOrigin.trim(),
        previousSchool: previousSchool.trim(),
        currentClassId: currentClassId || null,
        currentArmId: currentClassId && currentArmId ? currentArmId : null,
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        emergencyContactRelationship: emergencyContactRelationship.trim(),
        portalAccount: createLogin
          ? { createLogin: true, password: portalPassword }
          : { createLogin: false },
      };

      if (guardianParentId) {
        payload.guardianLink = {
          parentId: guardianParentId,
          relationship: guardianRelationship.trim() || 'Parent',
          isPrimaryGuardian: true,
          isEmergencyContact: true,
        };
      }

      const res = await apiRequest<{
        student: { id: string; admission_number: string; first_name: string; last_name: string };
      }>('/api/school/students', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (photoFile) {
        const contentBase64 = await readFileAsBase64(photoFile);
        await apiRequest(`/api/school/students/${res.student.id}/photo`, {
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
        title: 'Student registered',
        description: `${res.student.first_name} ${res.student.last_name} (${res.student.admission_number}) enrolled.`,
      });
      navigate(`/dashboard/school-admin/students/${res.student.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to register student.';
      setError(msg);
      showToast({ variant: 'error', title: 'Registration failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Register New Student"
        description="Enroll a student with automatic or custom admission numbering, class placement, guardian association, and optional portal login."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/students/bulk-import">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                Bulk Import CSV
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/students">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back to Students</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Admission &amp; Personal Information</CardTitle>
            <CardDescription>
              Leave Admission Number blank to auto-generate using your School Settings template.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="stu-adm-no">Admission Number (Optional auto-gen)</Label>
              <Input
                id="stu-adm-no"
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
                placeholder="Auto-generated if blank"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-adm-date">Admission Date *</Label>
              <Input
                id="stu-adm-date"
                type="date"
                required
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-dob">Date of Birth *</Label>
              <Input
                id="stu-dob"
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-first">First Name *</Label>
              <Input
                id="stu-first"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-middle">Middle Name</Label>
              <Input
                id="stu-middle"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-last">Last Name *</Label>
              <Input
                id="stu-last"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-gender">Gender *</Label>
              <Select
                id="stu-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-email">Student Email (Optional)</Label>
              <Input
                id="stu-email"
                type="email"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                placeholder="student@school.edu"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-phone">Student Phone (Optional)</Label>
              <Input
                id="stu-phone"
                value={studentPhone}
                onChange={(e) => setStudentPhone(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-nat">Nationality</Label>
              <Input
                id="stu-nat"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-state">State / Origin</Label>
              <Input
                id="stu-state"
                value={stateOfOrigin}
                onChange={(e) => setStateOfOrigin(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-prev">Previous School</Label>
              <Input
                id="stu-prev"
                value={previousSchool}
                onChange={(e) => setPreviousSchool(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="stu-address">Residential Address *</Label>
              <Input
                id="stu-address"
                required
                value={residentialAddress}
                onChange={(e) => setResidentialAddress(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-photo">Student Passport Photo (Optional)</Label>
              <Input
                id="stu-photo"
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
              <CardTitle>Class Placement</CardTitle>
              <CardDescription>Assign initial class and compatible class arm</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="stu-class">Assigned Class</Label>
                <Select
                  id="stu-class"
                  value={currentClassId}
                  onChange={(e) => {
                    setCurrentClassId(e.target.value);
                    setCurrentArmId('');
                  }}
                >
                  <option value="">Unassigned (Assign Later)</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.active_students_count ?? 0}/{c.capacity})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-arm">Class Arm</Label>
                <Select
                  id="stu-arm"
                  value={currentArmId}
                  disabled={!currentClassId || availableArms.length === 0}
                  onChange={(e) => setCurrentArmId(e.target.value)}
                >
                  <option value="">General Class / No Arm</option>
                  {availableArms.map((a) => (
                    <option key={a.id} value={a.id}>
                      Arm {a.name} ({a.active_students_count ?? 0}/{a.capacity})
                    </option>
                  ))}
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Emergency Contact &amp; Guardian</CardTitle>
              <CardDescription>Required safety contact and optional existing guardian linkage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="stu-em-name">Emergency Contact Name *</Label>
                  <Input
                    id="stu-em-name"
                    required
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stu-em-phone">Emergency Phone *</Label>
                  <Input
                    id="stu-em-phone"
                    required
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-em-rel">Emergency Relationship *</Label>
                <Input
                  id="stu-em-rel"
                  required
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="stu-guardian">Link Existing Parent (Optional)</Label>
                  <Select
                    id="stu-guardian"
                    value={guardianParentId}
                    onChange={(e) => setGuardianParentId(e.target.value)}
                  >
                    <option value="">Do not link now</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.phone})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stu-g-rel">Guardian Relationship</Label>
                  <Input
                    id="stu-g-rel"
                    value={guardianRelationship}
                    onChange={(e) => setGuardianRelationship(e.target.value)}
                    disabled={!guardianParentId}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Student Portal Login (Optional)</CardTitle>
            <CardDescription>
              Young students without an email address can be registered without a portal login and linked strictly via their parents.
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
              <span>Create active Student Portal login account (requires student email above)</span>
            </label>

            {createLogin ? (
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="stu-portal-pw">Initial Portal Password (min 8 chars) *</Label>
                <Input
                  id="stu-portal-pw"
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
          <Link to="/dashboard/school-admin/students">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Registering Student...' : 'Complete Student Registration'}
          </Button>
        </div>
      </form>
    </div>
  );
}
