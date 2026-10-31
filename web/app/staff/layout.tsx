import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/auth-gate";
import { StaffGate } from "@/components/staff/staff-shell";

export const metadata: Metadata = {
  title: "Staff",
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>
      <StaffGate>{children}</StaffGate>
    </AuthGate>;
}
