import React, { useEffect, useState } from 'react';
import { ArrowLeft, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import { readFileAsBase64 } from '../../../lib/files.ts';
import type { SchoolClassRecord, StudentRecord } from '../../../types/app.ts';

export function StudentEditPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);

  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [admissionNumber, setAdmissionNumber] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [nationality, setNationality] = useState('');
  const [stateOfOrigin, setStateOfOrigin] = useState('');
  const [previousSchool, setPreviousSchool] = useState('');
  const [currentClassId, setCurrentClassId] = useState('');
  const [currentArmId, setCurrentArmId] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    Promise.all([
      apiRequest<{ student: StudentRecord }>(`/api/school/students/${studentId}`),
      apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
    ])
      .then(([stuRes, clsRes]) => {
        if (!active) return;
        const s = stuRes.student;
        setClasses(clsRes.classes ?? []);
        setPhotoFileId(s.photo_file_id);
        setAdmissionNumber(s.admission_number);
        setAdmissionDate(s.admission_date);
        setFirstName(s.first_name);
        setMiddleName(s.middle_name);
        setLastName(s.last_name);
        setDateOfBirth(s.date_of_birth);
        setGender(s.gender);
        setStudentEmail(s.student_email);
        setStudentPhone(s.student_phone);
        setResidentialAddress(s.residential_address);
        setNationality(s.nationality);
        setStateOfOrigin(s.state_of_origin);
        setPreviousSchool(s.previous_school);
        setCurrentClassId(s.current_class_id ?? '');
        setCurrentArmId(s.current_arm_id ?? '');
        setEmergencyContactName(s.emergency_contact_name);
        setEmergencyContactPhone(s.emergency_contact_phone);
        setEmergencyContactRelationship(s.emergency_contact_relationship);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load student.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studentId]);

  const selectedClass = classes.find((c) => c.id === currentClassId);
  const availableArms = selectedClass?.arms?.filter((a) => a.status === 'active') ?? [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/school/students/${studentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
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
        }),
      });
      showToast({
        variant: 'success',
        title: 'Student record updated',
        description: `${firstName.trim()} ${lastName.trim()} details saved.`,
      });
      navigate(`/dashboard/school-admin/students/${studentId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update student.';
      setError(msg);
      showToast({ variant: 'error', title: 'Update failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !photoFile) return;
    setUploadingPhoto(true);
    try {
      const contentBase64 = await readFileAsBase64(photoFile);
      const res = await apiRequest<{ photoFileId: string }>(`/api/school/students/${studentId}/photo`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: photoFile.name,
          mimeType: photoFile.type || 'image/jpeg',
          contentBase64,
        }),
      });
      setPhotoFileId(res.photoFileId);
      setPhotoFile(null);
      showToast({ variant: 'success', title: 'Student photo updated' });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Photo upload failed',
        description: err instanceof Error ? err.message : 'Unable to upload photo.',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Student Record"
        description="Update personal details, emergency contacts, placement, and passport photograph."
        actions={
          <Link to={`/dashboard/school-admin/students/${studentId}`}>
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Profile</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">Loading student record...</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Student Portrait</CardTitle>
              <CardDescription>Upload PNG, JPEG, or WebP passport photograph</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePhotoUpload} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {photoFileId ? (
                  <img
                    src={`/api/school/files/${photoFileId}/download`}
                    alt="Student portrait"
                    className="h-16 w-16 rounded-xl border border-slate-200 object-cover bg-slate-50 shrink-0"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                    No photo
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium"
                />
                <Button type="submit" disabled={!photoFile || uploadingPhoto}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>{uploadingPhoto ? 'Uploading...' : 'Update Photo'}</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Student Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="est-adm">Admission Number *</Label>
                  <Input
                    id="est-adm"
                    required
                    value={admissionNumber}
                    onChange={(e) => setAdmissionNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-date">Admission Date *</Label>
                  <Input
                    id="est-date"
                    type="date"
                    required
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-dob">Date of Birth *</Label>
                  <Input
                    id="est-dob"
                    type="date"
                    required
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="est-first">First Name *</Label>
                  <Input
                    id="est-first"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-middle">Middle Name</Label>
                  <Input
                    id="est-middle"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-last">Last Name *</Label>
                  <Input
                    id="est-last"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="est-gender">Gender *</Label>
                  <Select
                    id="est-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-email">Email</Label>
                  <Input
                    id="est-email"
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-phone">Phone</Label>
                  <Input
                    id="est-phone"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="est-nat">Nationality</Label>
                  <Input
                    id="est-nat"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-state">State of Origin</Label>
                  <Input
                    id="est-state"
                    value={stateOfOrigin}
                    onChange={(e) => setStateOfOrigin(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-prev">Previous School</Label>
                  <Input
                    id="est-prev"
                    value={previousSchool}
                    onChange={(e) => setPreviousSchool(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="est-class">Class Placement</Label>
                  <Select
                    id="est-class"
                    value={currentClassId}
                    onChange={(e) => {
                      setCurrentClassId(e.target.value);
                      setCurrentArmId('');
                    }}
                  >
                    <option value="">Unassigned</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-arm">Class Arm</Label>
                  <Select
                    id="est-arm"
                    value={currentArmId}
                    disabled={!currentClassId || availableArms.length === 0}
                    onChange={(e) => setCurrentArmId(e.target.value)}
                  >
                    <option value="">General Class / No Arm</option>
                    {availableArms.map((a) => (
                      <option key={a.id} value={a.id}>
                        Arm {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-address">Residential Address *</Label>
                  <Input
                    id="est-address"
                    required
                    value={residentialAddress}
                    onChange={(e) => setResidentialAddress(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="est-em-name">Emergency Contact *</Label>
                  <Input
                    id="est-em-name"
                    required
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-em-phone">Emergency Phone *</Label>
                  <Input
                    id="est-em-phone"
                    required
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="est-em-rel">Emergency Relationship *</Label>
                  <Input
                    id="est-em-rel"
                    required
                    value={emergencyContactRelationship}
                    onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                  />
                </div>

                <div className="md:col-span-3 flex justify-end gap-3 pt-2">
                  <Link to={`/dashboard/school-admin/students/${studentId}`}>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Student Profile'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
