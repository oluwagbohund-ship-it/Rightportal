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
import type { SchoolMemberRecord } from '../../types/app.ts';

export function SchoolMembersPage() {
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
  const [members, setMembers] = useState<SchoolMemberRecord[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const [memName, setMemName] = useState('');
  const [memEmail, setMemEmail] = useState('');
  const [memPassword, setMemPassword] = useState('');
  const [memRole, setMemRole] = useState<'teacher' | 'student' | 'parent' | 'school_admin'>(
    'teacher',
  );
  const [memTitle, setMemTitle] = useState('');
  const [memSaving, setMemSaving] = useState(false);

  const reloadMembers = async () => {
    const res = await apiRequest<{ members: SchoolMemberRecord[] }>('/api/school/members');
    setMembers(res.members);
  };

  useEffect(() => {
    let active = true;
    apiRequest<{ members: SchoolMemberRecord[] }>('/api/school/members')
      .then((res) => {
        if (!active) return;
        setMembers(res.members);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load school directory.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setMemSaving(true);
    try {
      await apiRequest('/api/school/members', {
        method: 'POST',
        body: JSON.stringify({
          fullName: memName,
          email: memEmail,
          password: memPassword,
          roleCode: memRole,
          title: memTitle,
        }),
      });
      setMemName('');
      setMemEmail('');
      setMemPassword('');
      setMemTitle('');
      setActionMsg('School member account created inside your tenant.');
      await reloadMembers();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to create member account.');
    } finally {
      setMemSaving(false);
    }
  };

  const handleToggleStatus = async (member: SchoolMemberRecord) => {
    setActionErr(null);
    setActionMsg(null);
    const nextStatus = member.membership_status === 'active' ? 'suspended' : 'active';
    try {
      await apiRequest(`/api/school/members/${member.membership_id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setActionMsg(
        `${member.full_name} is now ${nextStatus === 'active' ? 'active' : 'suspended (all sessions revoked)'}.`,
      );
      await reloadMembers();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to update member status.');
    }
  };

  const handleIssueRecovery = async (member: SchoolMemberRecord) => {
    setActionErr(null);
    setActionMsg(null);
    setRecoveryResult(null);
    try {
      const res = await apiRequest<{
        email: string;
        recoveryPath: string;
        expiresAt: string;
      }>(`/api/school/members/${member.membership_id}/recovery-token`, {
        method: 'POST',
      });
      setRecoveryResult(res);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to issue recovery link.');
    }
  };

  const filteredMembers =
    roleFilter === 'all' ? members : members.filter((m) => m.role_code === roleFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members & Roles"
        description="Provision, suspend, and issue one-time recovery links for Teacher, Student, Parent, and Co-Administrator accounts strictly isolated to your institution."
        actions={
          <div className="w-full sm:w-48">
            <Select
              aria-label="Filter members by role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="school_admin">School Admin</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="parent">Parent / Guardian</option>
            </Select>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {actionErr ? <Alert variant="error">{actionErr}</Alert> : null}
      {actionMsg ? <Alert variant="success">{actionMsg}</Alert> : null}

      {recoveryResult ? (
        <Alert variant="info" title={`One-Time Recovery Link Issued for ${recoveryResult.email}`}>
          <p className="text-xs text-slate-700 mb-1">
            Valid for 30 minutes. Share this one-time link securely with the school member:
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
            <CardTitle>Add School Member</CardTitle>
            <CardDescription>
              Provision accounts strictly within {user?.activeSchoolName ?? 'your school'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleCreateMember(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mem-name">Full Name</Label>
                <Input
                  id="mem-name"
                  required
                  value={memName}
                  onChange={(e) => setMemName(e.target.value)}
                  placeholder="Samuel Adeyemi"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-email">Email Address</Label>
                <Input
                  id="mem-email"
                  type="email"
                  required
                  value={memEmail}
                  onChange={(e) => setMemEmail(e.target.value)}
                  placeholder="teacher@school.edu"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-role">Role</Label>
                <Select
                  id="mem-role"
                  value={memRole}
                  onChange={(e) =>
                    setMemRole(
                      e.target.value as 'teacher' | 'student' | 'parent' | 'school_admin',
                    )
                  }
                >
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                  <option value="parent">Parent / Guardian</option>
                  <option value="school_admin">School Administrator</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-title">Department / Grade / Title (Optional)</Label>
                <Input
                  id="mem-title"
                  value={memTitle}
                  onChange={(e) => setMemTitle(e.target.value)}
                  placeholder="e.g. Mathematics Faculty"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-password">Initial Password (min 8 chars)</Label>
                <Input
                  id="mem-password"
                  type="password"
                  required
                  minLength={8}
                  value={memPassword}
                  onChange={(e) => setMemPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={memSaving} className="w-full">
                {memSaving ? 'Creating Account...' : 'Create Member Account'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>School Directory</CardTitle>
            <CardDescription>
              Members scoped to {user?.activeSchoolName} ({user?.activeSchoolCode}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading directory...</p>
            ) : filteredMembers.length === 0 ? (
              <p className="text-sm text-slate-500">No members match the selected filter.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Controls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((m) => {
                    const isActive = m.membership_status === 'active';
                    const isSelf = m.user_id === user?.id;
                    return (
                      <TableRow key={m.membership_id}>
                        <TableCell>
                          <p className="font-semibold text-[#0F172A]">{m.full_name}</p>
                          <p className="text-xs text-slate-500">
                            {m.email}
                            {m.title ? ` · ${m.title}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{m.role_name}</TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-semibold capitalize ${
                              isActive ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {m.membership_status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            {isActive ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleIssueRecovery(m)}
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
                                onClick={() => void handleToggleStatus(m)}
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
