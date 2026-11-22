import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Edit3, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card.tsx';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.tsx';
import { useToast } from '../../../context/ToastContext.tsx';
import { apiRequest } from '../../../lib/api.ts';
import { formatBytes } from '../../../lib/files.ts';
import type {
  EntityDocumentRecord,
  PromotionRecommendationRecord,
  ResultPublicationRecord,
  StudentClassHistoryRecord,
  StudentGuardianRecord,
  StudentRecord,
  StudentSubjectEnrollmentRecord,
} from '../../../types/app.ts';

export function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [guardians, setGuardians] = useState<StudentGuardianRecord[]>([]);
  const [history, setHistory] = useState<StudentClassHistoryRecord[]>([]);
  const [documents, setDocuments] = useState<EntityDocumentRecord[]>([]);
  const [subjectEnrollments, setSubjectEnrollments] = useState<StudentSubjectEnrollmentRecord[]>([]);
  const [termSummaries, setTermSummaries] = useState<ResultPublicationRecord[]>([]);
  const [promotionRecommendations, setPromotionRecommendations] = useState<
    PromotionRecommendationRecord[]
  >([]);

  const [pendingStatus, setPendingStatus] = useState<
    'active' | 'suspended' | 'graduated' | 'withdrawn' | null
  >(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const [res, academicRes] = await Promise.all([
        apiRequest<{
          student: StudentRecord;
          guardians: StudentGuardianRecord[];
          history: StudentClassHistoryRecord[];
          documents: EntityDocumentRecord[];
        }>(`/api/school/students/${studentId}`),
        apiRequest<{
          subjectEnrollments: StudentSubjectEnrollmentRecord[];
          termSummaries: ResultPublicationRecord[];
          promotions: PromotionRecommendationRecord[];
        }>(`/api/school/academics/students/${studentId}/academic-history`).catch(() => ({
          subjectEnrollments: [],
          termSummaries: [],
          promotions: [],
        })),
      ]);
      setStudent(res.student);
      setGuardians(res.guardians ?? []);
      setHistory(res.history ?? []);
      setDocuments(res.documents ?? []);
      setSubjectEnrollments(academicRes.subjectEnrollments ?? []);
      setTermSummaries(academicRes.termSummaries ?? []);
      setPromotionRecommendations(academicRes.promotions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load student profile.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const confirmStatusUpdate = async () => {
    if (!studentId || !pendingStatus) return;
    setUpdatingStatus(true);
    try {
      await apiRequest(`/api/school/students/${studentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: pendingStatus }),
      });
      showToast({
        variant: 'success',
        title: 'Enrollment status updated',
        description: `Student record marked ${pendingStatus}.`,
      });
      setPendingStatus(null);
      await loadProfile();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Status update failed',
        description: err instanceof Error ? err.message : 'Unable to update status.',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          student
            ? `${student.first_name} ${student.last_name} (${student.admission_number})`
            : 'Student Profile'
        }
        description="Structured 6-part institutional student record: personal details, placement, guardians, documents, admission info, and promotion history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/dashboard/school-admin/students">
              <Button type="button" size="sm" variant="outline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>All Students</span>
              </Button>
            </Link>
            {student ? (
              <>
                <Link to={`/dashboard/school-admin/students/${student.id}/promotions`}>
                  <Button type="button" size="sm" variant="outline">
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    <span>Promote / Transfer</span>
                  </Button>
                </Link>
                <Link to={`/dashboard/school-admin/students/${student.id}/documents`}>
                  <Button type="button" size="sm" variant="outline">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    <span>Documents ({documents.length})</span>
                  </Button>
                </Link>
                <Link to={`/dashboard/school-admin/students/${student.id}/edit`}>
                  <Button type="button" size="sm">
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                    <span>Edit Student</span>
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading || !student ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            {loading ? 'Loading complete student profile...' : 'Student record not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  {student.photo_file_id ? (
                    <img
                      src={`/api/school/files/${student.photo_file_id}/download`}
                      alt={`${student.first_name} ${student.last_name}`}
                      className="h-16 w-16 rounded-xl border border-slate-200 object-cover bg-slate-50 shrink-0"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-[#0F172A] text-white font-bold text-lg">
                      {student.first_name[0]}
                      {student.last_name[0]}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-[#0F172A]">
                      {student.first_name} {student.middle_name ? `${student.middle_name} ` : ''}
                      {student.last_name}
                    </h2>
                    <p className="text-xs text-slate-600">
                      Admission No:{' '}
                      <span className="font-mono font-semibold">{student.admission_number}</span> ·{' '}
                      <span className="capitalize font-medium">{student.status}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {student.status !== 'active' ? (
                    <Button type="button" size="sm" onClick={() => setPendingStatus('active')}>
                      Restore Active Status
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPendingStatus('graduated')}
                      >
                        Mark Graduated
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
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPendingStatus('withdrawn')}
                        className="text-red-600 hover:bg-red-50"
                      >
                        Withdraw
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 1. Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle>1. Personal Information</CardTitle>
                <CardDescription>Verified demographic &amp; contact details</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Full Name</p>
                  <p className="font-medium text-[#0F172A]">
                    {student.first_name} {student.middle_name} {student.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Gender &amp; Date of Birth</p>
                  <p className="font-medium text-[#0F172A]">
                    {student.gender} · <span className="tabular-nums">{student.date_of_birth}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Nationality / Origin</p>
                  <p className="font-medium text-[#0F172A]">
                    {student.nationality || '—'}
                    {student.state_of_origin ? ` · ${student.state_of_origin}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Contact</p>
                  <p className="font-medium text-[#0F172A]">
                    {student.student_email || 'No student email'}
                    {student.student_phone ? ` · ${student.student_phone}` : ''}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">Residential Address</p>
                  <p className="font-medium text-[#0F172A]">{student.residential_address || '—'}</p>
                </div>
              </CardContent>
            </Card>

            {/* 2. Academic Placement */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>2. Academic Placement</CardTitle>
                  <CardDescription>Current class &amp; arm assignment</CardDescription>
                </div>
                <Link to={`/dashboard/school-admin/students/${student.id}/promotions`}>
                  <Button type="button" size="sm" variant="outline">
                    Change Class
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Current Class</p>
                  <p className="font-semibold text-[#1E3A8A]">
                    {student.class_name ? (
                      <Link
                        to={`/dashboard/school-admin/classes/${student.current_class_id}`}
                        className="hover:underline"
                      >
                        {student.class_name}
                      </Link>
                    ) : (
                      'Unassigned'
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Class Arm</p>
                  <p className="font-medium text-[#0F172A]">{student.arm_name || 'General / None'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">School Section</p>
                  <p className="font-medium text-[#0F172A]">{student.class_section || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Portal Account</p>
                  <p className="font-medium text-[#0F172A]">
                    {student.user_id ? 'Linked & Enabled' : 'Managed via Parent/Guardian'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 3. Parent and Guardian Details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>3. Parent &amp; Guardian Details ({guardians.length})</CardTitle>
                <CardDescription>
                  Verified family links and emergency contact designation
                </CardDescription>
              </div>
              <Link to="/dashboard/school-admin/parents/wards">
                <Button type="button" size="sm" variant="outline">
                  Manage Guardian Links
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <span className="font-semibold text-[#0F172A]">Primary Emergency Contact:</span>{' '}
                {student.emergency_contact_name || '—'} ({student.emergency_contact_relationship || '—'}
                ) · {student.emergency_contact_phone || '—'}
              </div>

              {guardians.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No parent/guardian profiles linked to this student yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guardian Name</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Permissions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guardians.map((g) => (
                      <TableRow key={g.guardian_id}>
                        <TableCell className="font-medium">
                          <Link
                            to={`/dashboard/school-admin/parents/${g.parent_id}`}
                            className="text-[#1E3A8A] hover:underline"
                          >
                            {g.full_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">{g.relationship}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {g.phone}
                          {g.email ? ` · ${g.email}` : ''}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {[
                            g.is_primary_guardian ? 'Primary' : null,
                            g.can_pickup ? 'Pickup' : null,
                            g.can_view_academic_records ? 'Academics' : null,
                          ]
                            .filter(Boolean)
                            .join(', ') || 'Standard'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 4. Documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>4. Documents ({documents.length})</CardTitle>
                  <CardDescription>Birth certificates, transcripts, and medical records</CardDescription>
                </div>
                <Link to={`/dashboard/school-admin/students/${student.id}/documents`}>
                  <Button type="button" size="sm" variant="outline">
                    Open Vault
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <p className="text-xs text-slate-500">No student documents uploaded yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {documents.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[#0F172A] truncate">{doc.title}</p>
                          <p className="text-xs text-slate-500">
                            {doc.document_type} · {formatBytes(doc.size_bytes)}
                          </p>
                        </div>
                        <a
                          href={`/api/school/files/${doc.file_id}/download`}
                          className="text-xs font-semibold text-[#1E3A8A] hover:underline shrink-0"
                        >
                          Download
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* 5. Admission Information */}
            <Card>
              <CardHeader>
                <CardTitle>5. Admission Information</CardTitle>
                <CardDescription>Original entry date, previous school, and application reference</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Admission Number</p>
                  <p className="font-mono font-semibold text-[#0F172A]">
                    {student.admission_number}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Admission Date</p>
                  <p className="font-medium text-[#0F172A] tabular-nums">
                    {student.admission_date}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Previous Institution</p>
                  <p className="font-medium text-[#0F172A]">{student.previous_school || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Intake Channel</p>
                  <p className="font-medium text-[#0F172A]">
                    {student.admission_application_id ? (
                      <Link
                        to={`/dashboard/school-admin/admissions/${student.admission_application_id}`}
                        className="text-[#1E3A8A] hover:underline"
                      >
                        Converted from Application
                      </Link>
                    ) : (
                      'Direct Admin Registration'
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 6. Status and Promotion History */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>6. Status &amp; Promotion History ({history.length})</CardTitle>
                <CardDescription>
                  Immutable academic progression timeline from initial placement onward
                </CardDescription>
              </div>
              <Link to={`/dashboard/school-admin/students/${student.id}/promotions`}>
                <Button type="button" size="sm">
                  Promote / Transfer Student
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-xs text-slate-500">No class placement history recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>From Class</TableHead>
                      <TableHead>To Class</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Recorded By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs tabular-nums">{h.effective_date}</TableCell>
                        <TableCell className="text-xs font-medium capitalize text-[#0F172A]">
                          {h.action_type.replace('_', ' ')}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {h.from_class_name
                            ? `${h.from_class_name}${h.from_arm_name ? ` (${h.from_arm_name})` : ''}`
                            : 'Initial Entry'}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-[#1E3A8A]">
                          {h.to_class_name}
                          {h.to_arm_name ? ` (${h.to_arm_name})` : ''}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{h.notes || '—'}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {h.recorded_by_name || 'School Admin'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* 7. Academic Enrollment & Terminal Results History */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>
                  7. Academic Enrollment &amp; Terminal Results ({termSummaries.length})
                </CardTitle>
                <CardDescription>
                  Registered subject enrollments, computed terminal averages, official PDF report cards, and Phase 3 promotion evaluations
                </CardDescription>
              </div>
              <Link to="/dashboard/school-admin/academics/enrollments">
                <Button type="button" size="sm" variant="outline">
                  Manage Subject Enrollments
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Terminal Result Summaries
                </h3>
                {termSummaries.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No computed terminal results recorded for this student yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Session / Term</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-right">Average</TableHead>
                        <TableHead className="text-center">Grade</TableHead>
                        <TableHead className="text-center">Position</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Report Card PDF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {termSummaries.map((sum) => (
                        <TableRow key={sum.id}>
                          <TableCell className="font-medium text-[#0F172A]">
                            {sum.session_name} · {sum.term_name}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {sum.class_name}
                            {sum.arm_name ? ` (${sum.arm_name})` : ''}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-[#1E3A8A]">
                            {sum.average_score}%
                          </TableCell>
                          <TableCell className="text-center font-bold">{sum.overall_grade}</TableCell>
                          <TableCell className="text-center tabular-nums text-xs">
                            {sum.class_position ? `${sum.class_position} / ${sum.class_size}` : '—'}
                          </TableCell>
                          <TableCell className="text-xs capitalize text-slate-700">
                            {sum.status.replace('_', ' ')}
                          </TableCell>
                          <TableCell className="text-right">
                            <a
                              href={`/api/school/academics/report-cards/${student.id}/pdf?academicTermId=${encodeURIComponent(sum.academic_term_id)}`}
                              className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                              download
                            >
                              Download PDF
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Subject Enrollments ({subjectEnrollments.length})
                  </h3>
                  {subjectEnrollments.length === 0 ? (
                    <p className="text-xs text-slate-500">No subject enrollments assigned yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {subjectEnrollments.slice(0, 16).map((enr) => (
                        <span
                          key={enr.id}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-[#0F172A]"
                        >
                          {enr.subject_name} ({enr.session_name})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Promotion Recommendations ({promotionRecommendations.length})
                  </h3>
                  {promotionRecommendations.length === 0 ? (
                    <p className="text-xs text-slate-500">No automated promotion evaluations yet.</p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {promotionRecommendations.map((pr) => (
                        <li
                          key={pr.id}
                          className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                        >
                          <span>
                            <strong>{pr.session_name}</strong> ·{' '}
                            {pr.recommendation.replace(/_/g, ' ')} ({pr.average_score}%)
                          </span>
                          <span className="capitalize font-semibold text-[#1E3A8A]">
                            {pr.approval_status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title="Confirm Student Status Change"
        description={`Update ${student?.first_name ?? ''} ${student?.last_name ?? ''}'s status to "${pendingStatus ?? ''}"? Suspending or withdrawing revokes portal login sessions while retaining historical records.`}
        confirmLabel="Confirm Status Change"
        destructive={pendingStatus === 'suspended' || pendingStatus === 'withdrawn'}
        busy={updatingStatus}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => void confirmStatusUpdate()}
      />
    </div>
  );
}
