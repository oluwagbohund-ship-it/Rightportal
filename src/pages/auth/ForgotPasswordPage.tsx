import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Select } from '../../components/ui/select.tsx';
import { apiRequest } from '../../lib/api.ts';

export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialEnv = searchParams.get('env') === 'workers' ? 'workers' : 'school';

  const [environment, setEnvironment] = useState<'workers' | 'school'>(initialEnv);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResultMessage(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{ ok: boolean; message: string }>(
        '/api/auth/password-reset/request',
        {
          method: 'POST',
          body: JSON.stringify({ email, environment }),
        },
      );
      setResultMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit recovery request.');
    } finally {
      setSubmitting(false);
    }
  };

  const loginLink = environment === 'workers' ? '/login/workers' : '/login/school';

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC] px-4 py-10 text-[#0F172A]">
      <div className="mx-auto w-full max-w-md flex items-center justify-between text-xs text-slate-600">
        <Link to="/" aria-label="Dave Timi EdTech Systems Home">
          <Logo variant="compact" size="xs" />
        </Link>
        <Link to={loginLink} className="font-medium text-[#1E3A8A] hover:underline">
          Back to Sign In
        </Link>
      </div>

      <div className="mx-auto w-full max-w-md my-auto py-8">
        <div className="mb-6 space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#1E3A8A]">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            <span>Account Recovery Architecture</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Request Password Recovery
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Submit a rate-limited password recovery request for your Workers or School Portal account.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verify Account Environment</CardTitle>
            <CardDescription>
              Recovery requests are logged securely without disclosing account existence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {error ? <Alert variant="error">{error}</Alert> : null}
              {resultMessage ? <Alert variant="info">{resultMessage}</Alert> : null}

              <div className="space-y-1.5">
                <Label htmlFor="recovery-env">Portal Environment</Label>
                <Select
                  id="recovery-env"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as 'workers' | 'school')}
                >
                  <option value="school">School Portal (Admin / Teacher / Student / Parent)</option>
                  <option value="workers">DT Workers Environment (Internal Personnel)</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recovery-email">Registered Email Address</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="account@school.edu"
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Recording Request...' : 'Submit Recovery Request'}
              </Button>

              <div className="pt-2 text-center text-xs text-slate-600">
                Already have a one-time recovery token?{' '}
                <Link to="/reset-password" className="font-semibold text-[#1E3A8A] hover:underline">
                  Complete password reset
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto w-full max-w-md text-center text-xs text-slate-500">
        Dave Timi EdTech Systems · Build • Innovate • Transform
      </div>
    </div>
  );
}
