import React, { useCallback, useEffect, useState } from 'react';
import { Database, Download, RotateCcw, ShieldCheck } from 'lucide-react';
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
import { apiRequest } from '../../lib/api.ts';
import { formatUtcTimestamp } from '../../lib/utils.ts';
import type { BackupRecord, DatabaseIntegrityReport } from '../../types/app.ts';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function OwnerDatabasePage() {
  const [integrity, setIntegrity] = useState<DatabaseIntegrityReport | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const [restoreFilename, setRestoreFilename] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadDatabaseStatus = useCallback(async () => {
    try {
      const res = await apiRequest<{
        integrity: DatabaseIntegrityReport;
        backups: BackupRecord[];
      }>('/api/owner/database/status');
      setIntegrity(res.integrity);
      setBackups(res.backups);
      if (res.backups.length > 0 && !restoreFilename) {
        setRestoreFilename(res.backups[0].filename);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to inspect database health.');
    } finally {
      setLoading(false);
    }
  }, [restoreFilename]);

  useEffect(() => {
    void loadDatabaseStatus();
  }, [loadDatabaseStatus]);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setCreating(true);
    try {
      const res = await apiRequest<{ backup: BackupRecord }>('/api/owner/database/backups', {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      setNotes('');
      setRestoreFilename(res.backup.filename);
      setActionMsg(`Snapshot created: ${res.backup.filename} (${formatBytes(res.backup.size_bytes)})`);
      await loadDatabaseStatus();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to create database backup.');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setRestoring(true);
    try {
      const res = await apiRequest<{
        restoredFrom: string;
        preRestoreBackup: string;
        integrityOk: boolean;
      }>('/api/owner/database/restore', {
        method: 'POST',
        body: JSON.stringify({
          filename: restoreFilename,
          confirmRestore,
        }),
      });
      setConfirmRestore(false);
      setActionMsg(
        `Database restored from ${res.restoredFrom}. Automatic pre-restore snapshot saved as ${res.preRestoreBackup}.`,
      );
      await loadDatabaseStatus();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to restore backup.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Database & Backups"
        description="Inspect SQLite WAL integrity, verify SHA-256 migration checksums, create atomic backups, and review PostgreSQL readiness."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void loadDatabaseStatus()}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Re-run Integrity Check</span>
          </Button>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {actionErr ? <Alert variant="error">{actionErr}</Alert> : null}
      {actionMsg ? <Alert variant="success">{actionMsg}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Integrity Check</p>
            <p className="text-xl font-bold text-[#0F172A]">
              {loading ? '—' : integrity?.ok ? 'Healthy' : 'Attention'}
            </p>
            <p className="text-xs text-slate-500">
              PRAGMA: {integrity?.integrityCheck ?? 'checking'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Foreign Keys</p>
            <p className="text-xl font-bold text-[#0F172A]">
              {loading ? '—' : integrity?.foreignKeysEnabled ? 'Enforced' : 'Disabled'}
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              {integrity?.foreignKeyViolations ?? 0} constraint violations
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Journal Mode</p>
            <p className="text-xl font-bold text-[#0F172A]">
              {loading ? '—' : (integrity?.journalMode ?? 'wal').toUpperCase()}
            </p>
            <p className="text-xs text-slate-500">Transactional WAL concurrency</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Database Size</p>
            <p className="text-xl font-bold text-[#0F172A] tabular-nums">
              {loading ? '—' : formatBytes(integrity?.dbSizeBytes ?? 0)}
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              {backups.length} snapshots archived
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Create Atomic Snapshot</CardTitle>
            <CardDescription>
              Executes SQLite VACUUM INTO to produce a consistent standalone backup verified by integrity check and SHA-256 hash.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={(e) => void handleCreateBackup(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="backup-notes">Snapshot Notes (Optional)</Label>
                <Input
                  id="backup-notes"
                  maxLength={200}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Pre-term onboarding checkpoint"
                />
              </div>
              <Button type="submit" disabled={creating} className="w-full">
                <Database className="h-4 w-4" aria-hidden="true" />
                <span>{creating ? 'Creating Snapshot...' : 'Create Database Backup'}</span>
              </Button>
            </form>

            <div className="border-t border-slate-200 pt-5">
              <h3 className="text-sm font-semibold text-[#0F172A] mb-1">
                Safe Database Restoration
              </h3>
              <p className="text-xs text-slate-600 mb-4">
                Creates an automatic safety snapshot of current data before restoring the selected archive.
              </p>
              <form onSubmit={(e) => void handleRestore(e)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="restore-select">Select Verified Archive</Label>
                  <Select
                    id="restore-select"
                    value={restoreFilename}
                    onChange={(e) => setRestoreFilename(e.target.value)}
                    disabled={backups.length === 0}
                  >
                    {backups.length === 0 ? (
                      <option value="">No backups available</option>
                    ) : (
                      backups
                        .filter((b) => b.fileExists)
                        .map((b) => (
                          <option key={b.id} value={b.filename}>
                            {b.filename} ({formatBytes(b.size_bytes)})
                          </option>
                        ))
                    )}
                  </Select>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={confirmRestore}
                    onChange={(e) => setConfirmRestore(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                  />
                  <span>
                    Confirm database restore. Active database tables will revert to the chosen snapshot after a pre-restore safety backup is recorded.
                  </span>
                </label>

                <Button
                  type="submit"
                  variant="outline"
                  disabled={restoring || !restoreFilename || !confirmRestore}
                  className="w-full"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>{restoring ? 'Restoring Archive...' : 'Restore Selected Backup'}</span>
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-7 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Backup Archives</CardTitle>
              <CardDescription>
                Immutable SQLite snapshots stored outside the web directory.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-slate-500">Loading backups...</p>
              ) : backups.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No backups recorded yet. Create your first snapshot to test recovery procedures.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Archive</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>SHA-256</TableHead>
                      <TableHead className="text-right">Download</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <p className="font-mono text-xs font-semibold text-[#0F172A]">
                            {b.filename}
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {formatUtcTimestamp(b.created_at)}
                            {b.notes ? ` · ${b.notes}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {formatBytes(b.size_bytes)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          {b.sha256_hex.slice(0, 12)}...
                        </TableCell>
                        <TableCell className="text-right">
                          {b.fileExists ? (
                            <a
                              href={`/api/owner/database/backups/${encodeURIComponent(b.filename)}/download`}
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-[#0F172A] hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Download</span>
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">Missing</span>
                          )}
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
              <CardTitle>Migration Version & Checksum Verification</CardTitle>
              <CardDescription>
                Every applied SQL migration file is verified against its recorded SHA-256 digest on startup.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-slate-500">Verifying migrations...</p>
              ) : !integrity || integrity.migrations.length === 0 ? (
                <p className="text-sm text-slate-500">No migration records found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Migration File</TableHead>
                      <TableHead>Applied At</TableHead>
                      <TableHead>Checksum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrity.migrations.map((m) => (
                      <TableRow key={m.version}>
                        <TableCell className="font-mono text-xs font-semibold text-[#0F172A]">
                          {m.version}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {formatUtcTimestamp(m.applied_at)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span
                            className={
                              m.checksumMatch
                                ? 'font-semibold text-emerald-700'
                                : 'font-semibold text-red-700'
                            }
                          >
                            {m.checksumMatch ? 'Verified' : 'Mismatch'}
                          </span>
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
              <CardTitle>Future PostgreSQL Migration Strategy</CardTitle>
              <CardDescription>
                Documented cutover blueprint preserved without premature migration in Phase 1.5 (docs/POSTGRESQL_MIGRATION_STRATEGY.md).
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-slate-600 leading-relaxed space-y-2">
              <p>
                <span className="font-semibold text-[#0F172A]">Trigger Criteria:</span> Migrate to managed PostgreSQL when concurrent write throughput exceeds SQLite WAL single-writer limits, multi-instance horizontal web scaling is required, or institutional storage exceeds single-node capacity.
              </p>
              <p>
                <span className="font-semibold text-[#0F172A]">Tenant & Storage Separation:</span> Enforce PostgreSQL Row-Level Security (RLS) keyed by school_id alongside existing server-side RBAC, and move stored_files objects to S3/GCS signed URLs while preserving identical metadata schemas.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
