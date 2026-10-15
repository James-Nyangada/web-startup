import Link from "next/link";

/** Direction A — "plainsight" wordmark with the dot-in-square mark. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="Plainsight home" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
      <span className="grid size-7 place-items-center rounded-md bg-primary">
        <span className="size-[11px] rounded-full bg-on-primary" />
      </span>
      <span className="text-xl font-bold tracking-[-0.03em]">plainsight</span>
    </Link>
  );
}
