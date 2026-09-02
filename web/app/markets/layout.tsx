import { DashboardShell } from "@/components/app/dashboard-shell";

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
