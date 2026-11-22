import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { SchoolRecord, SchoolStatus } from '../../types/app.ts';

export function OwnerSchoolsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<{ schools: SchoolRecord[] }>('/api/owner/schools')
      .then((res) => {
        if (!active) return;
        setSchools(res.schools);
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
        title="School Management"
        description="Verify newly registered institutions, inspect tenant counts, or suspend access at the tenant level."
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

      <Card>
        <CardHeader>
          <CardTitle>Registered School Tenants</CardTitle>
          <CardDescription>
            Every row represents an isolated multi-tenant school workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading schools...</p>
          ) : filteredSchools.length === 0 ? (
            <p className="text-sm text-slate-500">
              No registered schools match your filter yet. Institutions onboard via /register.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Code</TableHead>
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
                    <TableCell className="font-mono text-xs">{sch.code}</TableCell>
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
