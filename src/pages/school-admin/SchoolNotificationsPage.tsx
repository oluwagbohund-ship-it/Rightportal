import React, { useEffect, useState } from 'react';
import { NotificationsCenterPanel } from '../../components/dashboard/NotificationsCenterPanel.tsx';
import { PageHeader } from '../../components/dashboard/PageHeader.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { SchoolMemberRecord } from '../../types/app.ts';

export function SchoolNotificationsPage() {
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
        title="School Notifications"
        description="Publish tenant-scoped announcements for the entire school, specific roles (Teachers, Students, Parents), or individual members."
      />
      <NotificationsCenterPanel mode="school_admin" members={members} />
    </div>
  );
}
