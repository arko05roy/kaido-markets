import { DashboardShell } from "@/components/app/dashboard-shell";

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
