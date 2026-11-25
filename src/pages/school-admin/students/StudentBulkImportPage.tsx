import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
import {
  buildStudentsCsvTemplate,
  escapeCsvCell,
} from '../../../lib/student-csv.ts';
import type { SchoolClassRecord } from '../../../types/app.ts';

interface EvaluatedPreviewRow {
  rowNumber: number;
  status: 'valid' | 'error';
  issues: string[];
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  admissionNumber: string;
  admissionDate: string;
  studentEmail: string;
  classId: string | null;
  className: string;
  armId: string | null;
  armName: string;
  createLogin: boolean;
  hasCustomPassword: boolean;
}

interface PreviewResponse {
  mode: 'preview';
  summary: {
    totalRows: number;
    validCount: number;
    errorCount: number;
    loginsToCreateCount: number;
  };
  recognizedColumns: string[];
  unknownHeaders: string[];
  rows: EvaluatedPreviewRow[];
}

interface CommitImportedRow {
  rowNumber: number;
  id: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  armName: string;
  studentEmail: string;
  loginCreated: boolean;
  temporaryPassword: string | null;
}

interface CommitResponse {
  mode: 'commit';
  summary: {
    totalRows: number;
    importedCount: number;
    skippedCount: number;
    loginsCreatedCount: number;
  };
  imported: CommitImportedRow[];
  errors: Array<{ rowNumber: number; fullName: string; issues: string[] }>;
}

