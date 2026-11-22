import React from 'react';
import { FilesManagerPanel, type CategoryOption } from '../../components/dashboard/FilesManagerPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';

const TEACHER_FILE_CATEGORIES: CategoryOption[] = [
  { value: 'teacher_profile_picture', label: 'Teacher Profile Picture' },
  { value: 'staff_document', label: 'Staff Document' },
];

export function TeacherFilesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents & Media"
        description="Upload your faculty profile picture or personal staff credentials and inspect authorized school documents."
      />
      <FilesManagerPanel
        apiBasePath="/api/school/files"
        allowedCategories={TEACHER_FILE_CATEGORIES}
        uploadTitle="Upload Faculty File"
        listTitle="Accessible School & Faculty Files"
        listDescription="Includes school documents, logos, student files authorized for faculty, and your uploaded staff records."
      />
    </div>
  );
}
