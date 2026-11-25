import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, KeyRound, QrCode, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo.tsx';
import { QrCameraScanner } from '../../components/shared/QrCameraScanner.tsx';
import { TelegramBotConnectCard } from '../../components/shared/TelegramBotConnectCard.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { getDashboardPathForRole } from '../../lib/utils.ts';

type LoginMode = 'credentials' | 'id_card';

export function SchoolLoginPage() {
  const { user, loading: authLoading, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [loginMode, setLoginMode] = useState<LoginMode>('credentials');
  const [schoolCode, setSchoolCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerClaimed, setOwnerClaimed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/public/info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ownerClaimed?: boolean } | null) => {
        if (!active || !data || typeof data.ownerClaimed !== 'boolean') return;
        setOwnerClaimed(data.ownerClaimed);
      })
      .catch(() => {
        // Ignore non-critical info check
      });
    return () => {
      active = false;
    };
  }, []);

  if (!authLoading && user && user.authEnvironment === 'school') {
    return <Navigate to={getDashboardPathForRole(user.roleCode)} replace />;
  }

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{ redirectPath: string }>('/api/auth/school/login', {
        method: 'POST',
        body: JSON.stringify({
          schoolCode: schoolCode.trim().toUpperCase(),
          email,
          password,
        }),
      });
      await refreshSession();
      navigate(res.redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQrLogin = async (qrToken: string) => {
    setError(null);
    setSubmitting(true);

    try {
      const normalizedCode = schoolCode.trim().toUpperCase();
      const res = await apiRequest<{ redirectPath: string }>('/api/auth/school/qr-login', {
        method: 'POST',
        body: {
          qrToken,
          ...(normalizedCode ? { schoolCode: normalizedCode } : {}),
        },
      });
      await refreshSession();
      navigate(res.redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in with Student Digital ID card.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC] text-[#0F172A]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8 text-xs text-slate-600">
          <a href="/index.html" aria-label="Dave Timi EdTech Systems Home">
            <Logo variant="compact" size="xs" />
          </a>
          <div className="flex items-center gap-4">
            <a href="/register.html" className="font-medium text-[#1E3A8A] hover:underline whitespace-nowrap">
              Create School &amp; Admin
            </a>
            <Link to="/login/workers" className="text-slate-600 hover:text-[#0F172A] whitespace-nowrap font-medium">
              {ownerClaimed === false ? 'Create Owner Account' : 'Owner Portal'}
            </Link>
          </div>
        </div>
      </header>

      {ownerClaimed === false ? (
        <div className="border-b border-blue-200 bg-[#EFF6FF]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8 text-xs text-[#1E3A8A]">
            <span>
              <strong>First-Time Setup:</strong> Platform Owner account has not been created yet.
            </span>
            <Link
              to="/login/workers"
              className="rounded-md bg-[#1E3A8A] px-3 py-1 font-semibold text-white hover:bg-[#1E40AF] transition-colors"
            >
              Create First Platform Owner Account
            </Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl flex-1 flex items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-10 lg:grid-cols-12 lg:items-center">
          {/* Left Institutional Briefing */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <span>Authorized School Tenant Access</span>
              </div>
              <h1
                className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A] leading-[1.1]"
                style={{ textWrap: 'balance' }}
              >
                School Portal Login
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg">
                Sign in with your school credentials or scan a Student Digital ID Card QR pass to access your institution&apos;s isolated workspace.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3.5 max-w-lg">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                <ShieldCheck className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                <span>Four Scoped School Roles Supported</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 text-xs text-slate-600">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="text-[#0F172A]">School Admin</strong> · Governance &amp; billing</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="text-[#0F172A]">Teachers</strong> · Attendance &amp; grading</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="text-[#0F172A]">Students</strong> · Results, ID &amp; CBT</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong className="text-[#0F172A]">Parents</strong> · Wards &amp; report cards</span>
                </div>
              </div>
            </div>

            <div className="max-w-lg">
              <TelegramBotConnectCard mode="login" audience="school" />
            </div>
          </div>

          {/* Right Sign-In Form */}
          <div className="lg:col-span-6 lg:max-w-md lg:w-full lg:ml-auto">
            <Card>
              <CardHeader className="space-y-4">
                <div>
                  <CardTitle>Sign In to Your School</CardTitle>
                  <CardDescription>
                    Choose standard credential login or Student Digital ID QR verification.
                  </CardDescription>
                </div>

                <div
                  role="tablist"
                  aria-label="School sign-in method"
                  className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginMode === 'credentials'}
                    onClick={() => {
                      setLoginMode('credentials');
                      setError(null);
                    }}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      loginMode === 'credentials'
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    Credentials
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginMode === 'id_card'}
                    onClick={() => {
                      setLoginMode('id_card');
                      setError(null);
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      loginMode === 'id_card'
                        ? 'bg-white text-[#1E3A8A] shadow-xs'
                        : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>ID Card QR</span>
                  </button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {error ? <Alert variant="error">{error}</Alert> : null}

                {loginMode === 'credentials' ? (
                  <form onSubmit={(e) => void handleCredentialsSubmit(e)} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="school-login-code">Unique School Code</Label>
                      <Input
                        id="school-login-code"
                        required
                        value={schoolCode}
                        onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                        placeholder="DT-7K9M2P"
                        className="font-mono uppercase"
                        maxLength={32}
                      />
                      <p className="text-[11px] text-slate-500">
                        Required to enter the platform. Issued from the Platform Owner’s dashboard.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="school-login-email">Email Address</Label>
                      <Input
                        id="school-login-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="member@school.edu"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="school-login-password">Password</Label>
                      <Input
                        id="school-login-password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? 'Verifying School Code...' : 'Sign In to School Portal'}
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <QrCameraScanner
                      onScan={handleQrLogin}
                      busy={submitting}
                      helperText="Position your Student Digital ID Card QR code in front of your device camera to sign in instantly."
                    />
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 pt-3 border-t border-slate-100 text-xs">
                  <Link
                    to="/forgot-password?env=school"
                    className="font-medium text-[#1E3A8A] hover:underline"
                  >
                    Forgot your password?
                  </Link>
                  <a
                    href="/register.html"
                    className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-[#1E3A8A] hover:underline"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>New school? Create your School &amp; Admin Account</span>
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-4 text-center text-xs text-slate-500">
        Dave Timi EdTech Systems · Build • Innovate • Transform
      </footer>
    </div>
  );
}
