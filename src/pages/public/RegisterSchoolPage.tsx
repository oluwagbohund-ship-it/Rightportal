import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';

export function RegisterSchoolPage() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{ redirectPath: string }>('/api/public/register-school', {
        method: 'POST',
        body: JSON.stringify({
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="space-y-2 mb-8">
        <p className="text-xs font-semibold tracking-wider text-[#2563EB]">
          School Onboarding
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">
          Register an Independent School Tenant
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Creates an isolated school workspace, assigns your School Administrator credentials, and establishes your initial academic session.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Institution & Administrator Details</CardTitle>
          <CardDescription>
            Your session will open directly into your School Administrator workspace via an HTTP-only cookie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
            {error ? <Alert variant="error">{error}</Alert> : null}

            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#0F172A] border-b border-slate-100 pb-2">
                1. Institution Profile
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
                2. Founding School Administrator Account
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
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <Label htmlFor="reg-admin-password">
                    Password (min 8 chars, include letters & a number)
                  </Label>
                  <Input
                    id="reg-admin-password"
                    type="password"
                    required
                    minLength={8}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Create a secure password"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
              <Button type="submit" size="lg" disabled={submitting}>
                {submitting ? 'Provisioning Tenant...' : 'Create School Tenant'}
              </Button>
              <Link
                to="/login/school"
                className="text-sm font-medium text-[#1E3A8A] hover:underline"
              >
                Already registered? Sign in to School Portal
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
