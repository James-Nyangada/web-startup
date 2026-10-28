import { AuthGate } from "@/components/auth/auth-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
