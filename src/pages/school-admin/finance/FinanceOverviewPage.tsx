import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function FinanceOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);

  useEffect(() => {
    apiRequest<any>('/api/school/finance/overview')
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load finance overview.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Management & Fees"
        description="Tenant-wide fee structures, student billing ledgers, payment proof verification, and financial reports."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading financial overview...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Billed Fees</CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums">
                  ₦{(overview?.stats?.totalBilled ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Active fee assignments</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Verified Revenue</CardDescription>
                <CardTitle className="text-3xl font-bold text-emerald-600 tabular-nums">
                  ₦{(overview?.stats?.totalCollected ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Verified bank and cash payments</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Outstanding Balance</CardDescription>
                <CardTitle className="text-3xl font-bold text-rose-600 tabular-nums">
                  ₦{(overview?.stats?.totalBalanceDue ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Unpaid student balances</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pending Verification</CardDescription>
                <CardTitle className="text-3xl font-bold text-amber-600 tabular-nums">
                  {overview?.stats?.pendingVerificationCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Bank transfer proof waiting</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Payment Records</CardTitle>
              <CardDescription>Latest student fee payments recorded across the institution.</CardDescription>
            </CardHeader>
            <CardContent>
              {overview?.recentPayments?.length === 0 ? (
                <p className="text-sm text-slate-500">No payment transactions recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt No</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Fee Item</TableHead>
                      <TableHead>Amount Paid</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview?.recentPayments?.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-semibold">{p.receipt_number}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-medium text-slate-900">
                            {p.first_name} {p.last_name}
                          </span>
                          <span className="text-slate-500 block font-mono">{p.admission_number}</span>
                        </TableCell>
                        <TableCell className="text-xs">{p.fee_name ?? 'School Fee'}</TableCell>
                        <TableCell className="font-mono font-bold tabular-nums">
                          ₦{Number(p.amount_paid).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs uppercase font-mono">{p.payment_method}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md capitalize ${
                              p.status === 'verified'
                                ? 'bg-emerald-50 text-emerald-700'
                                : p.status === 'pending_verification'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {p.status.replace('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{p.payment_date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
