import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Select } from '../../components/ui/select.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { WorkforceMember } from '../../types/app.ts';

export function OwnerWorkforcePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<{
    email: string;
    recoveryPath: string;
    expiresAt: string;
  } | null>(null);
  const [workforce, setWorkforce] = useState<WorkforceMember[]>([]);

  const [wfName, setWfName] = useState('');
  const [wfEmail, setWfEmail] = useState('');
  const [wfPassword, setWfPassword] = useState('');
  const [wfRole, setWfRole] = useState<'workforce_admin' | 'workforce_support'>('workforce_admin');
  const [wfDept, setWfDept] = useState('School Onboarding');
  const [submitting, setSubmitting] = useState(false);

  const loadWorkforce = async () => {
    const res = await apiRequest<{ workforce: WorkforceMember[] }>('/api/owner/workforce');
    setWorkforce(res.workforce);
  };

  useEffect(() => {
    let active = true;
    apiRequest<{ workforce: WorkforceMember[] }>('/api/owner/workforce')
      .then((res) => {
        if (!active) return;
        setWorkforce(res.workforce);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load workforce directory.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setSubmitting(true);
    try {
      await apiRequest('/api/owner/workforce', {
        method: 'POST',
        body: JSON.stringify({
          fullName: wfName,
          email: wfEmail,
          password: wfPassword,
          roleCode: wfRole,
          department: wfDept,
        }),
      });
      setWfName('');
      setWfEmail('');
      setWfPassword('');
      setActionMsg('Workforce member account provisioned.');
      await loadWorkforce();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Failed to provision workforce user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (member: WorkforceMember) => {
    setActionErr(null);
    setActionMsg(null);
    const nextActive = member.is_active !== 1;
    try {
      await apiRequest(`/api/owner/workforce/${member.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextActive }),
      });
      setActionMsg(
        `${member.full_name} is now ${nextActive ? 'active' : 'suspended (all sessions revoked)'}.`,
      );
      await loadWorkforce();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to update workforce status.');
    }
  };

  const handleIssueRecovery = async (member: WorkforceMember) => {
    setActionErr(null);
    setActionMsg(null);
    setRecoveryResult(null);
    try {
      const res = await apiRequest<{
        email: string;
        recoveryPath: string;
        expiresAt: string;
      }>(`/api/owner/workforce/${member.id}/recovery-token`, { method: 'POST' });
      setRecoveryResult(res);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to issue recovery link.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workforce Management"
        description="Provision, suspend, and issue one-time recovery links for DT platform personnel inside DAVE TIMI EDTECH WORKERS LOGIN."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {actionErr ? <Alert variant="error">{actionErr}</Alert> : null}
      {actionMsg ? <Alert variant="success">{actionMsg}</Alert> : null}

      {recoveryResult ? (
        <Alert variant="info" title={`One-Time Recovery Link Issued for ${recoveryResult.email}`}>
          <p className="text-xs text-slate-700 mb-1">
            Expires in 30 minutes. Share this one-time link securely with the personnel member:
          </p>
          <p className="font-mono text-xs break-all bg-white border border-slate-200 rounded px-2.5 py-1.5 text-[#0F172A]">
            {recoveryResult.recoveryPath}
          </p>
          <div className="mt-2">
            <Link
              to={recoveryResult.recoveryPath}
              className="text-xs font-semibold text-[#1E3A8A] hover:underline"
            >
              Open Reset Password Page
            </Link>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Provision DT Workforce Account</CardTitle>
            <CardDescription>
              Create authorized internal accounts for the Workers Login portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleProvision(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wf-name">Full Name</Label>
                <Input
                  id="wf-name"
                  required
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  placeholder="Timi Adebayo"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-email">Workforce Email</Label>
                <Input
                  id="wf-email"
                  type="email"
                  required
                  value={wfEmail}
                  onChange={(e) => setWfEmail(e.target.value)}
                  placeholder="ops@davetimi.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-role">Role</Label>
                <Select
                  id="wf-role"
                  value={wfRole}
                  onChange={(e) =>
                    setWfRole(e.target.value as 'workforce_admin' | 'workforce_support')
                  }
                >
                  <option value="workforce_admin">DT Workforce Administrator</option>
                  <option value="workforce_support">DT Workforce Support</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-dept">Department</Label>
                <Input
                  id="wf-dept"
                  required
                  value={wfDept}
                  onChange={(e) => setWfDept(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-password">Initial Password (min 10 chars)</Label>
                <Input
                  id="wf-password"
                  type="password"
                  required
                  minLength={10}
                  value={wfPassword}
                  onChange={(e) => setWfPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Provisioning...' : 'Create Workforce Account'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Authorized Personnel Directory</CardTitle>
            <CardDescription>
              Internal accounts permitted inside DAVE TIMI EDTECH WORKERS LOGIN.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading workforce directory...</p>
            ) : workforce.length === 0 ? (
              <p className="text-sm text-slate-500">No workforce accounts found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role & Dept</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Controls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workforce.map((member) => {
                    const isActive = member.is_active === 1;
                    const isSelf = member.id === user?.id;
                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <p className="font-semibold text-[#0F172A]">{member.full_name}</p>
                          <p className="text-xs text-slate-500">{member.email}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium text-[#0F172A]">{member.role_name}</p>
                          <p className="text-xs text-slate-500">{member.department}</p>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-semibold ${isActive ? 'text-emerald-700' : 'text-red-700'}`}
                          >
                            {isActive ? 'Active' : 'Suspended'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            {isActive ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleIssueRecovery(member)}
                              >
                                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Recovery</span>
                              </Button>
                            ) : null}
                            {!isSelf ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={isActive ? 'outline' : 'default'}
                                onClick={() => void handleToggleStatus(member)}
                              >
                                {isActive ? 'Suspend' : 'Activate'}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
