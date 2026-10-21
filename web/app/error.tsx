"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EdgeState, edgePrimary, edgeSecondary } from "@/components/edge-state";

/** S-80: 500. Error boundaries are client components; `retry` re-renders the segment. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EdgeState
      code="500"
      title="Something went wrong on our side"
      actions={
        <>
          <button type="button" onClick={() => retry()} className={edgePrimary}>
            Try again
          </button>
          <Link href="/" className={edgeSecondary}>
            Go to the home page
          </Link>
        </>
      }
    >
      <p className="m-0">
        Nothing you did caused this, and your work is saved up to your last change. We have been told about it.
      </p>
      {error.digest && (
        <p className="m-0 mt-3 text-sm">
          If you contact support, quote reference <code className="font-mono">{error.digest}</code>.
        </p>
      )}
    </EdgeState>
  );
}
