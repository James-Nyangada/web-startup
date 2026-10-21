import type { Metadata } from "next";
import Link from "next/link";
import { EdgeState, edgePrimary, edgeSecondary } from "@/components/edge-state";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** S-80: 404. Also shown for resources in another organisation (spec 7: never 403). */
export default function NotFound() {
  return (
    <EdgeState
      code="404"
      title="We couldn’t find that page"
      actions={
        <>
          <Link href="/" className={edgePrimary}>
            Go to the home page
          </Link>
          <Link href="/help" className={edgeSecondary}>
            Visit the help centre
          </Link>
        </>
      }
    >
      <p className="m-0">
        The link may be old, or the page may have moved. If you followed a link from a report or an email, the site or
        issue may have been removed, or it belongs to an organisation you are not part of.
      </p>
    </EdgeState>
  );
}
