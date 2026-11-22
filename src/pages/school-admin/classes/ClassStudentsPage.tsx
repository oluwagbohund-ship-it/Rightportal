import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { ClassArmRecord, SchoolClassRecord } from '../../../types/app.ts';

interface ClassRosterStudent {
  id: string;
  admission_number: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  status: string;
  admission_date: string;
  current_arm_id: string | null;
  arm_name: string | null;
}

export function ClassStudentsPage() {
  const { classId } = useParams<{ classId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cls, setCls] = useState<SchoolClassRecord | null>(null);
  const [arms, setArms] = useState<ClassArmRecord[]>([]);
  const [students, setStudents] = useState<ClassRosterStudent[]>([]);
  const [armFilter, setArmFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!classId) return;
    let active = true;
    apiRequest<{
      class: SchoolClassRecord;
      arms: ClassArmRecord[];
      students: ClassRosterStudent[];
    }>(`/api/school/classes/${classId}`)
      .then((res) => {
        if (!active) return;
        setCls(res.class);
        setArms(res.arms ?? []);
        setStudents(res.students ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load class roster.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId]);

  const filtered = students.filter((s) => {
    if (armFilter !== 'all') {
      if (armFilter === 'unassigned' && s.current_arm_id !== null) return false;
      if (armFilter !== 'unassigned' && s.current_arm_id !== armFilter) return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      s.admission_number.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={cls ? `${cls.name} — Student Roster` : 'Class Students Roster'}
        description="Inspect enrolled students grouped by class arm and launch individual profile or promotion workflows."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={`/dashboard/school-admin/classes/${classId}`}>
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Class Details</span>
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/students/register">
              <Button type="button" size="sm">
                Register Student
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Enrolled Students ({filtered.length})</CardTitle>
            <CardDescription>Filter roster by arm or search by admission number</CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Input
              aria-label="Search roster"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or admission no..."
              className="w-56"
            />
            <Select
              aria-label="Filter by class arm"
              value={armFilter}
              onChange={(e) => setArmFilter(e.target.value)}
              className="w-44"
            >
              <option value="all">All Arms</option>
              <option value="unassigned">No Specific Arm</option>
              {arms.map((arm) => (
                <option key={arm.id} value={arm.id}>
                  Arm {arm.name}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading class roster...</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center">
              <p className="text-sm font-medium text-[#0F172A]">No students placed in this filter</p>
              <p className="mt-1 text-xs text-slate-500">
                Enroll new students or promote students into {cls?.name ?? 'this class'}.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Arm</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((st) => (
                  <TableRow key={st.id}>
                    <TableCell className="font-mono text-xs">{st.admission_number}</TableCell>
                    <TableCell className="font-medium">
                      <Link
                        to={`/dashboard/school-admin/students/${st.id}`}
                        className="text-[#1E3A8A] hover:underline"
                      >
                        {st.first_name} {st.middle_name ? `${st.middle_name} ` : ''}
                        {st.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{st.arm_name || '—'}</TableCell>
                    <TableCell className="text-xs text-slate-600">{st.gender}</TableCell>
                    <TableCell className="text-xs capitalize text-slate-700">{st.status}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2 whitespace-nowrap">
                        <Link to={`/dashboard/school-admin/students/${st.id}`}>
                          <Button type="button" size="sm" variant="outline">
                            Profile
                          </Button>
                        </Link>
                        <Link to={`/dashboard/school-admin/students/${st.id}/promotions`}>
                          <Button type="button" size="sm" variant="outline">
                            Promote / Transfer
                          </Button>
                        </Link>
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
