import React, { useEffect, useState } from 'react';
import { NotificationsCenterPanel } from '../../components/dashboard/NotificationsCenterPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { SchoolRecord } from '../../types/app.ts';

export function OwnerNotificationsPage() {
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
        title="Platform Notifications"
        description="Publish platform-wide notices or school-targeted alerts backed by persistent read tracking and FCM adapter foundation."
      />
      <NotificationsCenterPanel mode="owner" schools={schools} />
    </div>
  );
}
