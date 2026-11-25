import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
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

interface PublicOnboardingInfo {
  allowPublicSchoolRegistration?: boolean;
  requireAccessCodeForSchoolRegistration?: boolean;
  ownerClaimed?: boolean;
}

export function RegisterSchoolPage() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();

  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(true);
  const [requireAccessCode, setRequireAccessCode] = useState(true);
  const [ownerClaimed, setOwnerClaimed] = useState<boolean | null>(null);

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
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [initialSessionName, setInitialSessionName] = useState('2026/2027 Academic Session');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/public/info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PublicOnboardingInfo | null) => {
        if (!active || !data) return;
        if (typeof data.allowPublicSchoolRegistration === 'boolean') {
          setAllowPublicRegistration(data.allowPublicSchoolRegistration);
        }
        if (typeof data.requireAccessCodeForSchoolRegistration === 'boolean') {
          setRequireAccessCode(data.requireAccessCodeForSchoolRegistration);
        }
        if (typeof data.ownerClaimed === 'boolean') {
          setOwnerClaimed(data.ownerClaimed);
        }
      })
      .catch(() => {
        // Keep safe defaults
      })
      .finally(() => {
        if (active) setPolicyLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

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

    if (adminPassword.length < 8 || !/[A-Za-z]/.test(adminPassword) || !/[0-9]/.test(adminPassword)) {
      setError('Administrator password must be at least 8 characters and include letters and a number.');
      return;
    }
    if (adminPassword !== adminPasswordConfirm) {
      setError('Administrator passwords do not match. Please confirm your password.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await apiRequest<{ redirectPath: string }>('/api/public/register-school', {
        method: 'POST',
        body: JSON.stringify({
          ...(accessCode.trim() ? { accessCode: accessCode.trim().toUpperCase() } : {}),
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

  const step1Done = requireAccessCode ? Boolean(codeCheckResult?.valid) : Boolean(policyLoaded);
  const step2Done = Boolean(schoolName.trim() && country.trim() && city.trim() && contactEmail.trim());
  const step3Done = Boolean(
    adminFullName.trim() &&
      adminEmail.trim() &&
      adminPassword.length >= 8 &&
      adminPassword === adminPasswordConfirm,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
        {/* Left Visual Onboarding Guide */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold tracking-tight text-[#2563EB]">
              School &amp; Founding Admin Onboarding
            </p>
            <h1
              className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A]"
              style={{ textWrap: 'balance' }}
            >
              Create Your School &amp; Admin Account
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {requireAccessCode
                ? 'Enter the unique access code issued from the Platform Owner’s dashboard to create your isolated school workspace and Founding School Administrator login.'
                : 'Register your institution below to create your isolated school workspace, auto-generate your School Code, and launch your Founding School Administrator account immediately.'}
            </p>
          </div>

          <VisualMediaFrame
            src={PUBLIC_MEDIA.adminDeskImg}
            alt="School administrator desk with academic schedule and student record folders"
            fallbackTitle="School Workspace Onboarding"
            className="h-52 border border-slate-200"
          />

          <div className="space-y-3">
            {[
              ...(requireAccessCode
                ? [
                    {
                      num: '01',
                      title: 'Verify Access Code',
                      desc: 'Authorize creation using your Platform Owner code.',
                      done: step1Done,
                    },
                  ]
                : []),
              {
                num: requireAccessCode ? '02' : '01',
                title: 'Configure School Profile',
                desc: 'Register your school name, location, and academic session.',
                done: step2Done,
              },
              {
                num: requireAccessCode ? '03' : '02',
                title: 'Create Founding Admin Account',
                desc: 'Set up your School Administrator email and password.',
                done: step3Done,
              },
            ].map((step) => (
              <div
                key={step.num}
                className={cn(
                  'rounded-xl border p-4 flex items-start gap-3.5 bg-white transition-colors',
                  step.done ? 'border-emerald-300' : 'border-slate-200',
                )}
              >
                <span
                  className={cn(
                    'tabular-nums text-xs font-mono font-bold rounded-md px-2 py-1 shrink-0',
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
        <div className="lg:col-span-7 space-y-4">
          {ownerClaimed === false ? (
            <div className="rounded-xl border border-blue-200 bg-[#EFF6FF] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5 text-xs text-[#1E3A8A]">
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-[#2563EB]" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Are you the Platform Owner?</p>
                  <p className="text-slate-600 mt-0.5">
                    Create your first Platform Owner account first so you can issue School Access Codes, create schools directly, or enable open registration.
                  </p>
                </div>
              </div>
              <Link to="/login/workers" className="shrink-0">
                <Button type="button" size="sm">
                  Create Owner Account
                </Button>
              </Link>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                {requireAccessCode
                  ? 'Platform Authorization, School & Admin Details'
                  : 'School Workspace & Founding Admin Account'}
              </CardTitle>
              <CardDescription>
                {requireAccessCode
                  ? 'A valid unused access code from the Platform Owner is required before creating a school and its admin account.'
                  : 'Complete your institution details and Founding School Administrator credentials to launch immediately.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!allowPublicRegistration ? (
                <Alert variant="error">
                  Public school self-registration is currently paused by platform administration. Please contact the Platform Owner to issue or provision your school workspace.
                </Alert>
              ) : (
                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
                  {error ? <Alert variant="error">{error}</Alert> : null}

                  {/* Step 1: Platform Owner Access Code (Required or Optional depending on owner policy) */}
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1E3A8A]">
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {requireAccessCode
                          ? '1. Platform Owner Access Code (Required)'
                          : 'Platform Owner Invite Code (Optional)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {requireAccessCode
                        ? 'Obtain this unique code from the Platform Owner’s dashboard. Once your school is created, you will use this same School Code to sign in at '
                        : 'If the Platform Owner issued you an invite code, enter it below. Otherwise leave blank to automatically generate a unique School Code for '}
                      <span className="font-mono">/login/school</span>.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="reg-access-code" className="sr-only">
                          Unique Platform Owner Access Code
                        </Label>
                        <Input
                          id="reg-access-code"
                          required={requireAccessCode}
                          value={accessCode}
                          onChange={(e) => {
                            setAccessCode(e.target.value.toUpperCase());
                            setCodeCheckResult(null);
                          }}
                          placeholder={requireAccessCode ? 'DT-7K9M2P' : 'Optional invite code (e.g. DT-7K9M2P)'}
                          className="font-mono uppercase bg-white"
                          maxLength={32}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleVerifyCode()}
                        disabled={verifyingCode || (!requireAccessCode && !accessCode.trim())}
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
                      {requireAccessCode ? '2. Institution Profile' : '1. Institution Profile'}
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
                      {requireAccessCode
                        ? '3. Founding School Administrator Account'
                        : '2. Founding School Administrator Account'}
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2">
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
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 items-start">
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
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-admin-password-confirm">Confirm Password</Label>
                        <Input
                          id="reg-admin-password-confirm"
                          type="password"
                          required
                          minLength={8}
                          value={adminPasswordConfirm}
                          onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                          placeholder="Re-enter administrator password"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <Button type="submit" size="lg" disabled={submitting}>
                      {submitting ? 'Creating School & Admin...' : 'Create School & Admin Account'}
                    </Button>
                    <Link
                      to="/login/school"
                      className="text-sm font-medium text-[#1E3A8A] hover:underline"
                    >
                      Already registered? Sign in with your School Code
                    </Link>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