function triggerCsvDownload(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function StudentBulkImportPage() {
  const { showToast } = useToast();

  const [classes, setClasses] = useState<SchoolClassRecord[]>([]);
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [fileName, setFileName] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const [defaultClassId, setDefaultClassId] = useState('');
  const [defaultArmId, setDefaultArmId] = useState('');
  const [defaultAdmissionDate, setDefaultAdmissionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [createPortalLogins, setCreatePortalLogins] = useState(false);
  const [skipInvalidRows, setSkipInvalidRows] = useState(true);

  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [rowFilter, setRowFilter] = useState<'all' | 'valid' | 'error'>('all');
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ classes: SchoolClassRecord[] }>('/api/school/classes')
      .then((res) => {
        if (!active) return;
        setClasses((res.classes ?? []).filter((c) => c.status !== 'archived'));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedDefaultClass = classes.find((c) => c.id === defaultClassId);
  const availableDefaultArms =
    selectedDefaultClass?.arms?.filter((a) => a.status === 'active') ?? [];

  const runPreview = useCallback(
    async (contentToCheck: string) => {
      if (!contentToCheck.trim()) {
        setPreview(null);
        setError(null);
        return;
      }
      setValidating(true);
      setError(null);
      setCommitResult(null);
      try {
        const res = await apiRequest<PreviewResponse>('/api/school/students/bulk-import', {
          method: 'POST',
          body: JSON.stringify({
            mode: 'preview',
            csvContent: contentToCheck,
            defaultClassId: defaultClassId || null,
            defaultArmId: defaultClassId && defaultArmId ? defaultArmId : null,
            defaultAdmissionDate,
            createPortalLogins,
          }),
        });
        setPreview(res);
        setRowFilter('all');
      } catch (err) {
        setPreview(null);
        setError(err instanceof Error ? err.message : 'Unable to parse and validate CSV file.');
      } finally {
        setValidating(false);
      }
    },
    [defaultClassId, defaultArmId, defaultAdmissionDate, createPortalLogins],
  );

  // Re-validate automatically whenever import defaults change while CSV is already loaded
  useEffect(() => {
    if (csvContent.trim() && !commitResult) {
      void runPreview(csvContent);
    }
  }, [defaultClassId, defaultArmId, defaultAdmissionDate, createPortalLogins]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError('CSV file exceeds the 2 MB limit. Split larger batches into multiple files.');
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsvContent(text);
    setCommitResult(null);
    await runPreview(text);
  };

  const handleDownloadSample = async () => {
    try {
      const res = await fetch('/api/school/students/bulk-import/template.csv', {
        credentials: 'include',
      });
      if (res.ok) {
        const text = await res.text();
        triggerCsvDownload('students-import-template.csv', text);
        return;
      }
    } catch {
      // Fallback to client template builder using fetched classes
    }
    triggerCsvDownload('students-import-template.csv', buildStudentsCsvTemplate(classes));
  };

  const handleDownloadImportReport = () => {
    if (!commitResult) return;
    const headers = [
      'row_number',
      'admission_number',
      'full_name',
      'class',
      'arm',
      'student_email',
      'portal_login_created',
      'temporary_password',
    ];
    const lines = commitResult.imported.map((row) =>
      [
        row.rowNumber,
        row.admissionNumber,
        row.fullName,
        row.className,
        row.armName,
        row.studentEmail,
        row.loginCreated ? 'yes' : 'no',
        row.temporaryPassword ?? '',
      ]
        .map((c) => escapeCsvCell(c))
        .join(','),
    );
    triggerCsvDownload(
      `student-bulk-import-report-${new Date().toISOString().slice(0, 10)}.csv`,
      [headers.join(','), ...lines].join('\n'),
    );
  };

  const handleCommitImport = async () => {
    if (!csvContent.trim() || !preview || preview.summary.validCount === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await apiRequest<CommitResponse>('/api/school/students/bulk-import', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'commit',
          csvContent,
          defaultClassId: defaultClassId || null,
          defaultArmId: defaultClassId && defaultArmId ? defaultArmId : null,
          defaultAdmissionDate,
          createPortalLogins,
          skipInvalidRows,
        }),
      });
      setCommitResult(res);
      setPreview(null);
      showToast({
        variant: 'success',
        title: 'Bulk student import completed',
        description: `${res.summary.importedCount} student(s) enrolled${
          res.summary.skippedCount > 0 ? `, ${res.summary.skippedCount} skipped` : ''
        }.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to complete bulk student import.';
      setError(msg);
      showToast({ variant: 'error', title: 'Bulk import failed', description: msg });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFileName('');
    setCsvContent('');
    setPreview(null);
    setCommitResult(null);
    setError(null);
    setRowFilter('all');
  };

  const filteredPreviewRows = useMemo(() => {
    if (!preview) return [];
    if (rowFilter === 'all') return preview.rows;
    return preview.rows.filter((r) => r.status === rowFilter);
  }, [preview, rowFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Import Students (CSV)"
        description="Upload a CSV roster to validate records, match school classes and arms, and enroll multiple students in one transaction."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleDownloadSample()}
              className="whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download Sample CSV</span>
            </Button>
            <Link to="/dashboard/school-admin/students">
              <Button type="button" size="sm" variant="outline" className="whitespace-nowrap shrink-0">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back to Students</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {commitResult ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <CardTitle>Import Completed</CardTitle>
                <CardDescription>
                  Student enrollment records and assigned admission numbers are now active in your directory.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadImportReport}
                  className="whitespace-nowrap shrink-0"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Download Report CSV</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  className="whitespace-nowrap shrink-0"
                >
                  <span>Import Another</span>
                </Button>
                <Link to="/dashboard/school-admin/students">
                  <Button type="button" size="sm" className="whitespace-nowrap shrink-0">
                    <span>View Students Directory</span>
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 border-y border-slate-200 py-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-slate-500">Enrolled Students</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums text-emerald-700">
                  {commitResult.summary.importedCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Skipped Rows</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-700">
                  {commitResult.summary.skippedCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Portal Logins Provisioned</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums text-[#1E3A8A]">
                  {commitResult.summary.loginsCreatedCount}
                </p>
              </div>
            </div>

            {commitResult.summary.loginsCreatedCount > 0 ? (
              <Alert variant="info" title="One-Time Credentials Notice">
                Temporary portal passwords shown below are generated once and are not stored in plain text. Download the Import Report CSV before leaving this page if you need to distribute login credentials.
              </Alert>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class / Arm</TableHead>
                  <TableHead>Portal Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commitResult.imported.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs tabular-nums text-slate-500">
                      #{item.rowNumber}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium">
                      {item.admissionNumber}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/dashboard/school-admin/students/${item.id}`}
                        className="font-semibold text-[#1E3A8A] hover:underline"
                      >
                        {item.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {item.className}
                      {item.armName ? ` (${item.armName})` : ''}
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.loginCreated ? (
                        <div className="space-y-0.5">
                          <span className="font-medium text-emerald-700">{item.studentEmail}</span>
                          {item.temporaryPassword ? (
                            <p className="font-mono text-slate-600">
                              Temp password: {item.temporaryPassword}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-500">Profile only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {commitResult.errors.length > 0 ? (
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-red-700">
                  Skipped Rows ({commitResult.errors.length})
                </h4>
                <ul className="space-y-1 text-xs text-slate-700">
                  {commitResult.errors.map((errItem) => (
                    <li key={errItem.rowNumber} className="tabular-nums">
                      Row {errItem.rowNumber} ({errItem.fullName}) — {errItem.issues.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>01. Upload or Paste Student Roster CSV</CardTitle>
                  <CardDescription>
                    Required columns: first_name, last_name, date_of_birth (YYYY-MM-DD or DD/MM/YYYY), and gender. Up to 500 students per batch.
                  </CardDescription>
                </div>

                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setInputMode('file')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      inputMode === 'file'
                        ? 'bg-white text-[#0F172A] shadow-sm'
                        : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    Upload CSV File
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('paste')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      inputMode === 'paste'
                        ? 'bg-white text-[#0F172A] shadow-sm'
                        : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    Paste CSV Text
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {inputMode === 'file' ? (
                <label
                  htmlFor="csv-file-input"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files?.[0] ?? null;
                    void handleFileSelected(file);
                  }}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
                    isDragOver
                      ? 'border-[#1E3A8A] bg-blue-50/50'
                      : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <FileSpreadsheet className="h-8 w-8 text-[#1E3A8A]" aria-hidden="true" />
                  <span className="mt-3 text-sm font-semibold text-[#0F172A]">
                    {fileName ? `Selected: ${fileName}` : 'Choose a CSV file or drag and drop it here'}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    UTF-8 comma- or semicolon-delimited .csv up to 2 MB
                  </span>
                  <span className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-[#0F172A]">
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{fileName ? 'Replace CSV File' : 'Select CSV File'}</span>
                  </span>
                  <input
                    id="csv-file-input"
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      void handleFileSelected(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor="csv-paste-textarea">CSV Content</Label>
                  <textarea
                    id="csv-paste-textarea"
                    rows={7}
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    placeholder={
                      'first_name,last_name,date_of_birth,gender,class,student_email\nAmaka,Okonkwo,2012-05-14,Female,JSS 1,amaka@school.edu'
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-xs text-[#0F172A] placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      Tip: Download the sample CSV to copy column headers matching your school&apos;s classes.
                    </span>
                    <div className="flex gap-2">
                      {csvContent ? (
                        <Button type="button" size="sm" variant="outline" onClick={handleReset}>
                          Clear
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        disabled={!csvContent.trim() || validating}
                        onClick={() => void runPreview(csvContent)}
                      >
                        {validating ? 'Validating...' : 'Validate & Preview CSV'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-default-class">Default Class (if blank in CSV)</Label>
                  <Select
                    id="bulk-default-class"
                    value={defaultClassId}
                    onChange={(e) => {
                      setDefaultClassId(e.target.value);
                      setDefaultArmId('');
                    }}
                  >
                    <option value="">Use CSV class column or leave unassigned</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.active_students_count ?? 0}/{c.capacity})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bulk-default-arm">Default Class Arm</Label>
                  <Select
                    id="bulk-default-arm"
                    value={defaultArmId}
                    disabled={!defaultClassId || availableDefaultArms.length === 0}
                    onChange={(e) => setDefaultArmId(e.target.value)}
                  >
                    <option value="">General Class / No Arm</option>
                    {availableDefaultArms.map((a) => (
                      <option key={a.id} value={a.id}>
                        Arm {a.name} ({a.active_students_count ?? 0}/{a.capacity})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bulk-default-adm-date">Default Admission Date</Label>
                  <Input
                    id="bulk-default-adm-date"
                    type="date"
                    value={defaultAdmissionDate}
                    onChange={(e) => setDefaultAdmissionDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-[#0F172A]">
                  <input
                    type="checkbox"
                    checked={createPortalLogins}
                    onChange={(e) => setCreatePortalLogins(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                  />
                  <span>
                    Create Student Portal logins automatically for rows with a valid email address
                  </span>
                </label>
              </div>

              <div className="border-t border-slate-200 pt-4 text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-[#0F172A]">Supported CSV Columns</p>
                <p className="mt-1">
                  Required: <span className="font-mono">first_name</span> ·{' '}
                  <span className="font-mono">last_name</span> ·{' '}
                  <span className="font-mono">date_of_birth</span> ·{' '}
                  <span className="font-mono">gender</span>
                </p>
                <p className="mt-1">
                  Optional: <span className="font-mono">middle_name</span> ·{' '}
                  <span className="font-mono">class</span> · <span className="font-mono">arm</span> ·{' '}
                  <span className="font-mono">admission_number</span> (auto-generated if blank) ·{' '}
                  <span className="font-mono">admission_date</span> ·{' '}
                  <span className="font-mono">student_email</span> ·{' '}
                  <span className="font-mono">student_phone</span> ·{' '}
                  <span className="font-mono">residential_address</span> ·{' '}
                  <span className="font-mono">nationality</span> ·{' '}
                  <span className="font-mono">state_of_origin</span> ·{' '}
                  <span className="font-mono">previous_school</span> ·{' '}
                  <span className="font-mono">emergency_contact_name</span> ·{' '}
                  <span className="font-mono">emergency_contact_phone</span> ·{' '}
                  <span className="font-mono">emergency_contact_relationship</span> ·{' '}
                  <span className="font-mono">create_portal_login</span> ·{' '}
                  <span className="font-mono">portal_password</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {validating ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-600">
                Validating CSV rows against school classes, capacities, and existing records...
              </CardContent>
            </Card>
          ) : preview ? (
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>02. Validation Preview</CardTitle>
                    <CardDescription>
                      Review matched classes, admission number assignment, and any row errors before committing to the student database.
                    </CardDescription>
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRowFilter('all')}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium tabular-nums whitespace-nowrap transition-colors ${
                        rowFilter === 'all'
                          ? 'bg-white text-[#0F172A] shadow-sm'
                          : 'text-slate-600 hover:text-[#0F172A]'
                      }`}
                    >
                      All ({preview.summary.totalRows})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRowFilter('valid')}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium tabular-nums whitespace-nowrap transition-colors ${
                        rowFilter === 'valid'
                          ? 'bg-white text-[#0F172A] shadow-sm'
                          : 'text-slate-600 hover:text-[#0F172A]'
                      }`}
                    >
                      Ready ({preview.summary.validCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRowFilter('error')}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium tabular-nums whitespace-nowrap transition-colors ${
                        rowFilter === 'error'
                          ? 'bg-white text-[#0F172A] shadow-sm'
                          : 'text-slate-600 hover:text-[#0F172A]'
                      }`}
                    >
                      Issues ({preview.summary.errorCount})
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid gap-4 border-y border-slate-200 py-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Total Parsed Rows</p>
                    <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#0F172A]">
                      {preview.summary.totalRows}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Ready to Enroll</p>
                    <p className="mt-1 font-display text-xl font-bold tabular-nums text-emerald-700">
                      {preview.summary.validCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Rows with Issues</p>
                    <p
                      className={`mt-1 font-display text-xl font-bold tabular-nums ${
                        preview.summary.errorCount > 0 ? 'text-red-700' : 'text-slate-700'
                      }`}
                    >
                      {preview.summary.errorCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Portal Logins Queued</p>
                    <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#1E3A8A]">
                      {preview.summary.loginsToCreateCount}
                    </p>
                  </div>
                </div>

                {preview.unknownHeaders.length > 0 ? (
                  <Alert variant="info">
                    Ignored unrecognized CSV column(s): {preview.unknownHeaders.join(', ')}.
                  </Alert>
                ) : null}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>DOB / Gender</TableHead>
                      <TableHead>Admission No.</TableHead>
                      <TableHead>Class / Arm</TableHead>
                      <TableHead>Portal Login</TableHead>
                      <TableHead>Validation Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPreviewRows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="font-mono text-xs tabular-nums text-slate-500">
                          #{row.rowNumber}
                        </TableCell>
                        <TableCell>
                          {row.status === 'valid' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Ready</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Issue</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-[#0F172A]">
                            {[row.firstName, row.middleName, row.lastName].filter(Boolean).join(' ') ||
                              '—'}
                          </div>
                          {row.studentEmail ? (
                            <p className="text-xs text-slate-500">{row.studentEmail}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-slate-700 whitespace-nowrap">
                          {row.dateOfBirth || '—'} · {row.gender || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-700 whitespace-nowrap">
                          {row.admissionNumber || 'Auto-generated'}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 whitespace-nowrap">
                          {row.className}
                          {row.armName ? ` (${row.armName})` : ''}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 whitespace-nowrap">
                          {row.createLogin ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.issues.length === 0 ? (
                            <span className="text-slate-500">Valid record</span>
                          ) : (
                            <span className="text-red-700">{row.issues.join('; ')}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex flex-col gap-4 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {preview.summary.errorCount > 0 ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={skipInvalidRows}
                          onChange={(e) => setSkipInvalidRows(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                        />
                        <span>
                          Skip {preview.summary.errorCount} row(s) with issues and import valid rows only
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs text-slate-600">
                        All {preview.summary.validCount} row(s) passed validation and are ready to enroll.
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className="whitespace-nowrap shrink-0"
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        importing ||
                        preview.summary.validCount === 0 ||
                        (!skipInvalidRows && preview.summary.errorCount > 0)
                      }
                      onClick={() => void handleCommitImport()}
                      className="whitespace-nowrap shrink-0"
                    >
                      {importing
                        ? 'Importing Students...'
                        : `Import ${preview.summary.validCount} Student${
                            preview.summary.validCount === 1 ? '' : 's'
                          }`}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
