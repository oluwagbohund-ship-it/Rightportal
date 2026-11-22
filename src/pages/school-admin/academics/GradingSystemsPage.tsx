import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Scale, Trash2 } from 'lucide-react';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { GradingSystemRecord, SchoolClassRecord } from '../../../types/app.ts';

interface DraftBand {
  minScore: number;
  maxScore: number;
  grade: string;
  remark: string;
  gradePoint: number;
  isPassing: boolean;
}

const DEFAULT_DRAFT_BANDS: DraftBand[] = [
  { minScore: 75, maxScore: 100, grade: 'A1', remark: 'Distinction', gradePoint: 5, isPassing: true },
  { minScore: 70, maxScore: 74.99, grade: 'B2', remark: 'Very Good', gradePoint: 4, isPassing: true },
  { minScore: 60, maxScore: 69.99, grade: 'B3', remark: 'Good', gradePoint: 3.5, isPassing: true },
  { minScore: 50, maxScore: 59.99, grade: 'C4', remark: 'Credit', gradePoint: 3, isPassing: true },
  { minScore: 40, maxScore: 49.99, grade: 'D7', remark: 'Pass', gradePoint: 2, isPassing: true },
  { minScore: 0, maxScore: 39.99, grade: 'F9', remark: 'Fail', gradePoint: 0, isPassing: false },
];

