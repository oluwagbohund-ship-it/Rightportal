import React, { useEffect, useState } from 'react';
import { FilesManagerPanel, type CategoryOption } from '../../components/dashboard/FilesManagerPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { SchoolMemberRecord } from '../../types/app.ts';

const SCHOOL_ADMIN_CATEGORIES: CategoryOption[] = [
  { value: 'school_logo', label: 'School Logo' },
  { value: 'school_document', label: 'School Document' },
  { value: 'staff_document', label: 'Staff Document' },
  { value: 'student_document', label: 'Student Document' },
  { value: 'teacher_profile_picture', label: 'Teacher Profile Picture' },
  { value: 'student_profile_picture', label: 'Student Profile Picture' },
];

export function SchoolFilesPage() {
  const [members, setMembers] = useState<SchoolMemberRecord[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{ members: SchoolMemberRecord[] }>('/api/school/members')
      .then((res) => {
        if (active) setMembers(res.members);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Files & Media"
        description="Manage school logos, official documents, staff records, and student media inside isolated institutional storage."
      />
      <FilesManagerPanel
        apiBasePath="/api/school/files"
        allowedCategories={SCHOOL_ADMIN_CATEGORIES}
        members={members}
      />
    </div>
  );
}
