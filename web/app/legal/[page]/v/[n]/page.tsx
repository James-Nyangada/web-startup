import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CmsLegal } from "@/components/legal/cms-legal";
import { getPage, getPageVersion } from "@/lib/cms";

export const revalidate = 300;

const LEGAL_SLUGS = ["terms", "privacy", "refunds", "dpa", "subprocessors", "bot", "accessibility"];
// bot and accessibility pages live outside /legal, so their old versions are not routed here.
const ROUTED = ["terms", "privacy", "refunds", "dpa", "subprocessors"];

interface Props {
  params: Promise<{ page: string; n: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page, n } = await params;
  // Old versions are for reference only; they should not compete with the current page in search.
  return { title: `Legal ${page} (version ${n})`, robots: { index: false, follow: true } };
}

export default async function LegalVersionPage({ params }: Props) {
  const { page, n } = await params;
  const version = Number(n);
  if (!LEGAL_SLUGS.includes(page) || !ROUTED.includes(page) || !Number.isInteger(version) || version < 1) notFound();

  const [old, current] = await Promise.all([getPageVersion(`legal.${page}`, version), getPage(`legal.${page}`)]);
  if (!old) notFound();
  return <CmsLegal slug={page} page={old} currentVersion={current?.version} />;
}
