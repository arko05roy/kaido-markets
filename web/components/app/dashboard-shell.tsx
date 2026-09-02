"use client";

import { AppSidebar } from "@/components/app/app-sidebar";
import { DashboardTopbar } from "@/components/app/dashboard-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function DashboardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <SidebarProvider defaultOpen className="kaido-app kaido-dashboard bg-[#141416]">
      <AppSidebar />
      <SidebarInset className="min-h-svh bg-[#141416] text-[#f3efe6] md:peer-data-[variant=inset]:shadow-none">
        <DashboardTopbar />
        <div className={cn("flex-1 px-4 py-5 sm:px-6 lg:px-8", className)}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
