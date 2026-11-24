import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { TelegramBotConnectCard } from '../../components/shared/TelegramBotConnectCard.tsx';
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
import type { AuditLogRecord } from '../../types/app.ts';

interface OverviewMetrics {
  totalSchools: number;
  activeSchools: number;
  pendingSchools: number;
  suspendedSchools: number;
  workforceCount: number;
  schoolMembersCount: number;
  activeAuthSessions: number;
  contactInquiriesCount: number;
  availableAccessCodesCount?: number;
}

export function OwnerOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<OverviewMetrics>({
    totalSchools: 0,
    activeSchools: 0,
    pendingSchools: 0,
    suspendedSchools: 0,
    workforceCount: 0,
    schoolMembersCount: 0,
    activeAuthSessions: 0,
    contactInquiriesCount: 0,
    availableAccessCodesCount: 0,
  });
  const [recentAudits, setRecentAudits] = useState<AuditLogRecord[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{ metrics: OverviewMetrics; recentAudits: AuditLogRecord[] }>(
      '/api/owner/overview',
    )
      .then((res) => {
        if (!active) return;
        setMetrics(res.metrics);
        setRecentAudits(res.recentAudits);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load platform overview.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Overview"
        description="Executive summary of registered school tenants, DT workforce accounts, active sessions, and recent audit activity."
        actions={
          <Link to="/dashboard/owner/schools">
            <Button type="button" size="sm">
              Issue School Code & Manage Schools
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Registered Schools</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {loading ? '—' : metrics.totalSchools}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500 tabular-nums">
            {metrics.activeSchools} active · {metrics.pendingSchools} pending ·{' '}
            {metrics.suspendedSchools} suspended
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>DT Workforce</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {loading ? '—' : metrics.workforceCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Authorized platform personnel
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>School Members</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {loading ? '—' : metrics.schoolMembersCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Admins, teachers, students, parents
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Auth Sessions</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {loading ? '—' : metrics.activeAuthSessions}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500 tabular-nums">
            {metrics.contactInquiriesCount} public inquiries logged
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Platform Audit Activity</CardTitle>
          <CardDescription>
            Live server-recorded security and tenant events across Dave Timi EdTech Systems.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading audit events...</p>
          ) : recentAudits.length === 0 ? (
            <p className="text-sm text-slate-500">No audit events recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAudits.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">
                      {formatUtcTimestamp(log.created_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium text-[#0F172A]">{log.actor_email}</span>
                      <span className="text-slate-500"> · {log.actor_role}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell className="text-xs text-slate-600">{log.auth_environment}</TableCell>
                    <TableCell className="text-xs font-medium capitalize">{log.outcome}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TelegramBotConnectCard mode="portal" audience="owner" />
    </div>
  );
}