export function GradingSystemsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systems, setSystems] = useState<GradingSystemRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sectionScope, setSectionScope] = useState('Senior Secondary');
  const [classId, setClassId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [requireFullCoverage, setRequireFullCoverage] = useState(true);
  const [bands, setBands] = useState<DraftBand[]>(DEFAULT_DRAFT_BANDS);
  const [creating, setCreating] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gsRes, clsRes] = await Promise.all([
        apiRequest<{ gradingSystems: GradingSystemRecord[] }>(
          '/api/school/academics/grading-systems',
        ),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
      ]);
      setSystems(gsRes.gradingSystems ?? []);
      setClasses((clsRes.classes ?? []).filter((c) => c.status === 'active'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load grading systems.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSetDefault = async (id: string) => {
    setActivatingId(id);
    try {
      await apiRequest(`/api/school/academics/grading-systems/${id}/default`, {
        method: 'PATCH',
      });
      showToast({ variant: 'success', title: 'School default grading system updated' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Failed to set default',
        description: err instanceof Error ? err.message : 'Unable to update default grading scale.',
      });
    } finally {
      setActivatingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest('/api/school/academics/grading-systems', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          sectionScope,
          classId: classId || null,
          isDefault,
          requireFullCoverage,
          bands,
        }),
      });
      setName('');
      setDescription('');
      showToast({ variant: 'success', title: 'Grading system saved' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Invalid grading scale',
        description: err instanceof Error ? err.message : 'Unable to save grading system.',
      });
    } finally {
      setCreating(false);
    }
  };

  const updateBand = (index: number, patch: Partial<DraftBand>) => {
    setBands((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grading Systems & Threshold Bands"
        description="Configure multi-scale grading rules (0–100% coverage, zero overlapping intervals, GPA points, and pass flags)."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="pt-6 text-sm text-slate-500">
                Loading grading scales...
              </CardContent>
            </Card>
          ) : (
            systems.map((gs) => (
              <Card key={gs.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Scale className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
                      <span>{gs.name}</span>
                    </CardTitle>
                    <CardDescription>
                      {gs.section_scope}
                      {gs.class_name ? ` · ${gs.class_name}` : ''}
                      {gs.is_default === 1 ? ' · School Default' : ''}
                    </CardDescription>
                  </div>
                  {gs.is_default !== 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={activatingId === gs.id}
                      onClick={() => void handleSetDefault(gs.id)}
                    >
                      Set Default
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grade</TableHead>
                        <TableHead className="tabular-nums">Range (%)</TableHead>
                        <TableHead>Remark</TableHead>
                        <TableHead className="text-right tabular-nums">GP</TableHead>
                        <TableHead>Pass</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gs.bands.map((b, idx) => (
                        <TableRow key={b.id ?? idx}>
                          <TableCell className="font-bold text-[#1E3A8A]">{b.grade}</TableCell>
                          <TableCell className="tabular-nums text-xs">
                            {b.min_score} – {b.max_score}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">{b.remark}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {b.grade_point}
                          </TableCell>
                          <TableCell className="text-xs">
                            {b.is_passing === 1 ? 'Yes' : 'Fail'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create Custom Grading System</CardTitle>
            <CardDescription>
              Server enforces zero overlapping ranges, bounded 0–100 limits, and unique grade labels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gs-name">Scale Name</Label>
                  <Input
                    id="gs-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="WAEC / Senior Secondary Scale"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gs-scope">Section Scope</Label>
                  <Input
                    id="gs-scope"
                    value={sectionScope}
                    onChange={(e) => setSectionScope(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gs-cls">Class Override (opt.)</Label>
                  <Select id="gs-cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
                    <option value="">All Classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gs-desc">Notes</Label>
                  <Input
                    id="gs-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional policy notes"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Grade Threshold Bands</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setBands((prev) => [
                        ...prev,
                        { minScore: 0, maxScore: 0, grade: '', remark: '', gradePoint: 0, isPassing: true },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add Band</span>
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="hidden sm:grid sm:grid-cols-[68px_72px_58px_1fr_62px_36px_28px] gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <span>Min %</span>
                    <span>Max %</span>
                    <span>Grade</span>
                    <span>Remark</span>
                    <span className="text-center">GP</span>
                    <span className="text-center">Pass</span>
                    <span className="sr-only">Remove</span>
                  </div>
                  {bands.map((b, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-2 sm:grid-cols-[68px_72px_58px_1fr_62px_36px_28px] gap-1.5 items-center rounded-lg border border-slate-200 p-2 bg-slate-50"
                    >
                      <Input
                        className="h-8 px-2 text-xs tabular-nums"
                        type="number"
                        step="0.01"
                        placeholder="Min"
                        aria-label={`Band ${idx + 1} minimum score`}
                        value={b.minScore}
                        onChange={(e) => updateBand(idx, { minScore: Number(e.target.value) })}
                      />
                      <Input
                        className="h-8 px-2 text-xs tabular-nums"
                        type="number"
                        step="0.01"
                        placeholder="Max"
                        aria-label={`Band ${idx + 1} maximum score`}
                        value={b.maxScore}
                        onChange={(e) => updateBand(idx, { maxScore: Number(e.target.value) })}
                      />
                      <Input
                        className="h-8 px-2 text-xs font-semibold"
                        placeholder="Grade"
                        aria-label={`Band ${idx + 1} grade letter`}
                        value={b.grade}
                        onChange={(e) => updateBand(idx, { grade: e.target.value.toUpperCase() })}
                      />
                      <Input
                        className="h-8 px-2 text-xs col-span-2 sm:col-span-1"
                        placeholder="Remark"
                        aria-label={`Band ${idx + 1} remark`}
                        value={b.remark}
                        onChange={(e) => updateBand(idx, { remark: e.target.value })}
                      />
                      <Input
                        className="h-8 px-1.5 text-xs tabular-nums text-center"
                        type="number"
                        step="0.1"
                        placeholder="GP"
                        aria-label={`Band ${idx + 1} grade point`}
                        value={b.gradePoint}
                        onChange={(e) => updateBand(idx, { gradePoint: Number(e.target.value) })}
                      />
                      <label className="flex items-center justify-center cursor-pointer gap-1" title="Passing grade">
                        <input
                          type="checkbox"
                          checked={b.isPassing}
                          aria-label={`Band ${idx + 1} passing`}
                          onChange={(e) => updateBand(idx, { isPassing: e.target.checked })}
                        />
                        <span className="text-xs text-slate-600 sm:hidden">Pass</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setBands((prev) => prev.filter((_, i) => i !== idx))}
                        className="flex justify-center text-red-600 hover:text-red-700"
                        aria-label={`Remove band ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireFullCoverage}
                    onChange={(e) => setRequireFullCoverage(e.target.checked)}
                  />
                  <span>Require continuous 0–100% coverage with zero score gaps</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                  />
                  <span>Set immediately as school default grading system</span>
                </label>
              </div>

              <Button type="submit" disabled={creating} className="w-full">
                {creating ? 'Validating & Saving...' : 'Create Grading System'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
