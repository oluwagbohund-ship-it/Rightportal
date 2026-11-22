export interface FcmIntegrationStatus {
  provider: 'Firebase Cloud Messaging (FCM)';
  configured: boolean;
  pushDispatchActive: false;
  architecturePhase: string;
  reason: string;
}

export interface FcmDispatchPayload {
  notificationId: string;
  title: string;
  body: string;
  deviceTokens: string[];
}

export interface FcmDispatchResult {
  dispatched: boolean;
  deliveredCount: number;
  status: 'fcm_not_configured';
  message: string;
}

export function getFcmIntegrationStatus(): FcmIntegrationStatus {
  const hasProject = Boolean(process.env.FCM_PROJECT_ID?.trim());
  const hasCredentials = Boolean(process.env.FCM_SERVICE_ACCOUNT_JSON?.trim());
  const configured = hasProject && hasCredentials;

  return {
    provider: 'Firebase Cloud Messaging (FCM)',
    configured,
    // Push dispatch remains strictly inactive in Phase 1.5 until external FCM credentials & worker transport are verified.
    pushDispatchActive: false,
    architecturePhase: 'Phase 1.5 — In-App Delivery Active · FCM Push Adapter Prepared',
    reason: configured
      ? 'FCM environment variables detected; push worker activation scheduled for Phase 2.'
      : 'FCM credentials are not configured. Notifications are delivered reliably via authenticated in-app storage.',
  };
}

export async function dispatchFcmNotification(
  _payload: FcmDispatchPayload,
): Promise<FcmDispatchResult> {
  return {
    dispatched: false,
    deliveredCount: 0,
    status: 'fcm_not_configured',
    message: 'FCM push transport is not enabled in Phase 1.5; stored for in-app retrieval.',
  };
}
