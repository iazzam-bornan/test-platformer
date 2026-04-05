import { z } from "zod"

const portMappingSchema = z.object({
  containerPort: z.number(),
  hostPort: z.union([z.number(), z.literal("auto")]).optional(),
})

const httpHealthcheckSchema = z.object({
  type: z.literal("http"),
  path: z.string(),
  port: z.number(),
  interval: z.number().optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
})

const commandHealthcheckSchema = z.object({
  type: z.literal("command"),
  command: z.array(z.string()),
  interval: z.number().optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
})

const tcpHealthcheckSchema = z.object({
  type: z.literal("tcp"),
  port: z.number(),
  interval: z.number().optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
})

const healthcheckSchema = z.discriminatedUnion("type", [
  httpHealthcheckSchema,
  commandHealthcheckSchema,
  tcpHealthcheckSchema,
])

const repoSchema = z.object({
  source: z.literal("git"),
  url: z.string(),
  ref: z.string().default("main"),
})

const buildConfigSchema = z.object({
  dockerfile: z.string().default("Dockerfile"),
  context: z.string().default("."),
  args: z.record(z.string()).optional(),
})

const serviceSchema = z.object({
  // Either use a pre-built image or build from a repo — at least one must be set
  image: z.string().optional(),
  repo: z.string().optional(),
  build: buildConfigSchema.optional(),
  workingDir: z.string().default("."),
  env: z.record(z.string()).optional(),
  ports: z.array(portMappingSchema).optional(),
  healthcheck: healthcheckSchema.optional(),
  dependsOn: z.array(z.string()).optional(),
}).refine(
  (s) => s.image || (s.repo && s.build),
  { message: "Service must have either 'image' or both 'repo' and 'build'" }
)

const infraServiceSchema = z.object({
  image: z.string(),
  env: z.record(z.string()).optional(),
  ports: z.array(portMappingSchema).optional(),
  healthcheck: healthcheckSchema.optional(),
  volumes: z.array(z.string()).optional(),
})

const jmeterConfigSchema = z.object({
  testPlan: z.string(),
  image: z.string().optional(),
  threads: z.number().min(1).optional(),
  rampUp: z.number().min(0).optional(),
  loops: z.number().min(1).optional(),
  duration: z.number().min(1).optional(),
  errorThreshold: z.number().min(0).max(100).optional(),
  properties: z.record(z.string()).optional(),
})

const testRunnerSchema = z.object({
  image: z.string().optional(),
  build: buildConfigSchema.optional(),
  entrypoint: z.array(z.string()).optional(),
  command: z.array(z.string()).optional(),
  httpChecks: z.array(z.string()).optional(),
  jmeter: jmeterConfigSchema.optional(),
  env: z.record(z.string()).optional(),
  volumes: z.array(z.string()).optional(),
  mountRepos: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
}).refine(
  (r) => r.command || (r.httpChecks && r.httpChecks.length > 0) || r.jmeter,
  { message: "Test runner must have either 'command', 'httpChecks', or 'jmeter'" }
)

const artifactsSchema = z.object({
  logs: z.boolean().default(true),
  screenshots: z.boolean().default(false),
  videos: z.boolean().default(false),
  coverage: z.boolean().default(false),
  paths: z.array(z.string()).optional(),
})

const cleanupSchema = z.object({
  destroyOnFinish: z.boolean().default(true),
  preserveOnFailure: z.boolean().default(false),
})

export const scenarioSchema = z.object({
  version: z.number().default(1),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  repos: z.record(repoSchema),
  services: z.record(serviceSchema),
  infrastructure: z.record(infraServiceSchema).optional(),
  tests: z.object({
    runner: testRunnerSchema,
  }),
  artifacts: artifactsSchema.optional(),
  cleanup: cleanupSchema.optional(),
})

export type Scenario = z.infer<typeof scenarioSchema>
export type PortMapping = z.infer<typeof portMappingSchema>
export type Healthcheck = z.infer<typeof healthcheckSchema>
export type RepoConfig = z.infer<typeof repoSchema>
export type ServiceConfig = z.infer<typeof serviceSchema>
export type InfraServiceConfig = z.infer<typeof infraServiceSchema>
export type TestRunner = z.infer<typeof testRunnerSchema>
export type ArtifactsConfig = z.infer<typeof artifactsSchema>
export type CleanupConfig = z.infer<typeof cleanupSchema>
