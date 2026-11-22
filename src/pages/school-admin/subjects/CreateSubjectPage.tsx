import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';

export function CreateSubjectPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('Core');
  const [description, setDescription] = useState('');
  const [isCompulsoryDefault, setIsCompulsoryDefault] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ subject: { id: string; name: string } }>('/api/school/subjects', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          category: category.trim(),
          description: description.trim(),
          isCompulsoryDefault,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Subject created',
        description: `${res.subject.name} was added to your curriculum catalog.`,
      });
      navigate(`/dashboard/school-admin/subjects/${res.subject.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create subject.';
      setError(msg);
      showToast({ variant: 'error', title: 'Creation failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Curriculum Subject"
        description="Define a new subject with unique curriculum code, department category, and compulsory policy."
        actions={
          <Link to="/dashboard/school-admin/subjects">
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Subjects</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Subject Details</CardTitle>
          <CardDescription>Codes must be unique within your school institution.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sub-name">Subject Name *</Label>
                <Input
                  id="sub-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Mathematics"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-code">Subject Code *</Label>
                <Input
                  id="sub-code"
                  required
                  maxLength={20}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g., MTH101"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-category">Department / Category</Label>
                <Select
                  id="sub-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Core">Core</option>
                  <option value="Sciences">Sciences</option>
                  <option value="Languages">Languages</option>
                  <option value="Humanities">Humanities</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Technical">Technical &amp; Computing</option>
                  <option value="Vocational">Vocational</option>
                  <option value="Arts">Arts &amp; Creative</option>
                </Select>
              </div>

              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[#0F172A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCompulsoryDefault}
                    onChange={(e) => setIsCompulsoryDefault(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#2563EB]"
                  />
                  <span>Compulsory subject by default</span>
                </label>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="sub-desc">Curriculum Description</Label>
                <Input
                  id="sub-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Syllabus focus and department notes..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link to="/dashboard/school-admin/subjects">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Subject'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
