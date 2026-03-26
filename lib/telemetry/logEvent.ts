import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function logAnalyticsEvent(event: string): Promise<void> {
    if (!convex) return;
    try {
        // Fire-and-forget style: callers can choose not to await.
        await convex.mutation(api.analytics.logEvent, { event });
    } catch {
        // Telemetry must never affect the primary user flow.
    }
}

