import type {
  ChatMessage,
  GenerationArtifactRecord,
  GenerationJobRecord,
  MvpDesignDoc,
  MvpProjectSeed,
  MvpShellState,
  Suggestion,
  WorkflowMode,
} from './model'

type BackendProjectSummary = {
  project_id: string
  title: string
  workflow_mode?: WorkflowMode
  created_at: string
  updated_at: string
}

type BackendChatMessage = {
  message_id: string
  project_id: string
  side: 'user' | 'app'
  text: string
  created_at: string
  source?: 'main' | 'prompt_seed' | 'suggestion'
}

type BackendDesignDoc = {
  project_id: string
  title: string
  goal: string
  core_requirements: string[]
  assumptions: string[]
  missing_information: string[]
  updated_at: string
}

type BackendGenerationJob = {
  job_id: string
  status: string
  summary: string
  status_url: string
  created_at: string
  updated_at: string
  current_phase?: string | null
  progress_summary?: string | null
  started_at?: string | null
  finished_at?: string | null
  last_heartbeat_at?: string | null
  ai_composer_thread_id?: string | null
  last_checkpoint_id?: string | null
  latest_log_excerpt?: string | null
  last_materialized_snapshot_at?: string | null
  artifact_refs?: string[]
  artifacts?: {
    artifact_id: string
    name: string
    type_label: string
    path: string
    summary: string
  }[]
  provider?: string | null
  model?: string | null
}

type BackendSuggestion = {
  suggestion_id: string
  project_id: string
  label: string
  title: string
  body: string
  detail: string
  impact: string
  created_at: string
}

type BackendProjectSnapshot = {
  project: BackendProjectSummary
  messages: BackendChatMessage[]
  design_doc: BackendDesignDoc | null
  suggestions?: BackendSuggestion[]
  latest_job: BackendGenerationJob | null
}

type BackendProjectList = {
  projects: BackendProjectSummary[]
}

export type ProjectChatMessageContext = {
  source: 'main' | 'suggestion'
  suggestionId?: string
  suggestionTitle?: string
}

export type ProjectSnapshot = {
  projectId: string
  projectTitle: string
  workflowMode: WorkflowMode
  state: MvpShellState
}

export async function listProjects(backendBaseUrl: string): Promise<string[]> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects`, { method: 'GET' })
  if (!response.ok) {
    throw new Error('Project list is unavailable right now.')
  }
  const payload = (await response.json()) as BackendProjectList
  return payload.projects.map((project) => project.project_id)
}

export async function readProjectSnapshot({
  backendBaseUrl,
  projectId,
}: {
  backendBaseUrl: string
  projectId: string
}): Promise<ProjectSnapshot> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}`, {
    method: 'GET',
  })
  if (!response.ok) {
    throw new Error('Project snapshot is unavailable right now.')
  }
  const payload = (await response.json()) as BackendProjectSnapshot
  return normalizeProjectSnapshot(payload)
}

export async function capturePromptToProject({
  backendBaseUrl,
  projectId,
  prompt,
  workflowMode,
}: {
  backendBaseUrl: string
  projectId: string | null
  prompt: string
  workflowMode: WorkflowMode
}): Promise<ProjectSnapshot> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/capture-prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_id: projectId,
      prompt,
      workflow_mode: workflowMode,
    }),
  })
  if (!response.ok) {
    throw new Error('Prompt capture failed. Try again when the backend is reachable.')
  }
  const payload = (await response.json()) as BackendProjectSnapshot
  return normalizeProjectSnapshot(payload)
}

export async function updateProjectWorkflowMode({
  backendBaseUrl,
  projectId,
  workflowMode,
}: {
  backendBaseUrl: string
  projectId: string
  workflowMode: WorkflowMode
}): Promise<ProjectSnapshot> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/workflow-mode`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_mode: workflowMode,
    }),
  })
  if (!response.ok) {
    throw new Error('Workflow mode save failed. Try again when the backend is reachable.')
  }
  const payload = (await response.json()) as BackendProjectSnapshot
  return normalizeProjectSnapshot(payload)
}

export async function applyVibeDefaultsToProject({
  backendBaseUrl,
  projectId,
}: {
  backendBaseUrl: string
  projectId: string
}): Promise<ProjectSnapshot> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/design-doc/apply-vibe-defaults`, {
    method: 'POST',
  })
  const payload = (await response.json()) as BackendProjectSnapshot | BackendErrorResponse
  if (!response.ok) {
    throw new Error(readBackendErrorMessage(payload, 'AI defaults are unavailable right now.'))
  }
  return normalizeProjectSnapshot(payload as BackendProjectSnapshot)
}

export async function sendProjectChatMessage({
  backendBaseUrl,
  projectId,
  message,
  context,
}: {
  backendBaseUrl: string
  projectId: string
  message: string
  context: ProjectChatMessageContext
}): Promise<ProjectSnapshot> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      context: {
        source: context.source,
        suggestion_id: context.suggestionId,
        suggestion_title: context.suggestionTitle,
      },
    }),
  })
  if (!response.ok) {
    throw new Error('Backend clarification is unavailable right now.')
  }
  const payload = (await response.json()) as BackendProjectSnapshot
  return normalizeProjectSnapshot(payload)
}

