import React, { useEffect, useState } from 'react';
import { FilesManagerPanel, type CategoryOption } from '../../components/dashboard/FilesManagerPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { SchoolRecord } from '../../types/app.ts';

const OWNER_FILE_CATEGORIES: CategoryOption[] = [
  { value: 'school_logo', label: 'School Logo' },
  { value: 'school_document', label: 'School Document' },
  { value: 'staff_document', label: 'Staff Document' },
  { value: 'student_document', label: 'Student Document' },
  { value: 'teacher_profile_picture', label: 'Teacher Profile Picture' },
  { value: 'student_profile_picture', label: 'Student Profile Picture' },
];

export function OwnerFilesPage() {
  const [schools, setSchools] = useState<SchoolRecord[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{ schools: SchoolRecord[] }>('/api/owner/schools')
      .then((res) => {
        if (active) setSchools(res.schools);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Files & Storage Governance"
        description="Inspect platform and tenant-scoped files stored under magic-byte validation, randomized filenames, and path-confined private storage."
      />
      <FilesManagerPanel
        apiBasePath="/api/owner/files"
        allowedCategories={OWNER_FILE_CATEGORIES}
        schools={schools}
        showSchoolColumn
      />
    </div>
  );
}
