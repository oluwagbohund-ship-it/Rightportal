import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, ShieldOff } from 'lucide-react';
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
import type { SchoolAccessCodeRecord, SchoolRecord, SchoolStatus } from '../../types/app.ts';

export function OwnerSchoolsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [accessCodes, setAccessCodes] = useState<SchoolAccessCodeRecord[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');

  // Access code generator state
  const [intendedSchoolName, setIntendedSchoolName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [creatingCode, setCreatingCode] = useState(false);
  const [lastIssuedCode, setLastIssuedCode] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ schools: SchoolRecord[] }>('/api/owner/schools'),
      apiRequest<{ codes: SchoolAccessCodeRecord[] }>('/api/owner/school-access-codes'),
    ])
      .then(([schoolsRes, codesRes]) => {
        if (!active) return;
        setSchools(schoolsRes.schools);
        setAccessCodes(codesRes.codes);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load school tenants.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedValue(text);
      setTimeout(() => {
        setCopiedValue((prev) => (prev === text ? null : prev));
      }, 2000);
    } catch {
      setActionMsg(`Code ready to share: ${text}`);
    }
  };

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setCreatingCode(true);
    try {
      const res = await apiRequest<{ accessCode: SchoolAccessCodeRecord }>(
        '/api/owner/school-access-codes',
        {
          method: 'POST',
          body: JSON.stringify({
            intendedSchoolName: intendedSchoolName.trim(),
            recipientEmail: recipientEmail.trim(),
            customCode: customCode.trim(),
            expiresInDays: expiresInDays ? Number(expiresInDays) : null,
          }),
        },
      );
      setAccessCodes((prev) => [res.accessCode, ...prev]);
      setLastIssuedCode(res.accessCode.code);
      setIntendedSchoolName('');
      setRecipientEmail('');
      setCustomCode('');
      setExpiresInDays('');
      setActionMsg(
        `Unique school access code ${res.accessCode.code} generated. Share it with the school to create their tenant and sign in.`,
      );
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to generate school access code.');
    } finally {
      setCreatingCode(false);
    }
  };

  const handleRevokeCode = async (codeId: string) => {
    setActionErr(null);
    setActionMsg(null);
    const targetCode = accessCodes.find((c) => c.id === codeId)?.code;
    try {
      await apiRequest(`/api/owner/school-access-codes/${codeId}/revoke`, {
        method: 'PATCH',
      });
      setAccessCodes((prev) =>
        prev.map((c) => (c.id === codeId ? { ...c, status: 'revoked' } : c)),
      );
      if (targetCode && lastIssuedCode === targetCode) {
        setLastIssuedCode(null);
      }
      setActionMsg('Access code revoked and can no longer be used to register a school.');
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Failed to revoke access code.');
    }
  };

  const handleUpdateStatus = async (schoolId: string, status: SchoolStatus) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      await apiRequest(`/api/owner/schools/${schoolId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setSchools((prev) => prev.map((s) => (s.id === schoolId ? { ...s, status } : s)));
      setActionMsg(`School status updated to ${status.replace('_', ' ')}.`);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Failed to update school status.');
    }
  };

  const filteredSchools = schools.filter((s) => {
    const q = schoolSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Management & Access Codes"
        description="Issue unique onboarding codes required to create a school and enter the platform, and manage registered school tenants."
        actions={
          <div className="w-full sm:w-64">
            <Input
              aria-label="Filter schools"
              placeholder="Search name, code, city..."
              value={schoolSearch}
              onChange={(e) => setSchoolSearch(e.target.value)}
            />
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {actionErr ? <Alert variant="error">{actionErr}</Alert> : null}
      {actionMsg ? <Alert variant="success">{actionMsg}</Alert> : null}

      {/* Issue Unique School Access Code */}
      <Card className="border-blue-200 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2 text-[#1E3A8A]">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
            <CardTitle>Issue Unique School Access Code</CardTitle>
          </div>
          <CardDescription>
            Schools must obtain an unused unique code from this dashboard to create their school at{' '}
            <span className="font-mono text-xs">/register</span> and use it as their School Code on{' '}
            <span className="font-mono text-xs">/login/school</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={(e) => void handleGenerateCode(e)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="code-school-name">School Name (Optional)</Label>
              <Input
                id="code-school-name"
                value={intendedSchoolName}
                onChange={(e) => setIntendedSchoolName(e.target.value)}
                placeholder="Rightec International"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code-recipient-email">Recipient Email (Optional)</Label>
              <Input
                id="code-recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="principal@school.edu"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code-custom">Custom Code (Optional)</Label>
              <Input
                id="code-custom"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                placeholder="DT-7K9M2P"
                className="font-mono uppercase"
                maxLength={24}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code-expiry">Expiration</Label>
              <Select
                id="code-expiry"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              >
                <option value="">Never expires</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </Select>
            </div>

            <div>
              <Button type="submit" className="w-full" disabled={creatingCode}>
                {creatingCode ? 'Generating...' : 'Generate Unique Code'}
              </Button>
            </div>
          </form>

          {lastIssuedCode ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-emerald-800">
                  Latest Issued School Code (Ready to Share)
                </p>
                <p className="font-mono text-lg font-bold tracking-wider text-emerald-950">
                  {lastIssuedCode}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCopy(lastIssuedCode)}
                className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
              >
                {copiedValue === lastIssuedCode ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    <span>Copy Code</span>
                  </>
                )}
              </Button>
            </div>
          ) : null}

          {accessCodes.length > 0 ? (
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-[#0F172A] mb-3">
                Issued School Access Codes ({accessCodes.length})
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unique Code</TableHead>
                    <TableHead>Intended School / Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued / Expiry</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessCodes.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="inline-flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#0F172A]">
                            {item.code}
                          </span>
                          <button
                            type="button"
                            aria-label={`Copy code ${item.code}`}
                            onClick={() => void handleCopy(item.code)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                          >
                            {copiedValue === item.code ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium text-[#0F172A]">
                          {item.used_by_school_name || item.intended_school_name || 'Unassigned Invite'}
                        </p>
                        {item.recipient_email ? (
                          <p className="text-slate-500">{item.recipient_email}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 font-semibold capitalize ${
                            item.status === 'available'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : item.status === 'used'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {item.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono tabular-nums">
                        <div>{formatUtcTimestamp(item.created_at)}</div>
                        {item.expires_at ? (
                          <div className="text-[11px] text-amber-700">
                            Exp: {formatUtcTimestamp(item.expires_at)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === 'available' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRevokeCode(item.id)}
                          >
                            <ShieldOff className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                            <span>Revoke</span>
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No access codes issued yet. Generate a code above before a new school can register.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Registered School Tenants */}
      <Card>
        <CardHeader>
          <CardTitle>Registered School Tenants</CardTitle>
          <CardDescription>
            Every row represents an isolated multi-tenant school workspace and its required School Login Code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading schools...</p>
          ) : filteredSchools.length === 0 ? (
            <p className="text-sm text-slate-500">
              No registered schools match your filter yet. Issue a code above so an institution can onboard via /register.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>School Code</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Governance Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSchools.map((sch) => (
                  <TableRow key={sch.id}>
                    <TableCell>
                      <p className="font-semibold text-[#0F172A]">{sch.name}</p>
                      <p className="text-xs text-slate-500">{sch.contact_email}</p>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{sch.code}</span>
                        <button
                          type="button"
                          aria-label={`Copy school code ${sch.code}`}
                          onClick={() => void handleCopy(sch.code)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                        >
                          {copiedValue === sch.code ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {sch.city}, {sch.country}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {sch.member_count ?? 0} users · {sch.session_count ?? 0} sessions
                    </TableCell>
                    <TableCell className="text-xs font-semibold capitalize">
                      {sch.status.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        {sch.status !== 'active' ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleUpdateStatus(sch.id, 'active')}
                          >
                            Activate
                          </Button>
                        ) : null}
                        {sch.status !== 'suspended' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleUpdateStatus(sch.id, 'suspended')}
                          >
                            Suspend
                          </Button>
                        ) : null}
                      </div>
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
