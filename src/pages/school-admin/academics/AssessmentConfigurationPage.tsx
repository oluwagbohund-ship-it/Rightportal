import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { AssessmentCategoryRecord, AssessmentComponentRecord } from '../../../types/app.ts';

export function AssessmentConfigurationPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<AssessmentCategoryRecord[]>([]);
  const [effectiveComponents, setEffectiveComponents] = useState<AssessmentComponentRecord[]>([]);
  const [weightOk, setWeightOk] = useState(true);
  const [weightTotal, setWeightTotal] = useState(100);
  const [weightError, setWeightError] = useState<string | undefined>();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isExam, setIsExam] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, compRes] = await Promise.all([
        apiRequest<{ categories: AssessmentCategoryRecord[] }>(
          '/api/school/academics/assessment-categories',
        ),
        apiRequest<{
          effectiveComponents: AssessmentComponentRecord[];
          effectiveWeightValidation: { ok: boolean; totalWeight: number; error?: string };
        }>('/api/school/academics/assessment-components'),
      ]);
      setCategories(catRes.categories ?? []);
      setEffectiveComponents(compRes.effectiveComponents ?? []);
      setWeightOk(compRes.effectiveWeightValidation?.ok ?? true);
      setWeightTotal(compRes.effectiveWeightValidation?.totalWeight ?? 0);
      setWeightError(compRes.effectiveWeightValidation?.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assessment configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest('/api/school/academics/assessment-categories', {
        method: 'POST',
        body: JSON.stringify({
          name,
          code: code.toUpperCase(),
          description,
          isExam,
          displayOrder: categories.length + 1,
        }),
      });
      setName('');
      setCode('');
      setDescription('');
      setIsExam(false);
      showToast({ variant: 'success', title: 'Assessment category added' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Unable to create category',
        description: err instanceof Error ? err.message : 'Category code may already exist.',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessment Categories & Structure"
        description="Define continuous assessment (CA), project, practical, and examination categories governing score sheets and terminal computation."
        actions={
          <Link to="/dashboard/school-admin/academics/assessments/components">
            <Button type="button" size="sm">
              <span>Configure Weighted Components</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {!weightOk && weightError ? (
        <Alert variant="error" title="Default Weight Validation Notice">
          {weightError} Visit Weighted Components to rebalance active weights to 100%.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Assessment Categories ({categories.length})</span>
            </CardTitle>
            <CardDescription>
              Each category groups assessment components cleanly into CA vs Examination columns on report cards
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading categories...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Category Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-mono text-xs font-semibold text-[#1E3A8A]">
                        {cat.code}
                      </TableCell>
                      <TableCell className="font-semibold text-[#0F172A]">{cat.name}</TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {cat.is_exam === 1 ? 'Terminal Exam' : 'Continuous Assessment'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{cat.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Assessment Category</CardTitle>
            <CardDescription>Create custom assessment buckets (e.g. Lab Practicals)</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateCategory} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Category Name</Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Laboratory Practical"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-code">Short Code</Label>
                <Input
                  id="cat-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="LAB"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-desc">Description</Label>
                <Input
                  id="cat-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Science practical evaluation"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isExam}
                  onChange={(e) => setIsExam(e.target.checked)}
                />
                <span>Treat as Examination score on Report Card</span>
              </label>
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? 'Adding Category...' : 'Create Category'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active School-Wide Weight Distribution ({weightTotal}%)</CardTitle>
            <CardDescription>Effective default components applied whenever a class or subject has no custom override</CardDescription>
          </div>
          <Link to="/dashboard/school-admin/academics/assessments/components">
            <Button type="button" size="sm" variant="outline">
              Edit Component Weights
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right tabular-nums">Max Raw Score</TableHead>
                <TableHead className="text-right tabular-nums">Weight (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {effectiveComponents.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold text-[#0F172A]">{c.name}</TableCell>
                  <TableCell className="text-xs text-slate-600">{c.category_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.max_score}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-[#1E3A8A]">
                    {c.weight_percentage}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
