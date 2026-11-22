import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { PaginationMeta, ParentRecord } from '../../../types/app.ts';

export function ParentsPage() {
  const [parents, setParents] = useState<ParentRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const loadParents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);

      const res = await apiRequest<{ parents: ParentRecord[]; pagination: PaginationMeta }>(
        `/api/school/parents?${qs.toString()}`,
      );
      setParents(res.parents ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load parents directory.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    void loadParents();
  }, [loadParents]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parents & Guardians"
        description="Manage guardian profiles, linked student wards, emergency contact access, and Parent Portal accounts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/parents/wards">
              <Button type="button" size="sm" variant="outline">
                Ward Linkage Matrix
              </Button>
            </Link>
            <Link to="/dashboard/school-admin/parents/register">
              <Button type="button" size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Register Parent</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Guardian Directory ({pagination.total})</CardTitle>
            <CardDescription>Search by name, phone number, email, or occupation</CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Input
              aria-label="Search parents"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, phone, email..."
              className="w-60"
            />
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-36"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading parents directory...</p>
          ) : parents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">No parents or guardians registered</p>
              <p className="mt-1 text-xs text-slate-500">
                Register guardians directly or convert approved admission applications with guardian creation enabled.
              </p>
              <Link to="/dashboard/school-admin/parents/register" className="mt-4 inline-block">
                <Button type="button" size="sm">
                  Register Parent
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guardian Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Occupation</TableHead>
                    <TableHead>Linked Wards</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parents.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          to={`/dashboard/school-admin/parents/${p.id}`}
                          className="font-semibold text-[#1E3A8A] hover:underline"
                        >
                          {p.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        <p>{p.phone}</p>
                        {p.email ? <p className="text-slate-500">{p.email}</p> : null}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{p.occupation || '—'}</TableCell>
                      <TableCell className="text-xs tabular-nums text-slate-700">
                        {p.wards_count ?? 0} student(s)
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-slate-700">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              p.status === 'active' ? 'bg-emerald-600' : 'bg-red-600'
                            }`}
                          />
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2 whitespace-nowrap">
                          <Link to={`/dashboard/school-admin/parents/${p.id}`}>
                            <Button type="button" size="sm" variant="outline">
                              Profile
                            </Button>
                          </Link>
                          <Link to={`/dashboard/school-admin/parents/${p.id}/wards`}>
                            <Button type="button" size="sm" variant="outline">
                              Manage Wards
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                <span className="tabular-nums">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
