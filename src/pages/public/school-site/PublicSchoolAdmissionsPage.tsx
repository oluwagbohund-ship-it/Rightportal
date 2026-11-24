import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { BrandLoader } from '../../../components/brand/BrandLoader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function PublicSchoolAdmissionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('2014-01-01');
  const [gender, setGender] = useState('Female');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [classId, setClassId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('Parent');

  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    apiRequest<any>(`/api/public/schools/${slug}`)
      .then((res) => {
        setData(res);
        if (res.classes?.[0]) setClassId(res.classes[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'School admissions unavailable.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ applicationReference: string }>(`/api/public/schools/${slug}/admissions`, {
        method: 'POST',
        body: {
          applicantFirstName: firstName,
          applicantLastName: lastName,
          dateOfBirth: dob,
          gender,
          applicantEmail: email,
          applicantPhone: phone,
          residentialAddress: address,
          desiredClassId: classId,
          guardianName,
          guardianPhone,
          guardianEmail,
          guardianRelationship,
        },
      });
      setSubmittedRef(res.applicationReference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit admission application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <BrandLoader label="Loading admissions portal..." />;

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC]">
        <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-xl border border-slate-200">
          <h1 className="font-display text-xl font-bold text-[#0F172A]">School Not Found</h1>
          <Link to="/" className="inline-block pt-2">
            <Button type="button">Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { school } = data;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="space-y-3 border-b border-slate-200 pb-6">
          <Link
            to={`/schools/${slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1E3A8A] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to {school.name}</span>
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#0F172A]">
            Online Admission Application
          </h1>
          <p className="text-sm text-slate-600">
            Submit an official prospective student application for {school.name} ({school.code}).
          </p>
        </div>

        {submittedRef ? (
          <Card className="border-emerald-200 bg-white">
            <CardHeader>
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                <CardTitle className="text-emerald-950">Application Submitted Successfully</CardTitle>
              </div>
              <CardDescription className="text-slate-700 pt-1">
                Your standardized application reference is{' '}
                <span className="font-mono font-bold text-[#0F172A]">{submittedRef}</span>. Keep this reference code safe to track admission review status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to={`/schools/${slug}`}>
                <Button type="button">Return to School Campus</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b border-slate-100">
              <CardTitle>Prospective Student &amp; Guardian Details</CardTitle>
              <CardDescription>Complete all required fields marked with an asterisk (*).</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {error ? <Alert variant="error" className="mb-6">{error}</Alert> : null}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[#0F172A] border-b border-slate-100 pb-2">
                    01. Student Identity &amp; Class Placement
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-first">First Name *</Label>
                      <Input
                        id="pub-adm-first"
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-last">Last Name *</Label>
                      <Input
                        id="pub-adm-last"
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-dob">Date of Birth *</Label>
                      <Input
                        id="pub-adm-dob"
                        type="date"
                        required
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-gender">Gender *</Label>
                      <Select
                        id="pub-adm-gender"
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                      >
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Other">Other</option>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-class">Desired Class *</Label>
                      <Select
                        id="pub-adm-class"
                        value={classId}
                        onChange={(e) => setClassId(e.target.value)}
                      >
                        {data.classes?.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.section})
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-email">Applicant Email</Label>
                      <Input
                        id="pub-adm-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-phone">Applicant Phone</Label>
                      <Input
                        id="pub-adm-phone"
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pub-adm-address">Residential Address</Label>
                    <Input
                      id="pub-adm-address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4 border-t border-slate-200 pt-6">
                  <h2 className="text-sm font-semibold text-[#0F172A] border-b border-slate-100 pb-2">
                    02. Parent / Guardian Information
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-gname">Guardian Full Name *</Label>
                      <Input
                        id="pub-adm-gname"
                        type="text"
                        required
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-gphone">Guardian Phone *</Label>
                      <Input
                        id="pub-adm-gphone"
                        type="text"
                        required
                        value={guardianPhone}
                        onChange={(e) => setGuardianPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-gemail">Guardian Email</Label>
                      <Input
                        id="pub-adm-gemail"
                        type="email"
                        value={guardianEmail}
                        onChange={(e) => setGuardianEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pub-adm-grel">Relationship *</Label>
                      <Input
                        id="pub-adm-grel"
                        type="text"
                        required
                        value={guardianRelationship}
                        onChange={(e) => setGuardianRelationship(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" size="lg" disabled={submitting} className="w-full">
                  {submitting ? 'Submitting Application...' : 'Submit Application'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
