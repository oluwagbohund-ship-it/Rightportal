import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { SubjectRecord } from '../../../types/app.ts';

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ subjects: SubjectRecord[] }>(
        `/api/school/subjects?includeArchived=${includeArchived ? 'true' : 'false'}`,
      );
      setSubjects(res.subjects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load subjects.');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const categories = Array.from(new Set(subjects.map((s) => s.category).filter(Boolean))).sort();

  const filtered = subjects.filter((s) => {
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Curriculum Subjects"
        description="Manage school subjects, assign them as compulsory or optional per class, and allocate subject teachers."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/subjects/assignments">
              <Button type="button" size="sm" variant="outline">
                Teacher Assignments
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/subjects/new">
              <Button type="button" size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Create Subject</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Subjects Catalogue ({filtered.length})</CardTitle>
            <CardDescription>Organized academic curriculum across all class sections</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Search subjects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or code..."
              className="w-52"
            />
            <Select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-40"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>
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
            <p className="text-sm text-slate-500">Loading subjects...</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">No subjects registered yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Create core or elective subjects such as Mathematics, English, Biology, or ICT.
              </p>
              <Link to="/dashboard/school-admin/subjects/new" className="mt-4 inline-block">
                <Button type="button" size="sm">
                  Add First Subject
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Subject Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Default Mode</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Teachers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-mono text-xs">{sub.code}</TableCell>
                    <TableCell className="font-semibold">
                      <Link
                        to={`/dashboard/school-admin/subjects/${sub.id}`}
                        className="text-[#1E3A8A] hover:underline"
                      >
                        {sub.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{sub.category}</TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {sub.is_compulsory_default === 1 ? 'Compulsory' : 'Optional'}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {sub.assigned_classes_count ?? 0}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {sub.assigned_teachers_count ?? 0}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-slate-700">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            sub.status === 'active' ? 'bg-emerald-600' : 'bg-slate-400'
                          }`}
                        />
                        {sub.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2 whitespace-nowrap">
                        <Link to={`/dashboard/school-admin/subjects/${sub.id}`}>
                          <Button type="button" size="sm" variant="outline">
                            Details &amp; Classes
                          </Button>
                        </Link>
                        <Link to={`/dashboard/school-admin/subjects/${sub.id}/assignments`}>
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
