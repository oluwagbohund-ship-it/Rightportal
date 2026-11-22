import React, { useState } from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { formatBytes, readFileAsBase64 } from '../../lib/files.ts';
import type { EntityDocumentRecord } from '../../types/app.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx';
import { ConfirmDialog } from '../ui/confirm-dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select } from '../ui/select.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';

interface EntityDocumentsPanelProps {
  title?: string;
  description?: string;
  uploadEndpoint: string;
  deleteEndpointPrefix: string;
  documentTypes: Array<{ value: string; label: string }>;
  documents: EntityDocumentRecord[];
  onRefresh: () => void | Promise<void>;
  readOnly?: boolean;
}

export function EntityDocumentsPanel({
  title = 'Verified Document Vault',
  description = 'Upload official records and download stored documents securely via tenant-isolated storage.',
  uploadEndpoint,
  deleteEndpointPrefix,
  documentTypes,
  documents,
  onRefresh,
  readOnly = false,
}: EntityDocumentsPanelProps) {
  const { showToast } = useToast();
  const [documentType, setDocumentType] = useState(documentTypes[0]?.value ?? 'Other Document');
  const [docTitle, setDocTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntityDocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError('Select a PDF, PNG, JPEG, or WebP document file to upload.');
      return;
    }

    const finalTitle = docTitle.trim() || selectedFile.name;
    setUploading(true);
    try {
      const contentBase64 = await readFileAsBase64(selectedFile);
      await apiRequest(uploadEndpoint, {
        method: 'POST',
        body: JSON.stringify({
          documentType,
          title: finalTitle,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          contentBase64,
        }),
      });
      setDocTitle('');
      setSelectedFile(null);
      const input = document.getElementById('entity-doc-file-input') as HTMLInputElement | null;
      if (input) input.value = '';
      showToast({
        variant: 'success',
        title: 'Document uploaded',
        description: `${finalTitle} has been stored securely in your school vault.`,
      });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to upload document.';
      setError(msg);
      showToast({ variant: 'error', title: 'Upload failed', description: msg });
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`${deleteEndpointPrefix}/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      showToast({
        variant: 'success',
        title: 'Document removed',
        description: `${deleteTarget.title} was removed from this record.`,
      });
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to remove document.';
      showToast({ variant: 'error', title: 'Delete failed', description: msg });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {!readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <Alert variant="error" className="mb-4">
                {error}
              </Alert>
            ) : null}
            <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-3 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="doc-type-select">Document Category</Label>
                <Select
                  id="doc-type-select"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                >
                  {documentTypes.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="doc-title-input">Document Title</Label>
                <Input
                  id="doc-title-input"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g., Certified Birth Certificate"
                  maxLength={140}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="entity-doc-file-input">File (PDF, PNG, JPEG, WebP · max 5MB)</Label>
                <Input
                  id="entity-doc-file-input"
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-[#0F172A]"
                />
              </div>

              <div className="md:col-span-3 flex items-center justify-between gap-4 pt-1">
                <p className="text-xs text-slate-500">
                  {selectedFile
                    ? `Ready: ${selectedFile.name} (${formatBytes(selectedFile.size)})`
                    : 'Only verified image and PDF signatures accepted.'}
                </p>
                <Button type="submit" disabled={uploading}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>{uploading ? 'Uploading...' : 'Upload Document'}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Stored Documents ({documents.length})</CardTitle>
          <CardDescription>
            Private files linked to this record. Downloads require an active authorized tenant session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">No documents attached yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Upload supporting credentials, certificates, or official transcripts above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Original File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium text-[#0F172A]">{doc.title}</TableCell>
                    <TableCell className="text-xs text-slate-600">{doc.document_type}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {doc.original_name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 tabular-nums">
                      {formatBytes(doc.size_bytes)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 tabular-nums">
                      {doc.created_at ? doc.created_at.slice(0, 10) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <a
                          href={`/api/school/files/${doc.file_id}/download`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-[#0F172A] hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Download</span>
                        </a>
                        {!readOnly ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteTarget(doc)}
                            className="h-8 px-2.5 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Delete</span>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Attached Document"
        description={`Are you sure you want to permanently remove "${deleteTarget?.title ?? ''}" from private school storage? This action cannot be undone.`}
        confirmLabel="Delete Document"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
