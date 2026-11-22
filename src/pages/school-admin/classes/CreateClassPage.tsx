import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
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

interface ArmDraft {
  name: string;
  capacity: string;
  room: string;
}

export function CreateClassPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [levelOrder, setLevelOrder] = useState('1');
  const [section, setSection] = useState('Secondary');
  const [capacity, setCapacity] = useState('45');
  const [description, setDescription] = useState('');
  const [arms, setArms] = useState<ArmDraft[]>([
    { name: 'A', capacity: '40', room: '' },
  ]);

  const addArm = () => {
    setArms((prev) => [...prev, { name: '', capacity: '40', room: '' }]);
  };

  const removeArm = (index: number) => {
    setArms((prev) => prev.filter((_, i) => i !== index));
  };

  const updateArm = (index: number, patch: Partial<ArmDraft>) => {
    setArms((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const initialArms = arms
        .map((a) => ({
          name: a.name.trim(),
          capacity: Math.max(1, Number(a.capacity) || 40),
          room: a.room.trim(),
        }))
        .filter((a) => a.name.length > 0);

      const res = await apiRequest<{ class: { id: string; name: string } }>('/api/school/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          levelOrder: Math.max(1, Number(levelOrder) || 1),
          section: section.trim(),
          capacity: Math.max(1, Number(capacity) || 45),
          description: description.trim(),
          initialArms,
        }),
      });

      showToast({
        variant: 'success',
        title: 'Class created',
        description: `${res.class.name} was added with ${initialArms.length} arm(s).`,
      });
      navigate(`/dashboard/school-admin/classes/${res.class.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create class.';
      setError(msg);
      showToast({ variant: 'error', title: 'Creation failed', description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Academic Class"
        description="Define a custom class grade level, capacity limit, section grouping, and optional initial arms."
        actions={
          <Link to="/dashboard/school-admin/classes">
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Classes</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Class Configuration</CardTitle>
            <CardDescription>
              Use your school&apos;s naming system (e.g., Grade 7, JSS 1, Year 10, Primary 4).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cls-name">Class Name *</Label>
              <Input
                id="cls-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Grade 7 or JSS 1"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cls-code">Short Code</Label>
              <Input
                id="cls-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g., G7 or JSS1"
                maxLength={20}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cls-section">School Section</Label>
              <Select
                id="cls-section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                <option value="Early Years">Early Years</option>
                <option value="Primary">Primary</option>
                <option value="Junior Secondary">Junior Secondary</option>
                <option value="Senior Secondary">Senior Secondary</option>
                <option value="Secondary">Secondary</option>
                <option value="Vocational">Vocational</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cls-level">Level Order *</Label>
                <Input
                  id="cls-level"
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={levelOrder}
                  onChange={(e) => setLevelOrder(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cls-capacity">Class Capacity *</Label>
                <Input
                  id="cls-capacity"
                  type="number"
                  min={1}
                  max={2000}
                  required
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="cls-desc">Notes / Description</Label>
              <Input
                id="cls-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional department track or academic notes"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Class Arms / Streams (Optional)</CardTitle>
              <CardDescription>
                Divide this class into parallel arms such as A, B, Gold, or Science.
              </CardDescription>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addArm}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add Arm</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {arms.length === 0 ? (
              <p className="text-xs text-slate-500">No initial arms — students will enroll into the base class.</p>
            ) : (
              arms.map((arm, idx) => (
                <div key={idx} className="grid gap-3 sm:grid-cols-4 items-end rounded-lg border border-slate-200 p-3">
                  <div className="space-y-1">
                    <Label htmlFor={`arm-name-${idx}`}>Arm Name</Label>
                    <Input
                      id={`arm-name-${idx}`}
                      value={arm.name}
                      onChange={(e) => updateArm(idx, { name: e.target.value })}
                      placeholder="e.g., A, Gold, Science"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`arm-cap-${idx}`}>Capacity</Label>
                    <Input
                      id={`arm-cap-${idx}`}
                      type="number"
                      min={1}
                      max={500}
                      value={arm.capacity}
                      onChange={(e) => updateArm(idx, { capacity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`arm-room-${idx}`}>Room / Hall</Label>
                    <Input
                      id={`arm-room-${idx}`}
                      value={arm.room}
                      onChange={(e) => updateArm(idx, { room: e.target.value })}
                      placeholder="Block B Room 4"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeArm(idx)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span>Remove</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link to="/dashboard/school-admin/classes">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating Class...' : 'Create Class'}
          </Button>
        </div>
      </form>
    </div>
  );
}
