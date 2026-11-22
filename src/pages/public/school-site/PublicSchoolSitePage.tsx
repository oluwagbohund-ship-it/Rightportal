import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BrandLoader } from '../../../components/brand/BrandLoader.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function PublicSchoolSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    apiRequest<any>(`/api/public/schools/${slug}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'School website not found.'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <BrandLoader label="Loading digital campus..." />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
        <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Institution Portal Unavailable</h1>
          <p className="text-sm text-slate-600">{error ?? 'This school website has not been published yet.'}</p>
          <Link to="/">
            <Button type="button" className="mt-4">
              Return to Dave Timi EdTech
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { school, website, announcements, classes, upcomingEvents } = data;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">{school.name}</h1>
          <p className="text-xs text-slate-500 font-mono">{school.city}, {school.country} · {school.code}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/schools/${slug}/admissions`}>
            <Button type="button" size="sm">
              Apply for Admission
            </Button>
          </Link>
          <Link to="/login/school">
            <Button type="button" size="sm" variant="outline">
              Portal Login
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        <div className="rounded-2xl bg-gradient-to-r from-[#0F172A] to-[#1E3A8A] text-white p-8 sm:p-12 shadow-lg space-y-6">
          <p className="text-xs font-mono uppercase tracking-widest text-blue-300">{school.motto || 'Excellence & Integrity'}</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            {website.hero_title || `Welcome to ${school.name}`}
          </h2>
          <p className="text-base sm:text-lg text-blue-100 max-w-2xl leading-relaxed">
            {website.hero_subtitle || website.about_content || 'Shaping future leaders with modern educational technology.'}
          </p>
          <div className="flex items-center gap-4 pt-2">
            <Link to={`/schools/${slug}/admissions`}>
              <Button type="button" className="bg-[#2563EB] hover:bg-blue-600 text-white font-medium">
                Online Admissions
              </Button>
            </Link>
          </div>
        </div>

        {website.principal_name ? (
          <div className="grid gap-8 md:grid-cols-3 items-center bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="md:col-span-2 space-y-3">
              <p className="text-xs font-semibold text-[#2563EB] uppercase tracking-wider">Principal's Address</p>
              <h3 className="text-xl font-bold text-slate-900">Message from {website.principal_name}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{website.principal_message}</p>
            </div>
            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1">
              <p className="font-bold text-slate-900">{website.principal_name}</p>
              <p className="text-xs text-slate-500">{website.principal_title || 'Principal'}</p>
              <p className="text-xs text-blue-600 font-medium pt-2">{school.name}</p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>School News & Announcements</CardTitle>
              <CardDescription>Recent circulars and updates from administration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {announcements?.length === 0 ? (
                <p className="text-sm text-slate-500">No public announcements posted yet.</p>
              ) : (
                announcements.map((a: any) => (
                  <div key={a.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                    <p className="text-xs font-medium text-blue-600 uppercase">{a.category}</p>
                    <h4 className="font-semibold text-slate-900">{a.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{a.summary || a.body}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Academic Classes & Sections</CardTitle>
              <CardDescription>Offered levels and academic structure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {classes?.length === 0 ? (
                <p className="text-sm text-slate-500">No active classes listed.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {classes.map((cls: any) => (
                    <div key={cls.id} className="p-3 rounded-lg border border-slate-200 bg-white">
                      <p className="font-semibold text-slate-900">{cls.name}</p>
                      <p className="text-xs text-slate-500">{cls.section}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 mt-16 text-center text-xs text-slate-500 space-y-1">
        <p>© {new Date().getFullYear()} {school.name} · Powered by Dave Timi EdTech Systems</p>
        <p className="font-mono">{school.contact_email} · {school.phone || ''}</p>
      </footer>
    </div>
  );
}
