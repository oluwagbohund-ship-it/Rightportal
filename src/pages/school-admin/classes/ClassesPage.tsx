import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { SchoolClassRecord } from '../../../types/app.ts';

export function ClassesPage() {
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ classes: SchoolClassRecord[] }>(
        `/api/school/classes?includeArchived=${includeArchived ? 'true' : 'false'}`,
      );
      setClasses(res.classes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load classes.');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  const filtered = classes.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.section.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes & Class Arms"
        description="Configure your school's custom class hierarchy, sections, capacity limits, arms, and teaching assignments."
        actions={
          <Link to="/dashboard/school-admin/classes/new">
            <Button type="button" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Create Class</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Class Directory ({filtered.length})</CardTitle>
            <CardDescription>
              Custom school structure ordered by academic progression level.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Search classes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search class name, code, or section..."
              className="w-64"
            />
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#2563EB]"
              />
              <span>Show archived</span>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading classes...</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">No classes configured yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Create classes like Primary 1, Grade 7, or SS 2 with optional arms (A, B, Science).
              </p>
              <Link to="/dashboard/school-admin/classes/new" className="mt-4 inline-block">
                <Button type="button" size="sm">
                  Create First Class
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Name</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Arms</TableHead>
                  <TableHead>Students / Capacity</TableHead>
                  <TableHead>Teachers</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((cls) => (
                  <TableRow key={cls.id}>
                    <TableCell>
                      <Link
                        to={`/dashboard/school-admin/classes/${cls.id}`}
                        className="font-semibold text-[#1E3A8A] hover:underline"
                      >
                        {cls.name}
                      </Link>
                      {cls.code ? (
                        <p className="font-mono text-xs text-slate-500">{cls.code}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{cls.section || 'General'}</TableCell>
                    <TableCell className="text-xs text-slate-700 tabular-nums">
                      {cls.arms && cls.arms.length > 0
                        ? cls.arms.map((a) => a.name).join(', ')
                        : `${cls.active_arms_count ?? 0} arms`}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700 tabular-nums">
                      {cls.active_students_count ?? 0} / {cls.capacity}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700 tabular-nums">
                      {cls.active_teachers_count ?? 0}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700 tabular-nums">
                      {cls.subjects_count ?? 0}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-semibold capitalize ${
                          cls.status === 'active' ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {cls.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2 whitespace-nowrap">
                        <Link to={`/dashboard/school-admin/classes/${cls.id}`}>
                          <Button type="button" size="sm" variant="outline">
                            Manage
                          </Button>
                        </Link>
                        <Link to={`/dashboard/school-admin/classes/${cls.id}/students`}>
                          <Button type="button" size="sm" variant="outline">
                            Roster
                          </Button>
                        </Link>
                        <Link to={`/dashboard/school-admin/classes/${cls.id}/teachers`}>
                          <Button type="button" size="sm" variant="outline">
                            Teachers
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
