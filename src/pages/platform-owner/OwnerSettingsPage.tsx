import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { apiRequest } from '../../lib/api.ts';

interface PlatformSettingsState {
  allowPublicSchoolRegistration: boolean;
  requireAccessCodeForSchoolRegistration: boolean;
  requireSchoolVerificationBanner: boolean;
  sessionTtlHours: number;
}

export function OwnerSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [settingsState, setSettingsState] = useState<PlatformSettingsState>({
    allowPublicSchoolRegistration: true,
    requireAccessCodeForSchoolRegistration: true,
    requireSchoolVerificationBanner: true,
    sessionTtlHours: 24,
  });

  useEffect(() => {
    let active = true;
    apiRequest<PlatformSettingsState>('/api/owner/settings')
      .then((res) => {
        if (!active) return;
        setSettingsState(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load platform settings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const res = await apiRequest<PlatformSettingsState>('/api/owner/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsState),
      });
      setSettingsState(res);
      setSuccessMsg('Platform settings saved and audited.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save platform settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Settings"
        description="Configure tenant onboarding policies and HTTP-only session lifetimes persisted in the platform database."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {successMsg ? <Alert variant="success">{successMsg}</Alert> : null}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Governance & Session Policies</CardTitle>
          <CardDescription>
            Changes take effect immediately across public onboarding and authentication sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading settings...</p>
          ) : (
            <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <Label htmlFor="set-public-reg">Allow Public School Registration</Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Controls whether schools can self-register their institution and admin account at /register.
                  </p>
                </div>
                <input
                  id="set-public-reg"
                  type="checkbox"
                  checked={settingsState.allowPublicSchoolRegistration}
                  onChange={(e) =>
                    setSettingsState((prev) => ({
                      ...prev,
                      allowPublicSchoolRegistration: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300 text-[#1E3A8A]"
                />
              </div>

              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <Label htmlFor="set-require-code">Require Access Code for School Registration</Label>
                  <p className="text-xs text-slate-500 mt-1">
                    When unchecked, any school can create its workspace and Founding Admin account at /register without needing an invite code first.
                  </p>
                </div>
                <input
                  id="set-require-code"
                  type="checkbox"
                  checked={settingsState.requireAccessCodeForSchoolRegistration}
                  onChange={(e) =>
                    setSettingsState((prev) => ({
                      ...prev,
                      requireAccessCodeForSchoolRegistration: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300 text-[#1E3A8A]"
                />
              </div>

              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <Label htmlFor="set-verify-banner">Require School Verification Notice</Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Displays verification guidance inside newly registered pending school dashboards.
                  </p>
                </div>
                <input
                  id="set-verify-banner"
                  type="checkbox"
                  checked={settingsState.requireSchoolVerificationBanner}
                  onChange={(e) =>
                    setSettingsState((prev) => ({
                      ...prev,
                      requireSchoolVerificationBanner: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300 text-[#1E3A8A]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="set-ttl">HTTP-Only Session Lifetime (Hours)</Label>
                <Input
                  id="set-ttl"
                  type="number"
                  min={1}
                  max={168}
                  value={settingsState.sessionTtlHours}
                  onChange={(e) =>
                    setSettingsState((prev) => ({
                      ...prev,
                      sessionTtlHours: Number(e.target.value) || 24,
                    }))
                  }
                  className="max-w-xs font-mono tabular-nums"
                />
              </div>

              <Button type="submit" disabled={saving}>
                {saving ? 'Saving Settings...' : 'Save Platform Settings'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
