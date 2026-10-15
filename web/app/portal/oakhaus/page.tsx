import type { Metadata } from "next";
import { PortalSite } from "@/components/portal/portal";

export const metadata: Metadata = { title: "Oakhaus Furniture" };

export default function Page() {
  return <PortalSite />;
}
