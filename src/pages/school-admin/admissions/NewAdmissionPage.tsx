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
import type { SchoolClassRecord } from '../../../types/app.ts';

export function NewAdmissionPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);

  const [applicantFirstName, setApplicantFirstName] = useState('');
  const [applicantMiddleName, setApplicantMiddleName] = useState('');
  const [applicantLastName, setApplicantLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [nationality, setNationality] = useState('Nigerian');
  const [stateOfOrigin, setStateOfOrigin] = useState('');
  const [previousSchool, setPreviousSchool] = useState('');
  const [desiredClassId, setDesiredClassId] = useState('');
  const [desiredArmId, setDesiredArmId] = useState('');

  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('Mother');
  const [guardianOccupation, setGuardianOccupation] = useState('');
  const [guardianAddress, setGuardianAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes')
      .then((res) => {
        setClasses(res.classes ?? []);
        if (res.classes?.length) {
          setDesiredClassId(res.classes[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const selectedClass = classes.find((c) => c.id === desiredClassId);
  const availableArms = selectedClass?.arms?.filter((a) => a.status === 'active') ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{
        application: { id: string; application_reference: string };
      }>('/api/school/admissions', {
        method: 'POST',
        body: JSON.stringify({
          applicantFirstName: applicantFirstName.trim(),
          applicantMiddleName: applicantMiddleName.trim(),
          applicantLastName: applicantLastName.trim(),
          dateOfBirth,
          gender,
          applicantEmail: applicantEmail.trim(),
          applicantPhone: applicantPhone.trim(),
          residentialAddress: residentialAddress.trim(),
          nationality: nationality.trim(),
          stateOfOrigin: stateOfOrigin.trim(),
          previousSchool: previousSchool.trim(),
          desiredClassId,
          desiredArmId: desiredArmId || null,
          guardianName: guardianName.trim(),
          guardianEmail: guardianEmail.trim(),
          guardianPhone: guardianPhone.trim(),
          guardianRelationship: guardianRelationship.trim(),
          guardianOccupation: guardianOccupation.trim(),
          guardianAddress: guardianAddress.trim(),
          notes: notes.trim(),
        }),
      });

      showToast({
        variant: 'success',
        title: 'Application submitted',
        description: `Reference ${res.application.application_reference} queued for admissions review.`,
      });
      navigate(`/dashboard/school-admin/admissions/${res.application.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to submit admission application.';
      setError(msg);
      showToast({ variant: 'error', title: 'Submission failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Admission Application"
        description="Capture prospective applicant and guardian details for formal review prior to enrollment."
        actions={
          <Link to="/dashboard/school-admin/admissions/applications">
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Applications Queue</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Applicant Information</CardTitle>
            <CardDescription>Select target admission class and enter student candidate details</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="adm-first">First Name *</Label>
              <Input
                id="adm-first"
                required
                value={applicantFirstName}
                onChange={(e) => setApplicantFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-middle">Middle Name</Label>
              <Input
                id="adm-middle"
                value={applicantMiddleName}
                onChange={(e) => setApplicantMiddleName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-last">Last Name *</Label>
              <Input
                id="adm-last"
                required
                value={applicantLastName}
                onChange={(e) => setApplicantLastName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adm-dob">Date of Birth *</Label>
              <Input
                id="adm-dob"
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-gender">Gender *</Label>
              <Select
                id="adm-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-class">Desired Admission Class *</Label>
              <Select
                id="adm-class"
                required
                value={desiredClassId}
                onChange={(e) => {
                  setDesiredClassId(e.target.value);
                  setDesiredArmId('');
                }}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adm-arm">Preferred Arm (Optional)</Label>
              <Select
                id="adm-arm"
                value={desiredArmId}
                disabled={availableArms.length === 0}
                onChange={(e) => setDesiredArmId(e.target.value)}
              >
                <option value="">No preference</option>
                {availableArms.map((a) => (
                  <option key={a.id} value={a.id}>
                    Arm {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-email">Applicant Email</Label>
              <Input
                id="adm-email"
                type="email"
                value={applicantEmail}
                onChange={(e) => setApplicantEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-phone">Applicant Phone</Label>
              <Input
                id="adm-phone"
                value={applicantPhone}
                onChange={(e) => setApplicantPhone(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adm-nat">Nationality</Label>
              <Input
                id="adm-nat"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-state">State of Origin</Label>
              <Input
                id="adm-state"
                value={stateOfOrigin}
                onChange={(e) => setStateOfOrigin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-prev">Previous School</Label>
              <Input
                id="adm-prev"
                value={previousSchool}
                onChange={(e) => setPreviousSchool(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="adm-addr">Residential Address *</Label>
              <Input
                id="adm-addr"
                required
                value={residentialAddress}
                onChange={(e) => setResidentialAddress(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parent / Sponsor Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="adm-gname">Guardian Full Name *</Label>
              <Input
                id="adm-gname"
                required
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-gphone">Guardian Phone *</Label>
              <Input
                id="adm-gphone"
                required
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-gemail">Guardian Email</Label>
              <Input
                id="adm-gemail"
                type="email"
                value={guardianEmail}
                onChange={(e) => setGuardianEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-grel">Relationship *</Label>
              <Input
                id="adm-grel"
                required
                value={guardianRelationship}
                onChange={(e) => setGuardianRelationship(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-gocc">Occupation</Label>
              <Input
                id="adm-gocc"
                value={guardianOccupation}
                onChange={(e) => setGuardianOccupation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-gaddr">Guardian Address</Label>
              <Input
                id="adm-gaddr"
                value={guardianAddress}
                onChange={(e) => setGuardianAddress(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="adm-notes">Intake Officer Notes</Label>
              <Input
                id="adm-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Assessment score, interview comments, or special considerations"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link to="/dashboard/school-admin/admissions/applications">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting || classes.length === 0}>
            {submitting ? 'Submitting...' : 'Submit Admission Application'}
          </Button>
        </div>
      </form>
    </div>
  );
}
