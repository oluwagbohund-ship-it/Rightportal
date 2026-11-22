import React from 'react';
import { NotificationsCenterPanel } from '../../components/dashboard/NotificationsCenterPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';

export function TeacherNotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Faculty Notifications"
        description="Receive institutional broadcasts, faculty-targeted alerts, and direct administrative notices."
      />
      <NotificationsCenterPanel mode="school_member" />
    </div>
  );
}
