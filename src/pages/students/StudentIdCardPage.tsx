import React, { useEffect, useState } from 'react';
import { IdCard, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { DigitalStudentIdCard } from '../../components/students/DigitalStudentIdCard.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { StudentDigitalIdCardRecord } from '../../types/app.ts';

export function StudentIdCardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<StudentDigitalIdCardRecord | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ card: StudentDigitalIdCardRecord | null }>('/api/school/student/id-card')
      .then((res) => {
        if (!active) return;
        setCard(res.card ?? null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load your Digital ID card.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Digital ID Card"
        description="Use your official student QR card for fast Student Portal login and classroom attendance scanning."
        actions={
          <div className="flex flex-wrap gap-2 no-print">
            <Link to="/dashboard/student/attendance">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                My Attendance Log
              </Button>
            </Link>
            <Link to="/dashboard/student">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                Portal Overview
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            Loading your Digital ID card...
          </CardContent>
        </Card>
      ) : !card ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <IdCard className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
            <h2 className="text-base font-semibold text-[#0F172A]">
              Digital ID Card Not Issued Yet
            </h2>
            <p className="mx-auto max-w-md text-sm text-slate-500">
              Your School Administrator has not generated an active Digital ID card for your student profile yet. Please ask your school office to issue your QR ID card.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className="space-y-4">
            <DigitalStudentIdCard card={card} showActions />
          </div>

          <Card className="no-print">
            <CardHeader>
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                <CardTitle className="text-base">How to Use Your ID Card</CardTitle>
              </div>
              <CardDescription>Verified Student Portal &amp; Attendance access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-slate-600 leading-relaxed">
              <div>
                <p className="font-semibold text-[#0F172A]">1. Portal QR Login</p>
                <p>
                  Download your QR PNG or print your card. On the School Login page, select{' '}
                  <span className="font-semibold text-[#1E3A8A]">ID Card QR</span> and scan with camera or upload your QR PNG to sign in instantly.
                </p>
              </div>
              <div>
                <p className="font-semibold text-[#0F172A]">2. Classroom Attendance Check-In</p>
                <p>
                  Present your Digital ID QR code to your teacher or school administrator during roll call to be marked present automatically.
                </p>
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-1">
                <p className="font-semibold text-[#0F172A]">Recent Card Activity</p>
                <p className="tabular-nums">
                  Last Portal QR Login:{' '}
                  {card.last_used_login_at ? card.last_used_login_at.slice(0, 16).replace('T', ' ') : 'Not used yet'}
                </p>
                <p className="tabular-nums">
                  Last Attendance Scan:{' '}
                  {card.last_used_attendance_at ? card.last_used_attendance_at.slice(0, 16).replace('T', ' ') : 'Not scanned yet'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
