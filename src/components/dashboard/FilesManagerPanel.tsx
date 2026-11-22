import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { formatUtcTimestamp } from '../../lib/utils.ts';
import type { FileCategory, SchoolMemberRecord, SchoolRecord, StoredFileItem } from '../../types/app.ts';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { Label } from '../ui/label.tsx';
import { Select } from '../ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';

export interface CategoryOption {
  value: FileCategory;
  label: string;
}

const CATEGORY_LABELS: Record<FileCategory, string> = {
  school_logo: 'School Logo',
  teacher_profile_picture: 'Teacher Profile Picture',
  student_profile_picture: 'Student Profile Picture',
  student_document: 'Student Document',
  staff_document: 'Staff Document',
  school_document: 'School Document',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('Unable to read file bytes.'));
        return;
      }
      resolve(result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

interface FilesManagerPanelProps {
  apiBasePath: '/api/owner/files' | '/api/school/files';
  allowedCategories: CategoryOption[];
  canUpload?: boolean;
  canDelete?: boolean;
  schools?: SchoolRecord[];
  members?: SchoolMemberRecord[];
  showSchoolColumn?: boolean;
  uploadTitle?: string;
  uploadDescription?: string;
  listTitle?: string;
  listDescription?: string;
}

export function FilesManagerPanel({
  apiBasePath,
  allowedCategories,
  canUpload = true,
  canDelete = true,
  schools,
  members,
  showSchoolColumn = false,
  uploadTitle = 'Upload Validated File',
  uploadDescription = 'Images (PNG, JPEG, WEBP up to 2 MB) and documents (PDF, TXT, CSV up to 5 MB) are verified by magic-byte signature and stored outside the web root.',
  listTitle = 'Stored Files & Media',
  listDescription = 'Authenticated private storage isolated by institutional tenant and role permissions.',
}: FilesManagerPanelProps) {
  const [files, setFiles] = useState<StoredFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [category, setCategory] = useState<FileCategory>(
    allowedCategories[0]?.value ?? 'school_document',
  );
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [subjectUserId, setSubjectUserId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await apiRequest<{ files: StoredFileItem[] }>(apiBasePath);
      setFiles(res.files);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load files.');
    } finally {
      setLoading(false);
    }
  }, [apiBasePath]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);

    if (!selectedFile) {
      setActionErr('Choose a file before uploading.');
      return;
    }

    const isImageCategory =
      category === 'school_logo' ||
      category === 'teacher_profile_picture' ||
      category === 'student_profile_picture';
    const maxBytes = isImageCategory ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (selectedFile.size > maxBytes) {
      setActionErr(
        `File exceeds the ${isImageCategory ? '2 MB image' : '5 MB document'} size limit.`,
      );
      return;
    }

    setUploading(true);
    try {
      const contentBase64 = await readFileAsBase64(selectedFile);
      await apiRequest(apiBasePath, {
        method: 'POST',
        body: JSON.stringify({
          category,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          contentBase64,
          schoolId: selectedSchoolId || undefined,
          subjectUserId: subjectUserId || undefined,
        }),
      });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setActionMsg(`Uploaded "${selectedFile.name}" securely.`);
      await loadFiles();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'File upload rejected.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId: string, originalName: string) => {
    setActionErr(null);
    setActionMsg(null);
    setDeletingId(fileId);
    try {
      await apiRequest(`${apiBasePath}/${fileId}`, { method: 'DELETE' });
      setActionMsg(`Removed "${originalName}" from storage.`);
      await loadFiles();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to delete file.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {actionErr ? <Alert variant="error">{actionErr}</Alert> : null}
      {actionMsg ? <Alert variant="success">{actionMsg}</Alert> : null}

      <div className={canUpload && allowedCategories.length > 0 ? 'grid gap-6 lg:grid-cols-12' : ''}>
        {canUpload && allowedCategories.length > 0 ? (
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>{uploadTitle}</CardTitle>
              <CardDescription>{uploadDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="file-category-select">File Category</Label>
                  <Select
                    id="file-category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as FileCategory)}
                  >
                    {allowedCategories.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>

                {schools && schools.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="file-school-select">School Tenant (Optional)</Label>
                    <Select
                      id="file-school-select"
                      value={selectedSchoolId}
                      onChange={(e) => setSelectedSchoolId(e.target.value)}
                    >
                      <option value="">Platform-Private (No Tenant)</option>
                      {schools.map((sch) => (
                        <option key={sch.id} value={sch.id}>
                          {sch.name} ({sch.code})
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                {members && members.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="file-subject-select">Assign to Member (Optional)</Label>
                    <Select
                      id="file-subject-select"
                      value={subjectUserId}
                      onChange={(e) => setSubjectUserId(e.target.value)}
                    >
                      <option value="">General School Asset</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name} ({m.role_name})
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="file-binary-input">Select File</Label>
                  <input
                    ref={fileInputRef}
                    id="file-binary-input"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#0F172A] file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#0F172A] hover:file:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  />
                  {selectedFile ? (
                    <p className="text-xs text-slate-600 tabular-nums">
                      Selected: {selectedFile.name} · {formatFileSize(selectedFile.size)}
                    </p>
                  ) : null}
                </div>

                <Button type="submit" disabled={uploading || !selectedFile} className="w-full">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>{uploading ? 'Validating & Storing...' : 'Upload Secure File'}</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className={canUpload && allowedCategories.length > 0 ? 'lg:col-span-7' : ''}>
          <CardHeader>
            <CardTitle>{listTitle}</CardTitle>
            <CardDescription>{listDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading stored files...</p>
            ) : files.length === 0 ? (
              <p className="text-sm text-slate-500">
                No accessible files stored yet. Upload a validated image or document to begin.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Category</TableHead>
                    {showSchoolColumn ? <TableHead>Tenant</TableHead> : null}
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((item) => {
                    const isImage = item.mime_type.startsWith('image/');
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isImage ? (
                              <ImageIcon className="h-4 w-4 shrink-0 text-[#2563EB]" aria-hidden="true" />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-[#0F172A] truncate max-w-[220px]">
                                {item.original_name}
                              </p>
                              <p className="text-xs text-slate-500 tabular-nums">
                                {formatUtcTimestamp(item.created_at)}
                                {item.subject_user_name ? ` · ${item.subject_user_name}` : ''}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-700">
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </TableCell>
                        {showSchoolColumn ? (
                          <TableCell className="text-xs text-slate-600">
                            {item.school_name ?? 'Platform Private'}
                          </TableCell>
                        ) : null}
                        <TableCell className="font-mono text-xs tabular-nums">
                          {formatFileSize(item.size_bytes)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <a
                              href={`${apiBasePath}/${item.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-[#0F172A] hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{isImage ? 'View' : 'Download'}</span>
                            </a>
                            {canDelete ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={deletingId === item.id}
                                onClick={() => void handleDelete(item.id, item.original_name)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                                <span className="sr-only">Delete {item.original_name}</span>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
