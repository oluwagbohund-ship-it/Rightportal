import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { apiRequest } from '../../lib/api.ts';

export function OwnerSchoolVerificationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [queue, setQueue] = useState<any[]>([]);

  const loadQueue = () => {
    setLoading(true);
    apiRequest<{ pendingSchools: any[] }>('/api/owner/verification-queue')
      .then((res) => setQueue(res.pendingSchools ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load school verification queue.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleDecision = async (schoolId: string, decision: 'active' | 'suspended', notes: string) => {
    setError(null);
    setSuccess(null);
    try {
      await apiRequest(`/api/owner/verification-queue/${schoolId}/decision`, {
        method: 'POST',
        body: { decision, notes },
      });
      setSuccess(`School tenant status updated to ${decision}.`);
      loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update school status.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Executive & Tenants"
        title="Institution Verification Queue"
        description="Review newly registered school tenants and approve or suspend institutional access."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Pending &amp; Registered Schools</CardTitle>
          <CardDescription>Schools awaiting platform verification or inspection.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading verification queue...</p>
          ) : queue.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center space-y-1">
              <p className="text-sm font-medium text-[#0F172A]">All caught up</p>
              <p className="text-xs text-slate-500">No schools are currently pending verification.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School Name</TableHead>
                  <TableHead>Code &amp; Slug</TableHead>
                  <TableHead>Country / City</TableHead>
                  <TableHead>Contact Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-slate-900">{s.name}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {s.code} · /{s.slug}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.city}, {s.country}
                    </TableCell>
                    <TableCell className="text-xs">{s.contact_email}</TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md border border-amber-200 capitalize bg-amber-50 text-amber-800">
                        {s.status.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleDecision(s.id, 'active', 'Verified by Platform Operations')}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecision(s.id, 'suspended', 'Suspended by Platform Operations')}
                          className="text-rose-600 border-rose-200 hover:bg-rose-50"
                        >
                          Suspend
                        </Button>
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
