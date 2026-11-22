import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';

export function StudentAccountPage() {
  const { user, rotateSession } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('Enrolled Student');
  const [status, setStatus] = useState('active');
  const [rotating, setRotating] = useState(false);
  const [sessionMsg, setSessionMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ profile: { title: string; status: string } | null }>('/api/school/student-workspace')
      .then((res) => {
        if (!active) return;
        if (res.profile?.title) setTitle(res.profile.title);
        if (res.profile?.status) setStatus(res.profile.status);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load student account details.');
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
        ? 'Session cookie rotated successfully.'
        : 'Unable to rotate session right now.',
    );
    setRotating(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account & Security"
        description="Verified student account identity, tenant boundary, and session controls."
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

      <Card>
        <CardHeader>
          <CardTitle>Student Account Details</CardTitle>
          <CardDescription>
            Authenticated HTTP-only cookie session scoped to your enrolled school.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm text-slate-600">
          <p>
            <span className="font-semibold text-[#0F172A]">Student Name:</span> {user?.fullName}
          </p>
          <p>
            <span className="font-semibold text-[#0F172A]">Email:</span> {user?.email}
          </p>
          <p>
            <span className="font-semibold text-[#0F172A]">Classification:</span>{' '}
            {loading ? 'Loading...' : title}
          </p>
          <p>
            <span className="font-semibold text-[#0F172A]">School:</span> {user?.activeSchoolName} (
            {user?.activeSchoolCode})
          </p>
          <p>
            <span className="font-semibold text-[#0F172A]">Membership Status:</span>{' '}
            <span className="capitalize">{status}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
