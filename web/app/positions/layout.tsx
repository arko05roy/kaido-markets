import { DashboardShell } from "@/components/app/dashboard-shell";

export default function PositionsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
