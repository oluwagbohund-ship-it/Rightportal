import React from 'react';
import { NotificationsCenterPanel } from '../../components/dashboard/NotificationsCenterPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';

export function ParentNotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Guardian Notifications"
        description="Read institutional notices, guardian-targeted updates, and direct school communications."
      />
      <NotificationsCenterPanel mode="school_member" />
    </div>
  );
}
