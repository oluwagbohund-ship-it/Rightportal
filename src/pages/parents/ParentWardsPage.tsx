import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../components/ui/alert.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { StudentGuardianRecord } from '../../types/app.ts';

export function ParentWardsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolContact, setSchoolContact] = useState('');
  const [wards, setWards] = useState<StudentGuardianRecord[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{
      profile: { contact_email: string; status: string } | null;
      wards: StudentGuardianRecord[];
    }>('/api/school/parent-workspace')
      .then((res) => {
        if (!active) return;
        setSchoolContact(res.profile?.contact_email ?? '');
        setWards(res.wards ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load linked student wards.');
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
        title="My Linked Wards"
        description="Verified guardian-to-student associations and academic visibility inside your school tenant."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Verified Student Wards ({wards.length})</CardTitle>
          <CardDescription>
            You can view enrollment status and authorized records exclusively for students linked to your guardian account at{' '}
            {user?.activeSchoolName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading verified wards...</p>
          ) : wards.length === 0 ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p>No student wards are currently linked to your parent profile.</p>
              {schoolContact ? (
                <p className="text-xs text-slate-500">
                  Contact school admissions/administration at{' '}
                  <span className="font-mono">{schoolContact}</span> to verify ward linkage.
                </p>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Ward Name</TableHead>
                  <TableHead>Class / Arm</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Permissions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wards.map((ward) => (
                  <TableRow key={ward.guardian_id}>
                    <TableCell className="font-mono text-xs">{ward.admission_number}</TableCell>
                    <TableCell className="font-semibold text-[#0F172A]">
                      {ward.first_name} {ward.middle_name ? `${ward.middle_name} ` : ''}
                      {ward.last_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {ward.class_name
                        ? `${ward.class_name}${ward.arm_name ? ` (${ward.arm_name})` : ''}`
                        : 'Pending Assignment'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{ward.relationship}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {[
                        ward.is_primary_guardian ? 'Primary Guardian' : null,
                        ward.can_pickup ? 'Pickup Authorized' : null,
                        ward.can_view_academic_records ? 'Academics Enabled' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Standard Guardian'}
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
