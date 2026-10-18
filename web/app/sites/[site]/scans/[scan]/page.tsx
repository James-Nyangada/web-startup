import { OrgRedirect } from "@/components/shell/org-redirect";

export default async function Page({ params }: { params: Promise<{ site: string; scan: string }> }) {
  const { site, scan } = await params;
  return <OrgRedirect path={`/sites/${site}/scans/${scan}`} />;
}
