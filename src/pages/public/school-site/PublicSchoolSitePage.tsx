import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Mail, MapPin, Megaphone, Phone } from 'lucide-react';
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
        <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-xl border border-slate-200">
          <h1 className="font-display text-xl font-bold text-slate-900">Institution Portal Unavailable</h1>
          <p className="text-sm text-slate-600">{error ?? 'This school website has not been published yet.'}</p>
          <Link to="/" className="inline-block pt-2">
            <Button type="button">Return to Dave Timi EdTech</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { school, website, announcements, classes, upcomingEvents } = data;
  const initials = (school.name || 'SC').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0F172A] font-display text-xs font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold tracking-tight text-[#0F172A] truncate">
                {school.name}
              </h1>
              <p className="text-xs text-slate-500 font-mono truncate">
                {school.city}, {school.country} · {school.code}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
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
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* Institutional Masthead */}
        <section className="rounded-xl border border-slate-800 bg-[#0F172A] text-white p-8 sm:p-12">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8 space-y-5">
              <p className="text-xs font-medium text-blue-300">
                {school.motto || 'Excellence & Integrity'}
              </p>
              <h2
                className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight leading-[1.1]"
                style={{ textWrap: 'balance' }}
              >
                {website.hero_title || `Welcome to ${school.name}`}
              </h2>
              <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
                {website.hero_subtitle || website.about_content || 'Shaping future leaders with dependable academic structure and transparent family collaboration.'}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link to={`/schools/${slug}/admissions`}>
                  <Button type="button" variant="electric" size="lg">
                    <span>Online Admissions</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Link>
                <Link to="/login/school">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
                  >
                    Student &amp; Parent Portal
                  </Button>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-slate-800 pt-6 lg:pt-0 lg:pl-8 space-y-3 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{school.city}, {school.country}</span>
              </div>
              {school.contact_email ? (
                <div className="flex items-start gap-2.5">
                  <Mail className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="font-mono break-all">{school.contact_email}</span>
                </div>
              ) : null}
              {school.phone ? (
                <div className="flex items-start gap-2.5">
                  <Phone className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="font-mono">{school.phone}</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* Principal's Address (Single unified hairline surface) */}
        {website.principal_name ? (
          <Card>
            <div className="grid md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
              <div className="md:col-span-8 p-6 sm:p-8 space-y-3">
                <p className="text-xs font-semibold text-[#2563EB]">Principal&apos;s Address</p>
                <h3 className="font-display text-xl font-bold text-[#0F172A]">
                  Message from {website.principal_name}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                  {website.principal_message}
                </p>
              </div>
              <div className="md:col-span-4 p-6 sm:p-8 flex flex-col justify-center bg-slate-50/70 space-y-1">
                <p className="text-xs font-medium text-slate-500">Office of the Leadership</p>
                <p className="font-display text-lg font-bold text-[#0F172A]">{website.principal_name}</p>
                <p className="text-xs text-slate-600">{website.principal_title || 'Principal'}</p>
                <p className="text-xs text-[#1E3A8A] font-medium pt-2">{school.name}</p>
              </div>
            </div>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center gap-2 text-[#1E3A8A]">
                <Megaphone className="h-4 w-4" aria-hidden="true" />
                <CardTitle className="text-base">School News &amp; Announcements</CardTitle>
              </div>
              <CardDescription>Recent circulars and updates from school leadership.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {announcements?.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No public announcements posted yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {announcements.map((a: any) => (
                    <div key={a.id} className="px-6 py-4 space-y-1">
                      <p className="text-xs font-medium text-[#2563EB] capitalize">{a.category}</p>
                      <h4 className="font-semibold text-[#0F172A]">{a.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">{a.summary || a.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center gap-2 text-[#1E3A8A]">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  <CardTitle className="text-base">Academic Classes &amp; Sections</CardTitle>
                </div>
                <CardDescription>Offered levels and academic divisions.</CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                {classes?.length === 0 ? (
                  <p className="text-sm text-slate-500">No active classes listed.</p>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {classes.map((cls: any) => (
                      <div key={cls.id} className="rounded-lg border border-slate-200 px-3.5 py-2.5">
                        <p className="text-sm font-semibold text-[#0F172A]">{cls.name}</p>
                        <p className="text-xs text-slate-500">{cls.section}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {upcomingEvents && upcomingEvents.length > 0 ? (
              <Card>
                <CardHeader className="border-b border-slate-100">
                  <div className="flex items-center gap-2 text-[#1E3A8A]">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    <CardTitle className="text-base">Upcoming Calendar Events</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    {upcomingEvents.map((ev: any) => (
                      <div key={ev.id} className="flex items-center justify-between gap-4 px-6 py-3.5 text-sm">
                        <span className="font-medium text-[#0F172A]">{ev.title}</span>
                        <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                          {ev.start_date}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 mt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} {school.name} · Powered by Dave Timi EdTech Systems</p>
          <p className="font-mono">
            {school.contact_email}
            {school.phone ? ` · ${school.phone}` : ''}
          </p>
        </div>
      </footer>
    </div>
  );
}
