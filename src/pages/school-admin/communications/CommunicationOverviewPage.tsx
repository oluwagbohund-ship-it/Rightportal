import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function CommunicationOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiRequest<any>('/api/school/communications/overview')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load communications overview.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communications & Messaging"
        description="Role-scoped school announcements, read receipts, direct messaging, SMTP email dispatch, and Firebase Cloud Messaging (FCM) state."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading communications summary...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Announcements</CardDescription>
                <CardTitle className="text-3xl font-bold tabular-nums">
                  {data?.stats?.announcementsCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Published and draft notices</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Direct Messages</CardDescription>
                <CardTitle className="text-3xl font-bold text-blue-600 tabular-nums">
                  {data?.stats?.messagesCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Secure staff-parent-student threads</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>SMTP Email Gateway</CardDescription>
                <CardTitle className={`text-xl font-bold ${data?.smtpStatus?.configured ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {data?.smtpStatus?.configured ? 'Active (Nodemailer)' : 'Inactive / Unconfigured'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">{data?.smtpStatus?.reason ?? ''}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>FCM Push Integration</CardDescription>
                <CardTitle className="text-xl font-bold text-slate-600">
                  {data?.fcmStatus?.configured ? 'Active' : 'Prepared (Honest Off)'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Cloud Messaging state</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Announcements</CardTitle>
              <CardDescription>Latest circulars published to staff, students, and guardians.</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.recentAnnouncements?.length === 0 ? (
                <p className="text-sm text-slate-500">No announcements published yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Target Scope</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Published Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.recentAnnouncements?.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-slate-900">{a.title}</TableCell>
                        <TableCell className="text-xs capitalize">{a.category}</TableCell>
                        <TableCell className="text-xs uppercase font-mono">{a.target_scope}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md capitalize ${
                              a.is_published ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {a.is_published ? 'Published' : 'Draft'}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{a.published_at ?? 'Unpublished'}</TableCell>
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
