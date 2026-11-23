import React, { useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PUBLIC_MEDIA, VisualMediaFrame } from '../../components/public/publicMedia.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { cn } from '../../lib/utils.ts';

export function RegisterSchoolPage() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [accessCode, setAccessCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeCheckResult, setCodeCheckResult] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  const [schoolName, setSchoolName] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [initialSessionName, setInitialSessionName] = useState('2026/2027 Academic Session');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerifyCode = async () => {
    const trimmed = accessCode.trim().toUpperCase();
    if (!trimmed) {
      setCodeCheckResult({
        valid: false,
        message: 'Enter the unique code obtained from the Platform Owner first.',
      });
      return;
    }

    setVerifyingCode(true);
    setCodeCheckResult(null);
    setError(null);
    try {
      const res = await apiRequest<{
        valid: boolean;
        code: string;
        intendedSchoolName?: string;
      }>('/api/public/verify-access-code', {
        method: 'POST',
        body: JSON.stringify({ accessCode: trimmed }),
      });
      setAccessCode(res.code);
      if (res.intendedSchoolName && !schoolName.trim()) {
        setSchoolName(res.intendedSchoolName);
      }
      setCodeCheckResult({
        valid: true,
        message: res.intendedSchoolName
          ? `Code ${res.code} verified for ${res.intendedSchoolName}.`
          : `Code ${res.code} verified and ready to create your school.`,
      });
    } catch (err) {
      setCodeCheckResult({
        valid: false,
        message:
          err instanceof Error
            ? err.message
            : 'Invalid or unavailable access code. Contact the Platform Owner.',
      });
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{ redirectPath: string }>('/api/public/register-school', {
        method: 'POST',
        body: JSON.stringify({
          accessCode: accessCode.trim().toUpperCase(),
          schoolName,
          country,
          city,
          contactEmail,
          phone,
          adminFullName,
          adminEmail,
          adminPassword,
          initialSessionName,
        }),
      });
      await refreshSession();
      navigate(res.redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const step1Done = Boolean(codeCheckResult?.valid);
  const step2Done = Boolean(schoolName.trim() && country.trim() && city.trim() && contactEmail.trim());
  const step3Done = Boolean(adminFullName.trim() && adminEmail.trim() && adminPassword.length >= 8);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
        {/* Left Visual Onboarding Guide */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold tracking-wider text-[#2563EB]">
              Authorized School Onboarding
            </p>
            <h1
              className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A]"
              style={{ textWrap: 'balance' }}
            >
              Create Your School Workspace
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Enter the unique access code issued from the Platform Owner’s dashboard to create your isolated school tenant. This code also serves as your School Code when signing in.
            </p>
          </div>

          <VisualMediaFrame
            src={PUBLIC_MEDIA.adminDeskImg}
            alt="School administrator desk with academic schedule and student record folders"
            fallbackTitle="School Workspace Onboarding"
            className="h-52 shadow-md"
          />

          <div className="space-y-3">
            {[
              {
                num: '01',
                title: 'Verify Access Code',
                desc: 'Authorize creation using your Platform Owner code.',
                done: step1Done,
              },
              {
                num: '02',
                title: 'Configure School Profile',
                desc: 'Register your school name, location, and session.',
                done: step2Done,
              },
              {
                num: '03',
                title: 'Launch Admin Portal',
                desc: 'Create the Founding School Administrator login.',
                done: step3Done,
              },
            ].map((step) => (
              <div
                key={step.num}
                className={cn(
                  'elastic-card rounded-xl border p-4 flex items-start gap-3.5 bg-white',
                  step.done ? 'border-emerald-300' : 'border-slate-200',
                )}
              >
                <span
                  className={cn(
                    'tabular-nums text-xs font-mono font-bold rounded-lg px-2 py-1 shrink-0',
                    step.done
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-[#1E3A8A]',
                  )}
                >
                  {step.num}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0F172A]">{step.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                </div>
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-7">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Platform Authorization &amp; School Details</CardTitle>
              <CardDescription>
                A valid unused access code from the Platform Owner is required before creating a school.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
                {error ? <Alert variant="error">{error}</Alert> : null}

                {/* Step 1: Platform Owner Access Code */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1E3A8A]">
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    <span>1. Platform Owner Access Code (Required)</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Obtain this unique code from the Platform Owner’s dashboard. Once your school is created, you will use this same School Code to sign in at{' '}
                    <span className="font-mono">/login/school</span>.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="reg-access-code" className="sr-only">
                        Unique Platform Owner Access Code
                      </Label>
                      <Input
                        id="reg-access-code"
                        required
                        value={accessCode}
                        onChange={(e) => {
                          setAccessCode(e.target.value.toUpperCase());
                          setCodeCheckResult(null);
                        }}
                        placeholder="DT-7K9M2P"
                        className="font-mono uppercase bg-white"
                        maxLength={32}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleVerifyCode()}
                      disabled={verifyingCode}
                      className="bg-white shrink-0"
                    >
                      {verifyingCode ? 'Checking...' : 'Verify Code'}
                    </Button>
                  </div>
                  {codeCheckResult ? (
                    <div
                      className={`flex items-center gap-2 text-xs font-medium ${
                        codeCheckResult.valid ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {codeCheckResult.valid ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : null}
                      <span>{codeCheckResult.message}</span>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[#0F172A] border-b border-slate-100 pb-2">
                    2. Institution Profile
                  </h2>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-school-name">Official School Name</Label>
                    <Input
                      id="reg-school-name"
                      required
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="Rightec International School"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-country">Country</Label>
                      <Input
                        id="reg-country"
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Nigeria"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-city">City</Label>
                      <Input
                        id="reg-city"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Lagos"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-contact-email">Official School Email</Label>
                      <Input
                        id="reg-contact-email"
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="office@school.edu"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-phone">Telephone (Optional)</Label>
                      <Input
                        id="reg-phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+234 800 000 0000"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reg-session-name">Initial Academic Session</Label>
                    <Input
                      id="reg-session-name"
                      value={initialSessionName}
                      onChange={(e) => setInitialSessionName(e.target.value)}
                      placeholder="2026/2027 Academic Session"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-[#0F172A] border-b border-slate-100 pb-2">
                    3. Founding School Administrator Account
                  </h2>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-admin-name">Administrator Full Name</Label>
                    <Input
                      id="reg-admin-name"
                      required
                      value={adminFullName}
                      onChange={(e) => setAdminFullName(e.target.value)}
                      placeholder="Adaeze Okafor"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 items-start">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-admin-email">Administrator Login Email</Label>
                      <Input
                        id="reg-admin-email"
                        type="email"
                        required
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@school.edu"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-admin-password">Administrator Password</Label>
                      <Input
                        id="reg-admin-password"
                        type="password"
                        required
                        minLength={8}
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Create a secure password"
                      />
                      <p className="text-[11px] text-slate-500">
                        Minimum 8 characters, including letters and a number.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                  <Button type="submit" size="lg" disabled={submitting}>
                    {submitting ? 'Creating School Tenant...' : 'Create School Tenant'}
                  </Button>
                  <Link
                    to="/login/school"
                    className="text-sm font-medium text-[#1E3A8A] hover:underline"
                  >
                    Already registered? Sign in with your School Code
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
