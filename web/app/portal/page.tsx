import type { Metadata } from "next";
import { PortalHome } from "@/components/portal/portal";

export const metadata: Metadata = { title: "Your websites" };

export default function Page() {
  return <PortalHome />;
}
