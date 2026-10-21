import type { Metadata } from "next";
import { EdgeState, edgeSecondary } from "@/components/edge-state";

export const metadata: Metadata = { title: "Scheduled maintenance", robots: { index: false } };

const statusUrl = process.env.NEXT_PUBLIC_STATUS_URL;

/** S-80: shown for every page while MAINTENANCE_MODE is on (proxy.ts) or the API reports it. */
export default function MaintenancePage() {
  return (
    <EdgeState
      code="503"
      title="We’ll be right back"
      actions={
        statusUrl ? (
          <a href={statusUrl} className={edgeSecondary}>
            Check the status page
          </a>
        ) : undefined
      }
    >
      <p className="m-0">
        Plainsight is down for scheduled maintenance, usually for less than 15 minutes. Your sites, scans and reports are
        safe, and scheduled scans run once we are back.
      </p>
      <p className="m-0 mt-3 text-sm">Refresh this page in a few minutes.</p>
    </EdgeState>
  );
}
