import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { apiRequest } from '../../lib/api.ts';

export function StudentFeesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiRequest<any>('/api/school/student/finance')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load student fee ledger.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Ledger & Payment Receipts"
        description="View assigned fee structures, net balance due, scholarship deductions, and download official PDF payment receipts."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading student financial ledger...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Net Billed Fees</CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums">
                  ₦{(data?.totals?.netAmount ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Paid</CardDescription>
                <CardTitle className="text-3xl font-bold text-emerald-600 tabular-nums">
                  ₦{(data?.totals?.amountPaid ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Balance Due</CardDescription>
                <CardTitle className="text-3xl font-bold text-rose-600 tabular-nums">
                  ₦{(data?.totals?.balanceDue ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Fee Assignments</CardTitle>
              <CardDescription>Breakdown of tuition and charges assigned to your profile.</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.assignments?.length === 0 ? (
                <p className="text-sm text-slate-500">No fee assignments found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fee Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Base Amount</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Net Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.assignments?.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-slate-900">{a.fee_name}</TableCell>
                        <TableCell className="text-xs">{a.category_name}</TableCell>
                        <TableCell className="font-mono tabular-nums">₦{Number(a.base_amount).toLocaleString()}</TableCell>
                        <TableCell className="font-mono tabular-nums text-emerald-600">
                          -₦{Number(a.discount_amount ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono font-bold tabular-nums">₦{Number(a.net_amount).toLocaleString()}</TableCell>
                        <TableCell className="font-mono tabular-nums text-emerald-600">
                          ₦{Number(a.amount_paid).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-rose-600">
                          ₦{Number(a.balance_due).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md capitalize ${
                              a.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {a.status}
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
              <CardTitle>Payment History & PDF Receipts</CardTitle>
              <CardDescription>Record of payments made with download links for verified official receipts.</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.payments?.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt No</TableHead>
                      <TableHead>Fee Item</TableHead>
                      <TableHead>Amount Paid</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.payments?.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-semibold">{p.receipt_number}</TableCell>
                        <TableCell className="text-xs">{p.fee_name}</TableCell>
                        <TableCell className="font-mono font-bold tabular-nums">
                          ₦{Number(p.amount_paid).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs uppercase font-mono">{p.payment_method}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md capitalize ${
                              p.status === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {p.status.replace('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <a href={`/api/school/finance/payments/${p.id}/receipt.pdf`} target="_blank" rel="noreferrer">
                            <Button type="button" size="sm" variant="outline">
                              Download PDF
                            </Button>
                          </a>
                        </TableCell>
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
