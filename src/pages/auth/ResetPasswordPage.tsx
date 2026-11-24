import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { apiRequest } from '../../lib/api.ts';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('token') ?? '';

  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedRedirect, setCompletedRedirect] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; redirectPath: string }>(
        '/api/auth/password-reset/confirm',
        {
          method: 'POST',
          body: JSON.stringify({ token, newPassword }),
        },
      );
      setCompletedRedirect(res.redirectPath);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC] px-4 py-10 text-[#0F172A]">
      <div className="mx-auto w-full max-w-md flex items-center justify-between text-xs text-slate-600">
        <Link to="/" aria-label="Dave Timi EdTech Systems Home">
          <Logo variant="compact" size="xs" />
        </Link>
        <Link to="/login/school" className="font-medium text-[#1E3A8A] hover:underline">
          School Login
        </Link>
      </div>

      <div className="mx-auto w-full max-w-md my-auto py-8">
        <div className="mb-6 space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>One-Time Token Verification</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
            Set a New Password
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Completing password recovery rotates your credentials and revokes all prior active sessions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Confirm Password Reset</CardTitle>
            <CardDescription>
              Paste the one-time recovery token issued by your administrator or Platform Owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {completedRedirect ? (
              <div className="space-y-4">
                <Alert variant="success" title="Password Updated">
                  Your password has been updated and all prior sessions were revoked. Sign in with your new credentials.
                </Alert>
                <Link
                  to={completedRedirect}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#1E3A8A] px-4 text-sm font-medium text-white hover:bg-[#172554]"
                >
                  Continue to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                {error ? <Alert variant="error">{error}</Alert> : null}

                <div className="space-y-1.5">
                  <Label htmlFor="reset-token">One-Time Recovery Token</Label>
                  <Input
                    id="reset-token"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste recovery token"
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reset-password">
                    New Password (min 8 chars, letters & numbers; 10+ & uppercase for Workers)
                  </Label>
                  <Input
                    id="reset-password"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reset-password-confirm">Confirm New Password</Label>
                  <Input
                    id="reset-password-confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Updating Password...' : 'Confirm Password Reset'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto w-full max-w-md text-center text-xs text-slate-500">
        Dave Timi EdTech Systems · Build • Innovate • Transform
      </div>
    </div>
  );
}
