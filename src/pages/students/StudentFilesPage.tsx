import React from 'react';
import { FilesManagerPanel, type CategoryOption } from '../../components/dashboard/FilesManagerPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';

const STUDENT_FILE_CATEGORIES: CategoryOption[] = [
  { value: 'student_profile_picture', label: 'Student Profile Picture' },
];

export function StudentFilesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile & Documents"
        description="Upload your student profile portrait and view personal school documents authorized for your account."
      />
      <FilesManagerPanel
        apiBasePath="/api/school/files"
        allowedCategories={STUDENT_FILE_CATEGORIES}
        uploadTitle="Upload Profile Picture"
        listTitle="Your Student Files & School Logo"
        listDescription="Strictly isolated to your account and your enrolled institution."
      />
    </div>
  );
}
