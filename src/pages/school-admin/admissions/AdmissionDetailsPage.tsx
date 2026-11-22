import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { formatBytes, readFileAsBase64 } from '../../../lib/files.ts';
import type {
  AdmissionApplicationRecord,
  AdmissionHistoryRecord,
  EntityDocumentRecord,
  SchoolClassRecord,
} from '../../../types/app.ts';

export function AdmissionDetailsPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [application, setApplication] = useState<AdmissionApplicationRecord | null>(null);
  const [documents, setDocuments] = useState<EntityDocumentRecord[]>([]);
  const [history, setHistory] = useState<AdmissionHistoryRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);

  // Supporting document upload
  const [docType, setDocType] = useState('Birth Certificate');
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Review state
  const [reviewNotes, setReviewNotes] = useState('');
  const [pendingDecision, setPendingDecision] = useState<'approve' | 'request_info' | 'reject' | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Explicit conversion state
  const [convertClassId, setConvertClassId] = useState('');
  const [convertArmId, setConvertArmId] = useState('');
  const [convertAdmissionNo, setConvertAdmissionNo] = useState('');
  const [convertDate, setConvertDate] = useState(new Date().toISOString().slice(0, 10));
  const [createGuardianRecord, setCreateGuardianRecord] = useState(true);
  const [converting, setConverting] = useState(false);

  const loadData = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const [appRes, clsRes] = await Promise.all([
        apiRequest<{
          application: AdmissionApplicationRecord;
          documents: EntityDocumentRecord[];
          history: AdmissionHistoryRecord[];
        }>(`/api/school/admissions/${applicationId}`),
        apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes'),
      ]);
      setApplication(appRes.application);
      setDocuments(appRes.documents ?? []);
      setHistory(appRes.history ?? []);
      setClasses(clsRes.classes ?? []);
      setConvertClassId(appRes.application.desired_class_id ?? clsRes.classes?.[0]?.id ?? '');
      setConvertArmId(appRes.application.desired_arm_id ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admission application.');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationId || !docFile) return;
    setUploadingDoc(true);
    try {
      const contentBase64 = await readFileAsBase64(docFile);
      await apiRequest(`/api/school/admissions/${applicationId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          documentType: docType,
          title: docTitle.trim() || docFile.name,
          fileName: docFile.name,
          mimeType: docFile.type || 'application/pdf',
          contentBase64,
        }),
      });
      setDocTitle('');
      setDocFile(null);
      showToast({ variant: 'success', title: 'Supporting document uploaded' });
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unable to upload file.',
      });
    } finally {
      setUploadingDoc(false);
    }
  };

  const confirmReviewDecision = async () => {
    if (!applicationId || !pendingDecision) return;
    setSubmittingReview(true);
    try {
      await apiRequest(`/api/school/admissions/${applicationId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision: pendingDecision,
          reviewNotes:
            reviewNotes.trim() ||
            (pendingDecision === 'approve'
              ? 'Approved by admissions committee'
              : pendingDecision === 'reject'
                ? 'Application declined'
                : 'Additional documents requested'),
        }),
      });
      showToast({
        variant: 'success',
        title: 'Review decision recorded',
        description:
          pendingDecision === 'approve'
            ? 'Application is approved. Complete conversion below to enroll as a student.'
            : 'Application workflow status updated.',
      });
      setReviewNotes('');
      setPendingDecision(null);
      await loadData();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Review failed',
        description: err instanceof Error ? err.message : 'Unable to submit decision.',
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleConvertToStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicationId || !convertClassId) return;
    setConverting(true);
    setError(null);
    try {
      const res = await apiRequest<{
        studentId: string;
        admissionNumber: string;
      }>(`/api/school/admissions/${applicationId}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          admissionNumber: convertAdmissionNo.trim(),
          admissionDate: convertDate,
          classId: convertClassId,
          armId: convertArmId || null,
          createGuardianRecord,
        }),
      });
      showToast({
        variant: 'success',
        title: 'Student enrolled',
        description: `Converted to Student ${res.admissionNumber}.`,
      });
      navigate(`/dashboard/school-admin/students/${res.studentId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to convert application.';
      setError(msg);
      showToast({ variant: 'error', title: 'Conversion failed', description: msg });
    } finally {
      setConverting(false);
    }
  };

  const selectedConvertClass = classes.find((c) => c.id === convertClassId);
  const availableArms = selectedConvertClass?.arms?.filter((a) => a.status === 'active') ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          application
            ? `${application.application_reference} — ${application.applicant_first_name} ${application.applicant_last_name}`
            : 'Admission Application Details'
        }
        description="Inspect applicant credentials, manage review decisions, and complete explicit enrollment conversion upon approval."
        actions={
          <Link to="/dashboard/school-admin/admissions/applications">
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Applications Queue</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading || !application ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            {loading ? 'Loading application dossier...' : 'Application record not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          {application.status === 'converted' && application.converted_student_id ? (
            <Alert variant="success" title="Converted to Active Student Record">
              This application was converted to Student{' '}
              <Link
                to={`/dashboard/school-admin/students/${application.converted_student_id}`}
                className="font-mono font-bold underline"
              >
                {application.converted_admission_number ?? application.converted_student_id}
              </Link>
              .
            </Alert>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Applicant Profile</CardTitle>
                <CardDescription>
                  Status:{' '}
                  <span className="font-semibold capitalize text-[#0F172A]">
                    {application.status.replaceAll('_', ' ')}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Full Name</p>
                  <p className="font-medium text-[#0F172A]">
                    {application.applicant_first_name} {application.applicant_middle_name}{' '}
                    {application.applicant_last_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Gender &amp; DOB</p>
                  <p className="font-medium text-[#0F172A]">
                    {application.gender} · {application.date_of_birth}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Desired Class</p>
                  <p className="font-semibold text-[#1E3A8A]">
                    {application.desired_class_name ?? '—'}
                    {application.desired_arm_name ? ` (${application.desired_arm_name})` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Previous School</p>
                  <p className="font-medium text-[#0F172A]">{application.previous_school || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">Residential Address</p>
                  <p className="font-medium text-[#0F172A]">{application.residential_address}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guardian &amp; Sponsor</CardTitle>
                <CardDescription>Primary family contact for this intake application</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Guardian Name</p>
                  <p className="font-medium text-[#0F172A]">{application.guardian_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Relationship</p>
                  <p className="font-medium text-[#0F172A]">{application.guardian_relationship}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="font-medium text-[#0F172A]">{application.guardian_phone}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="font-medium text-[#0F172A]">{application.guardian_email || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">Notes</p>
                  <p className="text-xs text-slate-700">{application.notes || 'None'}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Explicit Conversion Form (ONLY when approved) */}
          {application.status === 'approved' ? (
            <Card className="border-[#2563EB]/40">
              <CardHeader>
                <CardTitle>Complete Registration &amp; Convert to Student</CardTitle>
                <CardDescription>
                  Confirm final admission number, target class placement, and guardian creation to enroll this approved applicant.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleConvertToStudent} className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="conv-admno">Admission Number (Blank for auto-gen)</Label>
                    <Input
                      id="conv-admno"
                      value={convertAdmissionNo}
                      onChange={(e) => setConvertAdmissionNo(e.target.value)}
                      placeholder="Auto-generated if left blank"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="conv-date">Official Admission Date *</Label>
                    <Input
                      id="conv-date"
                      type="date"
                      required
                      value={convertDate}
                      onChange={(e) => setConvertDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="conv-class">Enrollment Class *</Label>
                    <Select
                      id="conv-class"
                      required
                      value={convertClassId}
                      onChange={(e) => {
                        setConvertClassId(e.target.value);
                        setConvertArmId('');
                      }}
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="conv-arm">Enrollment Arm (Optional)</Label>
                    <Select
                      id="conv-arm"
                      value={convertArmId}
                      disabled={availableArms.length === 0}
                      onChange={(e) => setConvertArmId(e.target.value)}
                    >
                      <option value="">General Class / No Arm</option>
                      {availableArms.map((a) => (
                        <option key={a.id} value={a.id}>
                          Arm {a.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 pt-2">
                    <label className="inline-flex items-center gap-2 text-sm text-[#0F172A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createGuardianRecord}
                        onChange={(e) => setCreateGuardianRecord(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                      />
                      <span>Create &amp; link Parent / Guardian record automatically</span>
                    </label>
                    <Button type="submit" disabled={converting}>
                      {converting ? 'Converting...' : 'Complete Registration & Enroll Student'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {/* Review Workflow */}
          {application.status !== 'converted' ? (
            <Card>
              <CardHeader>
                <CardTitle>Administrative Review Decision</CardTitle>
                <CardDescription>
                  Approving an application marks it ready for onboarding without automatically creating a student record.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rev-notes">Review Comment / Verification Remarks</Label>
                  <Input
                    id="rev-notes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="e.g., Assessment passed and birth certificate verified"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  {application.status !== 'approved' ? (
                    <Button
                      type="button"
                      onClick={() => setPendingDecision('approve')}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>Approve Application</span>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPendingDecision('request_info')}
                  >
                    Request Additional Info
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPendingDecision('reject')}
                    className="text-red-600 hover:bg-red-50"
                  >
                    Reject Application
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Supporting Documents */}
          <Card>
            <CardHeader>
              <CardTitle>Supporting Admission Documents ({documents.length})</CardTitle>
              <CardDescription>
                Documents uploaded here automatically transfer to the student vault upon conversion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {application.status !== 'converted' ? (
                <form onSubmit={handleUploadDoc} className="grid gap-3 sm:grid-cols-4 items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="admdoc-type">Type</Label>
                    <Select
                      id="admdoc-type"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                    >
                      <option value="Birth Certificate">Birth Certificate</option>
                      <option value="Previous Report Card">Previous Report Card</option>
                      <option value="Transfer Letter">Transfer Letter</option>
                      <option value="Medical Form">Medical Clearance</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admdoc-title">Title</Label>
                    <Input
                      id="admdoc-title"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="Applicant Document"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admdoc-file">File (PDF / Image)</Label>
                    <Input
                      id="admdoc-file"
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/webp"
                      onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                      className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs"
                    />
                  </div>
                  <Button type="submit" disabled={!docFile || uploadingDoc}>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span>{uploadingDoc ? 'Uploading...' : 'Attach File'}</span>
                  </Button>
                </form>
              ) : null}

              {documents.length === 0 ? (
                <p className="text-xs text-slate-500">No supporting admission documents attached yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.title}</TableCell>
                        <TableCell className="text-xs text-slate-600">{d.document_type}</TableCell>
                        <TableCell className="text-xs tabular-nums">{formatBytes(d.size_bytes)}</TableCell>
                        <TableCell className="text-right">
                          <a
                            href={`/api/school/files/${d.file_id}/download`}
                            className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                          >
                            Download
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Admission Workflow History */}
          <Card>
            <CardHeader>
              <CardTitle>Application Audit &amp; Review History ({history.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-xs text-slate-500">No review events recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date / Time</TableHead>
                      <TableHead>Transition</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead>Officer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {item.created_at}
                        </TableCell>
                        <TableCell className="text-xs font-medium capitalize text-[#0F172A]">
                          {item.from_status ? `${item.from_status.replaceAll('_', ' ')} → ` : ''}
                          {item.to_status.replaceAll('_', ' ')}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{item.comment}</TableCell>
                        <TableCell className="text-xs text-slate-500">{item.actor_email}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDecision)}
        title={
          pendingDecision === 'approve'
            ? 'Approve Admission Application'
            : pendingDecision === 'reject'
              ? 'Reject Admission Application'
              : 'Request Additional Information'
        }
        description={
          pendingDecision === 'approve'
            ? 'Approving qualifies this applicant for explicit student conversion. No student record is created until you complete the conversion step.'
            : pendingDecision === 'reject'
              ? 'Mark this admission application as rejected? The applicant will remain in history logs.'
              : 'Flag this application for missing documents or follow-up information.'
        }
        confirmLabel={
          pendingDecision === 'approve'
            ? 'Approve Application'
            : pendingDecision === 'reject'
              ? 'Reject Application'
              : 'Request Info'
        }
        destructive={pendingDecision === 'reject'}
        busy={submittingReview}
        onCancel={() => setPendingDecision(null)}
        onConfirm={() => void confirmReviewDecision()}
      />
    </div>
  );
}
