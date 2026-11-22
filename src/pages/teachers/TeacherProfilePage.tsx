import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';

export function TeacherProfilePage() {
  const { user, rotateSession } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileTitle, setProfileTitle] = useState('Faculty Educator');
  const [membershipStatus, setMembershipStatus] = useState('active');
  const [rotating, setRotating] = useState(false);
  const [sessionMsg, setSessionMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ profile: { title: string; status: string } | null }>('/api/school/teacher-workspace')
      .then((res) => {
        if (!active) return;
        if (res.profile?.title) setProfileTitle(res.profile.title);
        if (res.profile?.status) setMembershipStatus(res.profile.status);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to verify educator profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRotate = async () => {
    setRotating(true);
    setSessionMsg(null);
    const ok = await rotateSession();
    setSessionMsg(
      ok
        ? 'Session token rotated cleanly; previous cookie invalidated.'
        : 'Unable to rotate session right now.',
    );
    setRotating(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Role & Access"
        description="Authenticated faculty profile, active school tenant boundary, and granted server-side RBAC permissions."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rotating}
            onClick={() => void handleRotate()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{rotating ? 'Rotating...' : 'Rotate Session'}</span>
          </Button>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {sessionMsg ? <Alert variant="info">{sessionMsg}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Authorized Educator Profile</CardTitle>
            <CardDescription>Verified identity and tenant membership record.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-[#0F172A]">Full Name:</span> {user?.fullName}
            </p>
            <p>
              <span className="font-semibold text-[#0F172A]">Email Address:</span> {user?.email}
            </p>
            <p>
              <span className="font-semibold text-[#0F172A]">Designation:</span>{' '}
              {loading ? 'Loading...' : profileTitle}
            </p>
            <p>
              <span className="font-semibold text-[#0F172A]">School Tenant:</span>{' '}
              {user?.activeSchoolName} ({user?.activeSchoolCode})
            </p>
            <p>
              <span className="font-semibold text-[#0F172A]">Membership Status:</span>{' '}
              <span className="capitalize">{membershipStatus}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Granted Permissions</CardTitle>
            <CardDescription>
              Server-enforced capabilities assigned to the {user?.roleName} role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user?.permissions.length ? (
              <ul className="space-y-2 text-xs font-mono text-slate-700">
                {user.permissions.map((perm) => (
                  <li
                    key={perm}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    {perm}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No explicit permissions assigned.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
