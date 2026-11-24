import React, { useEffect, useState } from 'react';
import { Activity, ArrowRight, Bot, Building2, KeyRound, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { TelegramBotConnectCard } from '../../components/shared/TelegramBotConnectCard.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Skeleton, TableSkeleton } from '../../components/ui/skeleton.tsx';
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

  const kpis = [
    {
      label: 'Registered Schools',
      value: metrics.totalSchools,
      meta: `${metrics.activeSchools} active · ${metrics.pendingSchools} pending · ${metrics.suspendedSchools} suspended`,
      icon: Building2,
      to: '/dashboard/owner/schools',
    },
    {
      label: 'DT Workforce',
      value: metrics.workforceCount,
      meta: 'Authorized internal operations personnel',
      icon: ShieldCheck,
      to: '/dashboard/owner/workforce',
    },
    {
      label: 'School Members',
      value: metrics.schoolMembersCount,
      meta: 'Admins, teachers, students & parents',
      icon: Users,
      to: '/dashboard/owner/schools',
    },
    {
      label: 'Active Auth Sessions',
      value: metrics.activeAuthSessions,
      meta: `${metrics.contactInquiriesCount} public inquiries logged`,
      icon: Activity,
      to: '/dashboard/owner/security',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform Operations"
        title="Platform Overview"
        description="Executive summary of registered school tenants, DT workforce accounts, active sessions, and recent audit activity."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/dashboard/owner/telegram">
              <Button type="button" size="sm" variant="outline">
                <Bot className="h-4 w-4" aria-hidden="true" />
                <span>Telegram Bot</span>
              </Button>
            </Link>
            <Link to="/dashboard/owner/schools">
              <Button type="button" size="sm">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>Manage Schools &amp; Codes</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.to} className="group block">
              <Card className="h-full transition-colors group-hover:border-[#2563EB]/50">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardDescription className="text-xs font-medium text-slate-600">
                    {item.label}
                  </CardDescription>
                  <Icon className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-9 w-16 my-0.5" />
                  ) : (
                    <p className="font-display text-3xl font-bold tracking-tight text-[#0F172A] tabular-nums">
                      {item.value}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-slate-500 tabular-nums">{item.meta}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
          <div>
            <CardTitle>Recent Platform Audit Activity</CardTitle>
            <CardDescription>
              Live server-recorded security and tenant events across Dave Timi EdTech Systems.
            </CardDescription>
          </div>
          <Link
            to="/dashboard/owner/audit-logs"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap"
          >
            <span>View Full Ledger</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : recentAudits.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center space-y-1.5">
              <p className="text-sm font-medium text-[#0F172A]">No audit events recorded yet</p>
              <p className="text-xs text-slate-500">
                Tenant logins, access code issues, and security events will stream here automatically.
              </p>
            </div>
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
                    <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap text-slate-500">
                      {formatUtcTimestamp(log.created_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium text-[#0F172A]">{log.actor_email}</span>
                      <span className="text-slate-500"> · {log.actor_role}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#0F172A]">{log.action}</TableCell>
                    <TableCell className="text-xs text-slate-600">{log.auth_environment}</TableCell>
                    <TableCell
                      className={`text-xs font-semibold capitalize ${
                        log.outcome === 'success'
                          ? 'text-emerald-700'
                          : log.outcome === 'denied' || log.outcome === 'failure'
                            ? 'text-red-700'
                            : 'text-slate-700'
                      }`}
                    >
                      {log.outcome}
                    </TableCell>
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
