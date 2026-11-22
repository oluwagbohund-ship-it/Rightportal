import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function WebsiteOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiRequest<any>('/api/school/website/overview')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load website overview.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Public Website & Online Admissions"
        description="Manage your school's public microsite at /schools/:slug, news, campus gallery, hero media, and prospective student admissions intake."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading website configuration...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Public Microsite Status</CardDescription>
                <CardTitle className={`text-2xl font-bold ${data?.website?.is_published ? 'text-emerald-600' : 'text-slate-600'}`}>
                  {data?.website?.is_published ? 'Published Online' : 'Draft / Unpublished'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                URL Slug: <span className="font-mono font-bold">/schools/{data?.school?.slug}</span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Online Admissions Intake</CardDescription>
                <CardTitle className={`text-2xl font-bold ${data?.website?.admissions_open ? 'text-blue-600' : 'text-slate-600'}`}>
                  {data?.website?.admissions_open ? 'Open for Applications' : 'Closed'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                Public intake endpoint active
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Submitted Applications</CardDescription>
                <CardTitle className="text-2xl font-bold text-indigo-600 tabular-nums">
                  {data?.admissionsCount ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">Prospective student forms received</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Microsite Preview & Links</CardTitle>
              <CardDescription>Quick links to your public pages and application form.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">Public School Portal</p>
                  <p className="text-xs text-slate-500 font-mono">/schools/{data?.school?.slug}</p>
                </div>
                <a href={`/schools/${data?.school?.slug}`} target="_blank" rel="noreferrer">
                  <Button type="button" size="sm" variant="outline">
                    View Public Site
                  </Button>
                </a>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">Online Admission Application Form</p>
                  <p className="text-xs text-slate-500 font-mono">/schools/{data?.school?.slug}/admissions</p>
                </div>
                <a href={`/schools/${data?.school?.slug}/admissions`} target="_blank" rel="noreferrer">
                  <Button type="button" size="sm" variant="outline">
                    View Admission Form
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
