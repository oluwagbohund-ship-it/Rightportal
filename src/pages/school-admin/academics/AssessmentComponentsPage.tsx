import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Trash2 } from 'lucide-react';
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
import type {
  AcademicTermRecord,
  AssessmentCategoryRecord,
  AssessmentComponentRecord,
  SchoolClassRecord,
  SubjectRecord,
} from '../../../types/app.ts';

export function AssessmentComponentsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [components, setComponents] = useState<AssessmentComponentRecord[]>([]);
  const [effectiveComponents, setEffectiveComponents] = useState<AssessmentComponentRecord[]>([]);
  const [weightValidation, setWeightValidation] = useState<{
    ok: boolean;
    totalWeight: number;
    error?: string;
  }>({ ok: true, totalWeight: 100 });
  const [categories, setCategories] = useState<AssessmentCategoryRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);

  // Create form
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [maxScore, setMaxScore] = useState('20');
  const [weightPercentage, setWeightPercentage] = useState('20');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [termId, setTermId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (classId) qs.set('classId', classId);
      if (subjectId) qs.set('subjectId', subjectId);
      if (termId) qs.set('termId', termId);

      const [compRes, catRes, clsRes, subRes, sessRes] = await Promise.all([
        apiRequest<{
          components: AssessmentComponentRecord[];
          effectiveComponents: AssessmentComponentRecord[];
          effectiveWeightValidation: { ok: boolean; totalWeight: number; error?: string };
        }>(`/api/school/academics/assessment-components?${qs.toString()}`),
        apiRequest<{ categories: AssessmentCategoryRecord[] }>(
          '/api/school/academics/assessment-categories',
        ),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
        apiRequest<{ subjects: SubjectRecord[] }>('/api/school/subjects'),
        apiRequest<{ terms: AcademicTermRecord[] }>('/api/school/academics/sessions'),
      ]);

      setComponents(compRes.components ?? []);
      setEffectiveComponents(compRes.effectiveComponents ?? []);
      setWeightValidation(compRes.effectiveWeightValidation ?? { ok: true, totalWeight: 0 });
      const loadedCats = catRes.categories ?? [];
      setCategories(loadedCats);
      if (!categoryId && loadedCats.length > 0) setCategoryId(loadedCats[0].id);
      setClasses((clsRes.classes ?? []).filter((c) => c.status === 'active'));
      setSubjects((subRes.subjects ?? []).filter((s) => s.status === 'active'));
      setTerms(sessRes.terms ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assessment components.');
    } finally {
      setLoading(false);
    }
  }, [categoryId, classId, subjectId, termId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/school/academics/assessment-components', {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          name,
          maxScore: Number(maxScore),
          weightPercentage: Number(weightPercentage),
          classId: classId || null,
          subjectId: subjectId || null,
          academicTermId: termId || null,
          displayOrder: components.length + 1,
        }),
      });
      setName('');
      showToast({ variant: 'success', title: 'Assessment component added' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Weight validation rejected update',
        description: err instanceof Error ? err.message : 'Unable to add component.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: AssessmentComponentRecord) => {
    setEditingId(c.id);
    try {
      await apiRequest(`/api/school/academics/assessment-components/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: c.is_active !== 1 }),
      });
      showToast({
        variant: 'success',
        title: c.is_active === 1 ? 'Component deactivated' : 'Component reactivated',
      });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update component.',
      });
    } finally {
      setEditingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setEditingId(id);
    try {
      await apiRequest(`/api/school/academics/assessment-components/${id}`, { method: 'DELETE' });
      showToast({ variant: 'success', title: 'Component removed or archived' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete component.',
      });
    } finally {
      setEditingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weighted Assessment Components"
        description="Manage CA tests, assignments, and exams globally or scoped to a class, subject, or term. Active weights inside each scope must total 100% before result computation."
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Alert variant={weightValidation.ok ? 'success' : 'error'}>
        Scope Effective Weight Sum: <strong className="tabular-nums">{weightValidation.totalWeight}%</strong>{' '}
        ({effectiveComponents.length} active component(s)).{' '}
        {weightValidation.ok
          ? 'Weight balance is valid (100%) for automated computation.'
          : weightValidation.error}
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#1E3A8A]" aria-hidden="true" />
              <span>Configured Components ({components.length})</span>
            </CardTitle>
            <CardDescription>
              Deactivate unused components first if adding new weighted items so total stays within 100%
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading components...</p>
            ) : components.length === 0 ? (
              <p className="text-sm text-slate-500">No assessment components defined yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right tabular-nums">Max / Weight</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {components.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold text-[#0F172A]">{c.name}</TableCell>
                      <TableCell className="text-xs text-slate-600">{c.category_name}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {[c.class_name, c.subject_name, c.term_name].filter(Boolean).join(' · ') ||
                          'School Default'}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {c.max_score} pts ·{' '}
                        <strong className="text-[#1E3A8A]">{c.weight_percentage}%</strong>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {c.is_active === 1 ? 'Active' : 'Inactive'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={editingId === c.id}
                            onClick={() => void handleToggleActive(c)}
                          >
                            {c.is_active === 1 ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50"
                            disabled={editingId === c.id}
                            onClick={() => void handleDelete(c.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Weighted Component</CardTitle>
            <CardDescription>Leave class/subject/term blank to define a school-wide default component</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="cmp-cat">Category</Label>
                <Select
                  id="cmp-cat"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.code})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cmp-name">Component Name</Label>
                <Input
                  id="cmp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project / Mid-Term Quiz"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cmp-max">Max Score</Label>
                  <Input
                    id="cmp-max"
                    type="number"
                    min={1}
                    max={1000}
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmp-wt">Weight (%)</Label>
                  <Input
                    id="cmp-wt"
                    type="number"
                    min={0.5}
                    max={100}
                    step="0.5"
                    value={weightPercentage}
                    onChange={(e) => setWeightPercentage(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cmp-cls">Scope Class (optional)</Label>
                <Select id="cmp-cls" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">All Classes (Default)</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cmp-sub">Scope Subject (optional)</Label>
                <Select
                  id="cmp-sub"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  <option value="">All Subjects (Default)</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cmp-term">Scope Term (optional)</Label>
                <Select id="cmp-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
                  <option value="">All Terms</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.session_name} · {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={saving || !categoryId} className="w-full">
                {saving ? 'Adding Component...' : 'Save Assessment Component'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
