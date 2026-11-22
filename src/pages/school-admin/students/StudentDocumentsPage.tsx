import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EntityDocumentsPanel } from '../../../components/dashboard/EntityDocumentsPanel.tsx';
import { PageHeader } from '../../../components/dashboard/PageHeader.tsx';
import { Alert } from '../../../components/ui/alert.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { apiRequest } from '../../../lib/api.ts';
import type { EntityDocumentRecord } from '../../../types/app.ts';

const STUDENT_DOC_TYPES = [
  { value: 'Birth Certificate', label: 'Birth Certificate' },
  { value: 'Previous Transcript', label: 'Previous Academic Transcript' },
  { value: 'Transfer Certificate', label: 'School Transfer Certificate' },
  { value: 'Medical Record', label: 'Immunization / Medical Record' },
  { value: 'Other Document', label: 'Other Student Record' },
];

export function StudentDocumentsPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<{
    first_name: string;
    last_name: string;
    admission_number: string;
  } | null>(null);
  const [documents, setDocuments] = useState<EntityDocumentRecord[]>([]);

  const loadDocuments = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        student: { first_name: string; last_name: string; admission_number: string };
        documents: EntityDocumentRecord[];
      }>(`/api/school/students/${studentId}/documents`);
      setStudentInfo(res.student);
      setDocuments(res.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load student documents.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          studentInfo
            ? `${studentInfo.first_name} ${studentInfo.last_name} — Documents`
            : 'Student Document Vault'
        }
        description={
          studentInfo
            ? `Admission No: ${studentInfo.admission_number} · Private academic and identity records.`
            : 'Manage student academic certificates and identity records.'
        }
        actions={
          <Link to={`/dashboard/school-admin/students/${studentId}`}>
            <Button type="button" size="sm" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Student Profile</span>
            </Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading student document vault...</p>
      ) : (
        <EntityDocumentsPanel
          title="Upload Student Record"
          description="Attach birth certificates, previous school transcripts, or medical clearance forms."
          uploadEndpoint={`/api/school/students/${studentId}/documents`}
          deleteEndpointPrefix={`/api/school/students/${studentId}/documents`}
          documentTypes={STUDENT_DOC_TYPES}
          documents={documents}
          onRefresh={loadDocuments}
        />
      )}
    </div>
  );
}
