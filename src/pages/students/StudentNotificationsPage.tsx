import React from 'react';
import { NotificationsCenterPanel } from '../../components/dashboard/NotificationsCenterPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';

export function StudentNotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Notifications"
        description="View school announcements, student-specific notices, and direct messages."
      />
      <NotificationsCenterPanel mode="school_member" />
    </div>
  );
}
