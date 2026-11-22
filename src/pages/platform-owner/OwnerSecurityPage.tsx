import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.tsx';
import { apiRequest } from '../../lib/api.ts';
import { formatUtcTimestamp } from '../../lib/utils.ts';
import type { AuditLogRecord, PasswordResetEvent, RateLimitLockout } from '../../types/app.ts';

interface SecurityPayload {
  activeSessions: Array<{
    id: string;
    auth_environment: string;
    user_email: string;
    user_name: string;
    school_name: string | null;
    ip_address: string;
    created_at: string;
    expires_at: string;
    rotated_at?: string | null;
  }>;
  deniedEvents: AuditLogRecord[];
  inquiries: Array<{
    id: string;
    full_name: string;
    email: string;
    organization: string;
    subject: string;
    message: string;
    status: string;
    created_at: string;
  }>;
  rateLimitLockouts: RateLimitLockout[];
  passwordResetEvents: PasswordResetEvent[];
}

export function OwnerSecurityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [data, setData] = useState<SecurityPayload>({
    activeSessions: [],
    deniedEvents: [],
    inquiries: [],
    rateLimitLockouts: [],
    passwordResetEvents: [],
  });

  const loadSecurity = useCallback(async () => {
    try {
      const res = await apiRequest<SecurityPayload>('/api/owner/security');
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load security monitoring data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  const handleRevokeSession = async (sessionId: string, email: string) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      await apiRequest(`/api/owner/security/sessions/${sessionId}/revoke`, { method: 'POST' });
      setActionMsg(`Session revoked for ${email}.`);
      await loadSecurity();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to revoke session.');
    }
  };

  const handleReviewInquiry = async (inquiryId: string) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      await apiRequest(`/api/owner/security/inquiries/${inquiryId}`, { method: 'PATCH' });
      setActionMsg('Contact inquiry marked as reviewed.');
      await loadSecurity();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to update inquiry.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Monitoring"
        description="Inspect and revoke active HTTP-only sessions, review login rate-limit lockouts, password resets, denied boundaries, and institutional inquiries."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {actionErr ? <Alert variant="error">{actionErr}</Alert> : null}
      {actionMsg ? <Alert variant="success">{actionMsg}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Active Authentication Sessions</CardTitle>
          <CardDescription>
            Server-tracked HTTP-only sessions currently valid across Workers and School portals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading active sessions...</p>
          ) : data.activeSessions.length === 0 ? (
            <p className="text-sm text-slate-500">No active sessions found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.activeSessions.map((ses) => (
                  <TableRow key={ses.id}>
                    <TableCell>
                      <p className="font-medium">{ses.user_name}</p>
                      <p className="text-xs text-slate-500">{ses.user_email}</p>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{ses.auth_environment}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {ses.school_name ?? 'DT Platform'}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {formatUtcTimestamp(ses.expires_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRevokeSession(ses.id, ses.user_email)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active Rate-Limit Lockouts</CardTitle>
            <CardDescription>
              Brute-force protection lockouts enforced in SQLite across login and reset endpoints.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading lockouts...</p>
            ) : data.rateLimitLockouts.length === 0 ? (
              <p className="text-sm text-slate-500">No active rate-limit lockouts at this time.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rate Key</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Locked Until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rateLimitLockouts.map((lock) => (
                    <TableRow key={lock.rate_key}>
                      <TableCell className="font-mono text-xs">{lock.rate_key}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {lock.attempts}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {lock.locked_until ? formatUtcTimestamp(lock.locked_until) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password Recovery Events</CardTitle>
            <CardDescription>
              Recent recovery token issuances, usage status, and expirations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading recovery events...</p>
            ) : data.passwordResetEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No password recovery tokens recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Env</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.passwordResetEvents.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell>
                        <p className="text-xs font-semibold text-[#0F172A]">{ev.user_name}</p>
                        <p className="text-xs text-slate-500">{ev.user_email}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{ev.auth_environment}</TableCell>
                      <TableCell className="text-xs">
                        {ev.used_at ? 'Consumed' : 'Pending / Active'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Denied & Failed Access Attempts</CardTitle>
          <CardDescription>
            Cross-environment login blocks, RBAC permission denials, and failed credential checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading security events...</p>
          ) : data.deniedEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No denied or failed security events recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.deniedEvents.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {formatUtcTimestamp(ev.created_at)}
                    </TableCell>
                    <TableCell className="text-xs">{ev.actor_email}</TableCell>
                    <TableCell className="font-mono text-xs">{ev.action}</TableCell>
                    <TableCell className="text-xs font-semibold text-red-700 capitalize">
                      {ev.outcome}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public Contact Inquiries</CardTitle>
          <CardDescription>
            Institutional partnership and support submissions submitted through /contact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading inquiries...</p>
          ) : data.inquiries.length === 0 ? (
            <p className="text-sm text-slate-500">No inquiries submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sender</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.inquiries.map((inq) => (
                  <TableRow key={inq.id}>
                    <TableCell>
                      <p className="text-xs font-semibold text-[#0F172A]">{inq.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {inq.email}
                        {inq.organization ? ` · ${inq.organization}` : ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium text-[#0F172A]">{inq.subject}</p>
                      <p className="text-xs text-slate-500 truncate max-w-xs">{inq.message}</p>
                    </TableCell>
                    <TableCell className="text-xs capitalize font-medium">{inq.status}</TableCell>
                    <TableCell className="text-right">
                      {inq.status !== 'reviewed' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleReviewInquiry(inq.id)}
                        >
                          Mark Reviewed
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Reviewed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
