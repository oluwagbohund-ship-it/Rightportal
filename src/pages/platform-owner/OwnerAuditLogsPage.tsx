import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
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

export function OwnerAuditLogsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState('all');
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<{ logs: AuditLogRecord[] }>(
      `/api/owner/audit-logs?outcome=${encodeURIComponent(auditFilter)}`,
    )
      .then((res) => {
        if (!active) return;
        setLogs(res.logs);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load audit logs.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auditFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Immutable server-side record of authentication events, tenant registrations, and platform governance mutations."
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {['all', 'success', 'denied', 'failure'].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAuditFilter(opt)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer ${
                  auditFilter === opt
                    ? 'bg-white text-[#0F172A] shadow-sm'
                    : 'text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Platform Event Stream</CardTitle>
          <CardDescription>Showing up to 100 most recent events matching the selected filter.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading audit logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500">No audit records match this filter.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">
                      {formatUtcTimestamp(log.created_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.actor_email} · {log.actor_role}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {log.school_name ?? 'Platform'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell className="text-xs font-semibold capitalize">{log.outcome}</TableCell>
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
