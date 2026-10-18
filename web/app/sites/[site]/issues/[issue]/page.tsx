import { OrgRedirect } from "@/components/shell/org-redirect";

export default async function Page({ params }: { params: Promise<{ site: string; issue: string }> }) {
  const { site, issue } = await params;
  return <OrgRedirect path={`/sites/${site}/issues/${issue}`} />;
}