type BackendErrorResponse = {
  detail?: string | {
    message?: string
  }
}

export async function saveDesignDocToProject({
  backendBaseUrl,
  projectId,
  designDoc,
}: {
  backendBaseUrl: string
  projectId: string
  designDoc: MvpDesignDoc
}): Promise<MvpDesignDoc> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/design-doc`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_id: projectId,
      title: designDoc.title,
      goal: designDoc.goal,
      core_requirements: designDoc.coreRequirements,
      assumptions: designDoc.assumptions,
      missing_information: designDoc.missingInformation,
      updated_at: designDoc.updatedAt,
    }),
  })
  if (!response.ok) {
    throw new Error('Design Doc save failed. Try again when the backend is reachable.')
  }
  const payload = (await response.json()) as BackendDesignDoc
  return normalizeDesignDoc(payload)
}

export function deriveLatestPromptSeed(messages: ChatMessage[]): MvpProjectSeed | null {
  const latestPromptSeedMessage = [...messages].reverse().find((message) => message.side === 'user' && message.source === 'prompt_seed')
  const legacyPromptSeedMessage =
    latestPromptSeedMessage ?? messages.find((message) => message.side === 'user' && message.source !== 'suggestion')
  if (!legacyPromptSeedMessage) {
    return null
  }
  return {
    prompt: legacyPromptSeedMessage.text,
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeGenerationJob(job: BackendGenerationJob): GenerationJobRecord {
  return {
    jobId: job.job_id,
    status: job.status,
    summary: job.summary,
    statusUrl: job.status_url,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    currentPhase: job.current_phase ?? null,
    progressSummary: job.progress_summary ?? null,
    startedAt: job.started_at ?? null,
    finishedAt: job.finished_at ?? null,
    lastHeartbeatAt: job.last_heartbeat_at ?? null,
    aiComposerThreadId: job.ai_composer_thread_id ?? null,
    lastCheckpointId: job.last_checkpoint_id ?? null,
    latestLogExcerpt: job.latest_log_excerpt ?? null,
    lastMaterializedSnapshotAt: job.last_materialized_snapshot_at ?? null,
    artifactRefs: job.artifact_refs ?? [],
    artifacts: normalizeArtifacts(job.artifacts),
    providerLabel: job.provider ?? null,
    modelLabel: job.model ?? null,
  }
}

function normalizeProjectSnapshot(payload: BackendProjectSnapshot): ProjectSnapshot {
  const messages = payload.messages.map(normalizeChatMessage)
  const designDoc = payload.design_doc ? normalizeDesignDoc(payload.design_doc) : null
  const generationJob = payload.latest_job ? normalizeGenerationJob(payload.latest_job) : null
  const suggestions = normalizeSuggestions(payload.suggestions)
  const workflowMode = normalizeWorkflowMode(payload.project.workflow_mode)
  return {
    projectId: payload.project.project_id,
    projectTitle: payload.project.title,
    workflowMode,
    state: {
      workflowMode,
      messages,
      latestPromptSeed: deriveLatestPromptSeed(messages),
      designDoc,
      designDocApprovedAt: null,
      verificationProperties: [],
      verificationPropertiesApprovedAt: null,
      suggestions,
      generationJob,
    },
  }
}

function normalizeWorkflowMode(value: unknown): WorkflowMode {
  if (value === 'vibe_coding') {
    return 'vibe_coding'
  }
  return 'professional_development'
}

function readBackendErrorMessage(payload: BackendProjectSnapshot | BackendErrorResponse, fallback: string) {
  if ('detail' in payload) {
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail
    }
    if (payload.detail && typeof payload.detail === 'object' && payload.detail.message) {
      return payload.detail.message
    }
  }
  return fallback
}

function normalizeChatMessage(message: BackendChatMessage): ChatMessage {
  return {
    id: message.message_id,
    side: message.side,
    text: message.text,
    source: message.source ?? 'main',
  }
}

function normalizeDesignDoc(designDoc: BackendDesignDoc): MvpDesignDoc {
  return {
    title: designDoc.title,
    goal: designDoc.goal,
    coreRequirements: designDoc.core_requirements,
    assumptions: designDoc.assumptions,
    missingInformation: designDoc.missing_information,
    updatedAt: designDoc.updated_at,
  }
}

function normalizeSuggestions(suggestions: BackendProjectSnapshot['suggestions']): Suggestion[] {
  return (suggestions ?? []).map((suggestion) => ({
    id: suggestion.suggestion_id,
    label: suggestion.label,
    title: suggestion.title,
    body: suggestion.body,
    detail: suggestion.detail,
    impact: suggestion.impact,
    createdAt: suggestion.created_at,
  }))
}

function normalizeArtifacts(
  artifacts: BackendGenerationJob['artifacts']
): GenerationArtifactRecord[] {
  return (artifacts ?? []).map((artifact) => ({
    artifactId: artifact.artifact_id,
    name: artifact.name,
    typeLabel: artifact.type_label,
    path: artifact.path,
    summary: artifact.summary,
  }))
}
