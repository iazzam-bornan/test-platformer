import { RootLayout } from "./components/layout.tsx"
import { ScenarioListPage } from "./pages/scenarios-list.tsx"
import { ScenarioDetailPage } from "./pages/scenario-detail.tsx"
import { RunConfigurationPage } from "./pages/run-configuration.tsx"
import { RunLivePage } from "./pages/run-live.tsx"
import { RunHistoryPage } from "./pages/run-history.tsx"
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"

const rootRoute = createRootRoute({
  component: RootLayout,
})

const scenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ScenarioListPage,
})

const scenarioDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/scenarios/$id",
  component: ScenarioDetailPage,
})

const runConfigRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/scenarios/$id/run",
  component: RunConfigurationPage,
})

const runLiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$id",
  component: RunLivePage,
})

const runHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: RunHistoryPage,
})

const routeTree = rootRoute.addChildren([
  scenariosRoute,
  scenarioDetailRoute,
  runConfigRoute,
  runLiveRoute,
  runHistoryRoute,
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
