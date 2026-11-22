import React, { useCallback, useEffect, useState } from 'react';
import { Archive, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Select } from '../../../components/ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type {
  SchoolClassRecord,
  SubjectRecord,
  TeacherSubjectAssignmentRecord,
} from '../../../types/app.ts';

interface ClassLinkRow {
  class_subject_id: string;
  is_compulsory: number;
  weekly_periods: number;
  class_id: string;
  class_name: string;
  section: string;
  class_status: string;
}

export function SubjectDetailsPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<SubjectRecord | null>(null);
  const [classLinks, setClassLinks] = useState<ClassLinkRow[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherSubjectAssignmentRecord[]>([]);
  const [classesList, setClassesList] = useState<SchoolClassRecord[]>([]);

  // Edit subject
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('Core');
  const [description, setDescription] = useState('');
  const [isCompulsoryDefault, setIsCompulsoryDefault] = useState(true);
  const [saving, setSaving] = useState(false);

  // Map class form
  const [selectedClassId, setSelectedClassId] = useState('');
  const [isCompulsory, setIsCompulsory] = useState(true);
  const [weeklyPeriods, setWeeklyPeriods] = useState('3');
  const [linkingClass, setLinkingClass] = useState(false);

  // Confirmations
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<ClassLinkRow | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const loadData = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError(null);
    try {
      const [subRes, clsRes] = await Promise.all([
        apiRequest<{
          subject: SubjectRecord;
          classLinks: ClassLinkRow[];
          teacherAssignments: TeacherSubjectAssignmentRecord[];
        }>(`/api/school/subjects/${subjectId}`),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
      ]);
      setSubject(subRes.subject);
      setClassLinks(subRes.classLinks ?? []);
      setTeacherAssignments(subRes.teacherAssignments ?? []);
      setClassesList(clsRes.classes ?? []);

      setName(subRes.subject.name);
      setCode(subRes.subject.code);
      setCategory(subRes.subject.category);
      setDescription(subRes.subject.description);
      setIsCompulsoryDefault(subRes.subject.is_compulsory_default === 1);
      setIsCompulsory(subRes.subject.is_compulsory_default === 1);
      if (clsRes.classes?.length && !selectedClassId) {
        setSelectedClassId(clsRes.classes[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load subject details.');
    } finally {
      setLoading(false);
    }
  }, [subjectId, selectedClassId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !subject) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/school/subjects/${subjectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          category: category.trim(),
          description: description.trim(),
          isCompulsoryDefault,
          status: subject.status,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Subject updated',
        description: `${name.trim()} changes saved.`,
      });
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update subject.';
      setError(msg);
      showToast({ variant: 'error', title: 'Update failed', description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleLinkClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !selectedClassId) return;
    setLinkingClass(true);
    setError(null);
    try {
      await apiRequest(`/api/school/subjects/${subjectId}/classes`, {
        method: 'POST',
        body: JSON.stringify({
          classId: selectedClassId,
          isCompulsory,
          weeklyPeriods: Math.max(1, Number(weeklyPeriods) || 3),
        }),
      });
      showToast({
        variant: 'success',
        title: 'Class curriculum updated',
        description: 'Subject linked to selected class with period settings.',
      });
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to map subject to class.';
      setError(msg);
      showToast({ variant: 'error', title: 'Mapping failed', description: msg });
    } finally {
      setLinkingClass(false);
    }
  };

  const confirmArchiveToggle = async () => {
    if (!subjectId || !subject) return;
    setBusyAction(true);
    const nextStatus = subject.status === 'active' ? 'archived' : 'active';
    try {
      await apiRequest(`/api/school/subjects/${subjectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: subject.name,
          code: subject.code,
          category: subject.category,
          description: subject.description,
          isCompulsoryDefault: subject.is_compulsory_default === 1,
          status: nextStatus,
        }),
      });
      showToast({
        variant: 'success',
        title: nextStatus === 'archived' ? 'Subject archived' : 'Subject restored',
      });
      setArchiveConfirm(false);
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Status update failed',
        description: err instanceof Error ? err.message : 'Unable to change status.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const confirmUnlinkClass = async () => {
    if (!subjectId || !unlinkTarget) return;
    setBusyAction(true);
    try {
      await apiRequest(`/api/school/subjects/${subjectId}/classes/${unlinkTarget.class_subject_id}`, {
        method: 'DELETE',
      });
      showToast({
        variant: 'success',
        title: 'Class link removed',
        description: `${subject?.name} removed from ${unlinkTarget.class_name}.`,
      });
      setUnlinkTarget(null);
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Removal failed',
        description: err instanceof Error ? err.message : 'Unable to unlink class.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={subject ? `${subject.name} (${subject.code})` : 'Subject Details'}
        description="Edit curriculum metadata, assign compulsory/optional status per class, and inspect subject teachers."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/subjects">
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>All Subjects</span>
              </Button>
            </Link>
            {subject ? (
              <Link to={`/dashboard/school-admin/subjects/${subject.id}/assignments`}>
                <Button type="button" size="sm">
                  Assign Teachers ({teacherAssignments.filter((t) => t.is_active === 1).length})
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading || !subject ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            {loading ? 'Loading subject details...' : 'Subject not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Subject Profile</CardTitle>
                <CardDescription>
                  Status: <span className="capitalize font-medium">{subject.status}</span>
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setArchiveConfirm(true)}
                className={subject.status === 'active' ? 'text-red-600 hover:bg-red-50' : ''}
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
                <span>{subject.status === 'active' ? 'Archive Subject' : 'Restore Subject'}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSubject} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="esub-name">Subject Name *</Label>
                  <Input
                    id="esub-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="esub-code">Code *</Label>
                  <Input
                    id="esub-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="esub-cat">Category</Label>
                  <Input
                    id="esub-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-[#0F172A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isCompulsoryDefault}
                      onChange={(e) => setIsCompulsoryDefault(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                    />
                    <span>Compulsory by default</span>
                  </label>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="esub-desc">Description</Label>
                  <Input
                    id="esub-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Subject Details'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Class Curriculum Mapping ({classLinks.length})</CardTitle>
              <CardDescription>
                Assign this subject to specific classes and specify weekly periods and compulsory policy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {classesList.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No active classes configured.{' '}
                  <Link to="/dashboard/school-admin/classes/new" className="text-[#1E3A8A] font-semibold hover:underline">
                    Create a class first
                  </Link>
                  .
                </p>
              ) : (
                <form onSubmit={handleLinkClass} className="grid gap-4 sm:grid-cols-4 items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="map-class">Target Class *</Label>
                    <Select
                      id="map-class"
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                      {classesList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.section})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="map-periods">Weekly Periods</Label>
                    <Input
                      id="map-periods"
                      type="number"
                      min={1}
                      max={40}
                      value={weeklyPeriods}
                      onChange={(e) => setWeeklyPeriods(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center pb-2.5">
                    <label className="inline-flex items-center gap-2 text-sm text-[#0F172A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isCompulsory}
                        onChange={(e) => setIsCompulsory(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                      />
                      <span>Compulsory in class</span>
                    </label>
                  </div>

                  <Button type="submit" disabled={linkingClass}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>{linkingClass ? 'Saving...' : 'Assign Class'}</span>
                  </Button>
                </form>
              )}

              {classLinks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Weekly Periods</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classLinks.map((link) => (
                      <TableRow key={link.class_subject_id}>
                        <TableCell className="font-semibold">
                          <Link
                            to={`/dashboard/school-admin/classes/${link.class_id}`}
                            className="text-[#1E3A8A] hover:underline"
                          >
                            {link.class_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{link.section}</TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {link.is_compulsory === 1 ? 'Compulsory' : 'Optional'}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{link.weekly_periods}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setUnlinkTarget(link)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Remove</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={archiveConfirm}
        title={subject?.status === 'active' ? `Archive ${subject?.name}` : `Restore ${subject?.name}`}
        description="Archived subjects cannot be newly assigned to classes or teachers while retaining historical assignment logs."
        confirmLabel={subject?.status === 'active' ? 'Archive Subject' : 'Restore Subject'}
        destructive={subject?.status === 'active'}
        busy={busyAction}
        onCancel={() => setArchiveConfirm(false)}
        onConfirm={() => void confirmArchiveToggle()}
      />

      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        title="Remove Subject from Class"
        description={`Remove ${subject?.name ?? 'this subject'} from ${unlinkTarget?.class_name ?? 'selected class'} curriculum?`}
        confirmLabel="Remove Link"
        busy={busyAction}
        onCancel={() => setUnlinkTarget(null)}
        onConfirm={() => void confirmUnlinkClass()}
      />
    </div>
  );
}
