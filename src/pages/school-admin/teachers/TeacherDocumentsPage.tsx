import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EntityDocumentsPanel } from '../../../components/dashboard/EntityDocumentsPanel.tsx';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { EntityDocumentRecord } from '../../../types/app.ts';

const TEACHER_DOC_TYPES = [
  { value: 'Teaching License', label: 'Teaching License / TRCN' },
  { value: 'Academic Certificate', label: 'Academic Degree / Certificate' },
  { value: 'Employment Contract', label: 'Employment Contract' },
  { value: 'National ID', label: 'National ID / Passport' },
  { value: 'Other Document', label: 'Other Staff Record' },
];

export function TeacherDocumentsPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teacherInfo, setTeacherInfo] = useState<{
    first_name: string;
    last_name: string;
    staff_id_number: string;
  } | null>(null);
  const [documents, setDocuments] = useState<EntityDocumentRecord[]>([]);

  const loadDocuments = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        teacher: { first_name: string; last_name: string; staff_id_number: string };
        documents: EntityDocumentRecord[];
      }>(`/api/school/teachers/${teacherId}/documents`);
      setTeacherInfo(res.teacher);
      setDocuments(res.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load staff documents.');
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          teacherInfo
            ? `${teacherInfo.first_name} ${teacherInfo.last_name} — Documents`
            : 'Teacher Document Vault'
        }
        description={
          teacherInfo
            ? `Staff ID: ${teacherInfo.staff_id_number} · Secure credential and qualification storage.`
            : 'Upload and manage teacher certifications and HR documents.'
        }
        actions={
          <Link to={`/dashboard/school-admin/teachers/${teacherId}`}>
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Teacher Profile</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading staff document vault...</p>
      ) : (
        <EntityDocumentsPanel
          title="Upload Staff Credential"
          description="Attach teaching licenses, degree certificates, or HR letters to this educator profile."
          uploadEndpoint={`/api/school/teachers/${teacherId}/documents`}
          deleteEndpointPrefix={`/api/school/teachers/${teacherId}/documents`}
          documentTypes={TEACHER_DOC_TYPES}
          documents={documents}
          onRefresh={loadDocuments}
        />
      )}
    </div>
  );
}
