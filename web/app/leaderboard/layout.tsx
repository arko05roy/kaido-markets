import { DashboardShell } from "@/components/app/dashboard-shell";

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
