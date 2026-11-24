import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo.tsx';
import { TelegramBotConnectCard } from '../../components/shared/TelegramBotConnectCard.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';

export function WorkersLoginPage() {
  const { user, loading: authLoading, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [statusLoading, setStatusLoading] = useState(true);
  const [ownerClaimed, setOwnerClaimed] = useState(true);
  const [requiresBootstrapKey, setRequiresBootstrapKey] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapKey, setBootstrapKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ ownerClaimed: boolean; requiresBootstrapKey: boolean }>(
      '/api/auth/workers/bootstrap-status',
    )
      .then((res) => {
        if (!active) return;
        setOwnerClaimed(res.ownerClaimed);
        setRequiresBootstrapKey(res.requiresBootstrapKey);
      })
      .catch(() => {
        if (!active) return;
        setOwnerClaimed(true);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!authLoading && user && user.authEnvironment === 'workers') {
    return <Navigate to="/dashboard/owner" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ redirectPath: string }>('/api/auth/workers/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await refreshSession();
      navigate(res.redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ redirectPath: string }>('/api/auth/workers/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          password,
          bootstrapKey: requiresBootstrapKey ? bootstrapKey : undefined,
        }),
      });
      await refreshSession();
      navigate(res.redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize owner account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#0F172A] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-md flex items-center justify-between text-xs text-slate-400">
        <Logo variant="white" size="xs" />
        <Link to="/" className="hover:text-white transition-colors">
          Return to Public Site
        </Link>
      </div>

      <div className="mx-auto w-full max-w-md my-auto py-8">
        <div className="mb-6 space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#60A5FA]">
            <Shield className="h-4 w-4" aria-hidden="true" />
            <span>Internal Platform Operations</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            DAVE TIMI EDTECH WORKERS LOGIN
          </h1>
          <p className="text-sm font-medium text-slate-300">Authorized Workforce Access.</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            This environment is exclusively for authorized DT platform personnel.
          </p>
        </div>

        <Card className="border-slate-800 bg-white text-[#0F172A] shadow-xl">
          {statusLoading ? (
            <CardContent className="p-6 text-sm text-slate-500">
              Checking workforce environment status...
            </CardContent>
          ) : !ownerClaimed ? (
            <>
              <CardHeader>
                <CardTitle>Initialize Platform Owner</CardTitle>
                <CardDescription>
                  No Platform Owner account has been claimed yet. Create the founding owner credentials to lock bootstrap initialization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void handleBootstrap(e)} className="space-y-4">
                  {error ? <Alert variant="error">{error}</Alert> : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="owner-name">Full Name</Label>
                    <Input
                      id="owner-name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="David Oluwagbohun"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="owner-email">Workforce Email</Label>
                    <Input
                      id="owner-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="owner@davetimi.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="owner-password">
                      Password (min 10 chars, 1 uppercase, 1 number)
                    </Label>
                    <Input
                      id="owner-password"
                      type="password"
                      required
                      minLength={10}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create Platform Owner password"
                    />
                  </div>

                  {requiresBootstrapKey ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="owner-key">Bootstrap Security Key</Label>
                      <Input
                        id="owner-key"
                        type="password"
                        required
                        value={bootstrapKey}
                        onChange={(e) => setBootstrapKey(e.target.value)}
                        placeholder="Enter DT_BOOTSTRAP_KEY"
                      />
                    </div>
                  ) : null}

                  <Button type="submit" variant="navy" className="w-full" disabled={submitting}>
                    {submitting ? 'Initializing Owner Access...' : 'Claim Platform Owner Access'}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Workforce Sign In</CardTitle>
                <CardDescription>
                  Authenticate with your authorized DT platform personnel credentials.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
                  {error ? <Alert variant="error">{error}</Alert> : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="worker-email">DT Workforce Email</Label>
                    <Input
                      id="worker-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="personnel@davetimi.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="worker-password">Password</Label>
                    <Input
                      id="worker-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                    />
                  </div>

                  <Button type="submit" variant="navy" className="w-full" disabled={submitting}>
                    {submitting ? 'Verifying Credentials...' : 'Sign In to Workers Console'}
                  </Button>
                  <div className="text-center pt-1">
                    <Link
                      to="/forgot-password?env=workers"
                      className="text-xs font-medium text-[#1E3A8A] hover:underline"
                    >
                      Forgot workforce password?
                    </Link>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        <div className="mt-4">
          <TelegramBotConnectCard mode="login" audience="workers" darkSurface />
        </div>
      </div>

      <div className="mx-auto w-full max-w-md text-center text-xs text-slate-500">
        All authentication attempts are recorded in the platform security audit log.
      </div>
    </div>
  );
}
