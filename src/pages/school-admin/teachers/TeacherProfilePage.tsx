import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Edit3, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { EntityDocumentRecord, TeacherRecord } from '../../../types/app.ts';

interface TeacherClassAssignment {
  id: string;
  class_id: string;
  class_name: string;
  class_section: string;
  arm_name: string | null;
  role_label: string;
  is_active: number;
  assigned_at: string;
  ended_at: string | null;
}

interface TeacherSubjectAssignment {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  class_name: string | null;
  arm_name: string | null;
  is_active: number;
  assigned_at: string;
  ended_at: string | null;
}

export function TeacherProfilePage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teacher, setTeacher] = useState<TeacherRecord | null>(null);
  const [classAssignments, setClassAssignments] = useState<TeacherClassAssignment[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<TeacherSubjectAssignment[]>([]);
  const [documents, setDocuments] = useState<EntityDocumentRecord[]>([]);

  const [pendingStatus, setPendingStatus] = useState<'active' | 'on_leave' | 'suspended' | 'terminated' | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadTeacher = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        teacher: TeacherRecord;
        classAssignments: TeacherClassAssignment[];
        subjectAssignments: TeacherSubjectAssignment[];
        documents: EntityDocumentRecord[];
      }>(`/api/school/teachers/${teacherId}`);
      setTeacher(res.teacher);
      setClassAssignments(res.classAssignments ?? []);
      setSubjectAssignments(res.subjectAssignments ?? []);
      setDocuments(res.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load teacher profile.');
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void loadTeacher();
  }, [loadTeacher]);

  const confirmStatusChange = async () => {
    if (!teacherId || !pendingStatus) return;
    setUpdatingStatus(true);
    try {
      await apiRequest(`/api/school/teachers/${teacherId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ employmentStatus: pendingStatus }),
      });
      showToast({
        variant: 'success',
        title: 'Employment status updated',
        description: `Teacher status updated to ${pendingStatus.replace('_', ' ')}.`,
      });
      setPendingStatus(null);
      await loadTeacher();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Status update failed',
        description: err instanceof Error ? err.message : 'Unable to change status.',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          teacher
            ? `${teacher.first_name} ${teacher.last_name} (${teacher.staff_id_number})`
            : 'Teacher Profile'
        }
        description="Complete educator record including personal profile, assigned classes, curriculum subjects, and documents."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/teachers">
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>All Teachers</span>
              </Button>
            </Link>
            {teacher ? (
              <>
                <Link to={`/dashboard/school-admin/teachers/${teacher.id}/documents`}>
                  <Button type="button" size="sm" variant="outline">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    <span>Documents ({documents.length})</span>
                  </Button>
                </Link>
                <Link to={`/dashboard/school-admin/teachers/${teacher.id}/edit`}>
                  <Button type="button" size="sm">
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                    <span>Edit Profile</span>
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading || !teacher ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            {loading ? 'Loading teacher profile...' : 'Teacher record not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  {teacher.photo_file_id ? (
                    <img
                      src={`/api/school/files/${teacher.photo_file_id}/download`}
                      alt={`${teacher.first_name} ${teacher.last_name}`}
                      className="h-16 w-16 rounded-xl border border-slate-200 object-cover bg-slate-50 shrink-0"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-[#1E3A8A] text-white font-bold text-lg">
                      {teacher.first_name[0]}
                      {teacher.last_name[0]}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-[#0F172A]">
                      {teacher.first_name} {teacher.middle_name ? `${teacher.middle_name} ` : ''}
                      {teacher.last_name}
                    </h2>
                    <p className="text-xs text-slate-600">
                      Staff ID: <span className="font-mono font-semibold">{teacher.staff_id_number}</span> ·{' '}
                      <span className="capitalize font-medium">
                        {teacher.employment_status.replace('_', ' ')}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {teacher.employment_status !== 'active' ? (
                    <Button type="button" size="sm" onClick={() => setPendingStatus('active')}>
                      Set Active
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPendingStatus('on_leave')}
                      >
                        Place on Leave
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPendingStatus('suspended')}
                        className="text-red-600 hover:bg-red-50"
                      >
                        Suspend
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personal &amp; Employment Details</CardTitle>
              <CardDescription>Academic qualifications, contact channels, and onboarding record</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Email Address</p>
                <p className="font-medium text-[#0F172A]">{teacher.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Phone Number</p>
                <p className="font-medium text-[#0F172A]">{teacher.phone}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Gender &amp; DOB</p>
                <p className="font-medium text-[#0F172A]">
                  {teacher.gender} {teacher.date_of_birth ? `· ${teacher.date_of_birth}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Employment Date</p>
                <p className="font-medium text-[#0F172A] tabular-nums">{teacher.employment_date}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Qualifications</p>
                <p className="font-medium text-[#0F172A]">{teacher.qualifications || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Specialization</p>
                <p className="font-medium text-[#0F172A]">{teacher.specialization || '—'}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-slate-500">Residential Address</p>
                <p className="font-medium text-[#0F172A]">{teacher.residential_address || '—'}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Assigned Classes ({classAssignments.length})</CardTitle>
                <CardDescription>Class Teacher and form tutor assignments</CardDescription>
              </CardHeader>
              <CardContent>
                {classAssignments.length === 0 ? (
                  <p className="text-xs text-slate-500">No class assignments recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classAssignments.map((ca) => (
                        <TableRow key={ca.id}>
                          <TableCell className="font-medium">
                            <Link
                              to={`/dashboard/school-admin/classes/${ca.class_id}`}
                              className="text-[#1E3A8A] hover:underline"
                            >
                              {ca.class_name}
                              {ca.arm_name ? ` (${ca.arm_name})` : ''}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">{ca.role_label}</TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {ca.is_active === 1 ? 'Active' : `Ended ${ca.ended_at?.slice(0, 10) ?? ''}`}
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
                <CardTitle>Assigned Subjects ({subjectAssignments.length})</CardTitle>
                <CardDescription>Curriculum subject allocations &amp; historical ledger</CardDescription>
              </CardHeader>
              <CardContent>
                {subjectAssignments.length === 0 ? (
                  <p className="text-xs text-slate-500">No subject assignments recorded yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Class Scope</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subjectAssignments.map((sa) => (
                        <TableRow key={sa.id}>
                          <TableCell className="font-medium">
                            <Link
                              to={`/dashboard/school-admin/subjects/${sa.subject_id}`}
                              className="text-[#1E3A8A] hover:underline"
                            >
                              {sa.subject_name} ({sa.subject_code})
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {sa.class_name
                              ? `${sa.class_name}${sa.arm_name ? ` (${sa.arm_name})` : ''}`
                              : 'General'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {sa.is_active === 1 ? 'Active' : `Ended ${sa.ended_at?.slice(0, 10) ?? ''}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title="Confirm Employment Status Update"
        description={`Change ${teacher?.first_name ?? ''} ${teacher?.last_name ?? ''}'s status to "${pendingStatus?.replace('_', ' ') ?? ''}"? Suspending or terminating revokes active portal sessions.`}
        confirmLabel="Update Status"
        destructive={pendingStatus === 'suspended' || pendingStatus === 'terminated'}
        busy={updatingStatus}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  );
}
