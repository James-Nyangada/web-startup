"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/components/use-focus-trap";
import { IssueDetailContent } from "./issue-detail-content";
import type { Issue } from "@/lib/site-data";
import type { ApiMember } from "@/lib/app-api";
import { gsap, useGSAP, MOTION, prefersReducedMotion } from "@/lib/gsap";

/**
 * S-26 issue drawer. Right side 560px (full screen on mobile), focus moves to the title on open,
 * focus is trapped, Escape closes (handled by the parent), slide-in/out with GSAP,
 * and focus returns to originating row on close.
 */
export function IssueDrawer({
  issue,
  rechecking,
  modalOpen,
  onClose,
  onExited,
  onRecheck,
  onIgnore,
  onReopen,
  siteHref,
  orgSlug,
  sitePlatform,
  members,
  onAssign,
  onSetDue,
}: {
  issue: Issue | null;
  rechecking: boolean;
  modalOpen: boolean;
  onClose: () => void;
  onExited: () => void;
  onRecheck: () => void;
  onIgnore: () => void;
  onReopen: () => void;
  siteHref?: string;
  orgSlug?: string;
  sitePlatform?: string;
  members?: ApiMember[];
  onAssign?: (assigneeId: string | null) => void;
  onSetDue?: (dueDate: string | null) => void;
}) {
  const [shown, setShown] = useState<Issue | null>(issue);
  const panel = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const isOpen = !!issue;

  // Keep rendering the last issue while the exit animation plays.
  useEffect(() => {
    if (issue) setShown(issue);
  }, [issue]);

  useFocusTrap(panel, isOpen && !modalOpen);

  // Enter / exit animation.
  useGSAP(
    () => {
      if (!shown || !panel.current || !scrim.current) return;
      const reduced = prefersReducedMotion();
      // Opacity (not autoAlpha) so the title stays focusable during the reduced-motion fade.
      const slide = reduced ? { opacity: 0 } : { xPercent: 100 };
      if (isOpen) {
        gsap.fromTo(
          scrim.current,
          { opacity: 0 },
          { opacity: 1, duration: MOTION.panel, ease: MOTION.ease },
        );
        gsap.fromTo(panel.current, slide, {
          xPercent: 0,
          opacity: 1,
          duration: MOTION.panel,
          ease: MOTION.ease,
        });
        requestAnimationFrame(() => title.current?.focus());
      } else {
        gsap.to(scrim.current, {
          opacity: 0,
          duration: MOTION.panel,
          ease: MOTION.ease,
        });
        gsap.to(panel.current, {
          ...slide,
          duration: MOTION.panel,
          ease: MOTION.ease,
          onComplete: () => {
            setShown(null);
            onExited();
          },
        });
      }
    },
    { dependencies: [isOpen, !!shown] },
  );

  if (!shown) return null;

  return (
    <>
      <div
        ref={scrim}
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-20 bg-scrim"
      />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed inset-y-0 right-0 z-[21] flex w-full flex-col border-l border-line bg-surface shadow-dialog sm:w-[min(560px,100vw)] sm:rounded-l-xl overflow-hidden"
      >
        <IssueDetailContent
          issue={shown}
          orgSlug={orgSlug}
          sitePlatform={sitePlatform}
          members={members}
          onAssign={onAssign}
          onSetDue={onSetDue}
          rechecking={rechecking}
          onRecheck={onRecheck}
          onIgnore={onIgnore}
          onReopen={onReopen}
          onClose={onClose}
          isFullPage={false}
          siteHref={siteHref}
          titleRef={title}
        />
      </aside>
    </>
  );
}
