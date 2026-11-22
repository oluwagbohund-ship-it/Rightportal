import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { getDashboardPathForRole } from '../../lib/utils.ts';

export function SchoolLoginPage() {
  const { user, loading: authLoading, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [schoolCode, setSchoolCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authLoading && user && user.authEnvironment === 'school') {
    return <Navigate to={getDashboardPathForRole(user.roleCode)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{ redirectPath: string }>('/api/auth/school/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          schoolCode: schoolCode.trim() ? schoolCode.trim() : undefined,
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

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC] px-4 py-10 text-[#0F172A]">
      <div className="mx-auto w-full max-w-md flex items-center justify-between text-xs text-slate-600">
        <Link to="/" aria-label="Dave Timi EdTech Systems Home">
          <Logo variant="compact" size="xs" />
        </Link>
        <Link to="/register" className="font-medium text-[#1E3A8A] hover:underline">
          Register a New School
        </Link>
      </div>

      <div className="mx-auto w-full max-w-md my-auto py-8">
        <div className="mb-6 space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#1E3A8A]">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            <span>Institutional School Access</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">School Portal Login</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Sign in as a School Administrator, Teacher, Student, or Parent to access your institution’s isolated workspace.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In to Your School</CardTitle>
            <CardDescription>
              Your role and school tenant permissions are verified automatically by the server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {error ? <Alert variant="error">{error}</Alert> : null}

              <div className="space-y-1.5">
                <Label htmlFor="school-login-code">School Code (Optional)</Label>
                <Input
                  id="school-login-code"
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value)}
                  placeholder="e.g. DT-A1B2C3"
                  className="font-mono uppercase"
                />
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
                {submitting ? 'Signing In...' : 'Sign In to School Portal'}
              </Button>
              <div className="text-center pt-1">
                <Link
                  to="/forgot-password?env=school"
                  className="text-xs font-medium text-[#1E3A8A] hover:underline"
                >
                  Forgot your password?
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
