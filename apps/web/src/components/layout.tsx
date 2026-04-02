import { Outlet, Link, useMatches } from "@tanstack/react-router"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuItem,
  SidebarMenu,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import { HugeiconsIcon } from "@hugeicons/react"
import { GridViewIcon, Clock01Icon } from "@hugeicons/core-free-icons"
import { useDockerStatus } from "../hooks/useApi"

function NavLink({
  to,
  label,
  icon,
}: {
  to: string
  label: string
  icon: React.ReactNode
}) {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.fullPath ?? "/"
  const isActive =
    to === "/"
      ? currentPath === "/" || currentPath.startsWith("/scenarios")
      : currentPath.startsWith(to)

  return (
    <SidebarMenuItem>
      <Link to={to} className="block w-full">
        <div
          className={`
            group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all
            ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }
          `}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded text-xs ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground group-hover:bg-accent-foreground/10"
            }`}
          >
            {icon}
          </span>
          {label}
          {isActive && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </div>
      </Link>
    </SidebarMenuItem>
  )
}

export function RootLayout() {
  const { data: docker } = useDockerStatus()

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <Sidebar className="border-r border-sidebar-border">
          <SidebarHeader>
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground shadow-sm">
                TP
              </div>
              <div className="flex flex-col">
                <span className="font-heading text-sm font-bold tracking-tight">
                  TestPlatform
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  v0.1.0
                </span>
              </div>
            </div>
          </SidebarHeader>

          <Separator className="mx-4 w-auto" />

          <SidebarContent className="px-2 pt-4">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Navigation
            </p>
            <SidebarMenu className="space-y-0.5">
              <NavLink
                to="/"
                label="Scenarios"
                icon={<HugeiconsIcon icon={GridViewIcon} size={12} />}
              />
              <NavLink
                to="/history"
                label="History"
                icon={<HugeiconsIcon icon={Clock01Icon} size={12} />}
              />
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
            <div className="border-t border-sidebar-border px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="relative flex h-2 w-2">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${docker?.available ? "animate-ping bg-emerald-400" : ""}`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${docker?.available ? "bg-emerald-400" : "bg-red-400"}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  Docker{" "}
                  <span
                    className={
                      docker?.available ? "text-emerald-500" : "text-red-400"
                    }
                  >
                    {docker?.available ? "connected" : "offline"}
                  </span>
                </span>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex h-12 items-center border-b px-4 md:hidden">
            <SidebarTrigger />
          </div>

          <main className="flex-1 overflow-auto">
            <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
