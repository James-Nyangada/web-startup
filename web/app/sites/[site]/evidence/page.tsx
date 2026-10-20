import { OrgRedirect } from "@/components/shell/org-redirect";

export default async function Page({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  return <OrgRedirect path={`/sites/${site}/evidence`} />;
}
