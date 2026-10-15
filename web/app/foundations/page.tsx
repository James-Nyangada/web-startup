import type { Metadata } from "next";
import { Foundations } from "@/components/foundations/foundations";

export const metadata: Metadata = { title: "Foundations" };

export default function Page() {
  return <Foundations />;
}
