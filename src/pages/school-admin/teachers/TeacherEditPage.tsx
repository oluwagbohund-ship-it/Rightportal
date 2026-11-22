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
import type { TeacherRecord } from '../../../types/app.ts';

export function TeacherEditPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [staffIdNumber, setStaffIdNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [employmentDate, setEmploymentDate] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<'active' | 'on_leave' | 'suspended' | 'terminated'>('active');

  useEffect(() => {
    if (!teacherId) return;
    let active = true;
    apiRequest<{ teacher: TeacherRecord }>(`/api/school/teachers/${teacherId}`)
      .then((res) => {
        if (!active) return;
        const t = res.teacher;
        setStaffIdNumber(t.staff_id_number);
        setFirstName(t.first_name);
        setMiddleName(t.middle_name);
        setLastName(t.last_name);
        setGender(t.gender);
        setDateOfBirth(t.date_of_birth);
        setEmail(t.email);
        setPhone(t.phone);
        setResidentialAddress(t.residential_address);
        setEmploymentDate(t.employment_date);
        setQualifications(t.qualifications);
        setSpecialization(t.specialization);
        setEmploymentStatus(t.employment_status);
        setPhotoFileId(t.photo_file_id);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load teacher.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [teacherId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/school/teachers/${teacherId}`, {
        method: 'PATCH',
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
        }),
      });
      showToast({
        variant: 'success',
        title: 'Teacher profile updated',
        description: `${firstName.trim()} ${lastName.trim()} changes were saved.`,
      });
      navigate(`/dashboard/school-admin/teachers/${teacherId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update teacher.';
      setError(msg);
      showToast({ variant: 'error', title: 'Update failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || !photoFile) return;
    setUploadingPhoto(true);
    try {
      const contentBase64 = await readFileAsBase64(photoFile);
      const res = await apiRequest<{ photoFileId: string }>(`/api/school/teachers/${teacherId}/photo`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: photoFile.name,
          mimeType: photoFile.type || 'image/jpeg',
          contentBase64,
        }),
      });
      setPhotoFileId(res.photoFileId);
      setPhotoFile(null);
      showToast({ variant: 'success', title: 'Teacher photo updated' });
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
        title="Edit Teacher Record"
        description="Update personal details, credentials, employment status, and staff portrait."
        actions={
          <Link to={`/dashboard/school-admin/teachers/${teacherId}`}>
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
          <CardContent className="pt-6 text-sm text-slate-500">Loading teacher details...</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Staff Portrait</CardTitle>
              <CardDescription>Upload PNG, JPEG, or WebP staff photograph</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePhotoUpload} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {photoFileId ? (
                  <img
                    src={`/api/school/files/${photoFileId}/download`}
                    alt="Staff portrait"
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
              <CardTitle>Teacher Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="etch-id">Staff ID *</Label>
                  <Input
                    id="etch-id"
                    required
                    value={staffIdNumber}
                    onChange={(e) => setStaffIdNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etch-date">Employment Date *</Label>
                  <Input
                    id="etch-date"
                    type="date"
                    required
                    value={employmentDate}
                    onChange={(e) => setEmploymentDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etch-status">Employment Status</Label>
                  <Select
                    id="etch-status"
                    value={employmentStatus}
                    onChange={(e) =>
                      setEmploymentStatus(
                        e.target.value as 'active' | 'on_leave' | 'suspended' | 'terminated',
                      )
                    }
                  >
                    <option value="active">Active</option>
                    <option value="on_leave">On Leave</option>
                    <option value="suspended">Suspended</option>
                    <option value="terminated">Terminated</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="etch-first">First Name *</Label>
                  <Input
                    id="etch-first"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etch-middle">Middle Name</Label>
                  <Input
                    id="etch-middle"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etch-last">Last Name *</Label>
                  <Input
                    id="etch-last"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="etch-gender">Gender *</Label>
                  <Select
                    id="etch-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etch-dob">Date of Birth</Label>
                  <Input
                    id="etch-dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etch-phone">Phone *</Label>
                  <Input
                    id="etch-phone"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="etch-email">Email *</Label>
                  <Input
                    id="etch-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etch-qual">Qualifications</Label>
                  <Input
                    id="etch-qual"
                    value={qualifications}
                    onChange={(e) => setQualifications(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etch-spec">Specialization</Label>
                  <Input
                    id="etch-spec"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-3">
                  <Label htmlFor="etch-address">Residential Address</Label>
                  <Input
                    id="etch-address"
                    value={residentialAddress}
                    onChange={(e) => setResidentialAddress(e.target.value)}
                  />
                </div>

                <div className="md:col-span-3 flex justify-end gap-3 pt-2">
                  <Link to={`/dashboard/school-admin/teachers/${teacherId}`}>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving Changes...' : 'Save Teacher Profile'}
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
