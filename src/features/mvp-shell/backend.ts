import { DEFAULT_GENERATION_FRAMEWORK } from './model'
import type {
  ChatMessage,
  DeploymentFeeEstimate,
  DeploymentJobRecord,
  DeploymentTransactionRequest,
  GenerationArtifactRecord,
  GenerationJobRecord,
  MvpDesignDoc,
  MvpProjectSeed,
  ProjectRouteSummary,
  MvpShellState,
  Suggestion,
  VerificationProperty,
  WorkflowMode,
} from './model'

type BackendProjectSummary = {
  project_id: string
  title: string
  workflow_mode?: WorkflowMode
  design_doc_approved_at?: string | null
  verification_properties_approved_at?: string | null
  published_at?: string | null
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
  error?: {
    code?: string | null
    message?: string | null
  } | null
  provider?: string | null
  model?: string | null
}

type BackendDeploymentTransactionRequest = {
  request_id: string
  transaction_base64: string
  min_context_slot?: string | number | null
  summary: string
  simulation_summary?: string | null
}

type BackendDeploymentFeeEstimate = {
  program_size_bytes: number
  program_sha256?: string | null
  program_data_space_bytes?: number | null
  program_account_space_bytes?: number | null
  rent_lamports: number
  estimated_network_fee_lamports: number
  service_fee_lamports: number
  total_lamports: number
  calculation_basis?: string | null
  estimate_expires_at: string
  payment_recipient: string
}

type BackendErrorInfo = {
  code?: string
  message?: string
} | null

export type BackendDeploymentJob = {
  job_id: string
  status: string
  summary: string
  status_url: string
  created_at: string
  updated_at: string
  cluster?: string
  source_artifact_id?: string
  artifact_id?: string
  payer_wallet?: string | null
  authority_wallet?: string | null
  authority_mode?: string | null
  program_id?: string | null
  transaction_signatures?: string[]
  deployment_refs?: string[]
  verification_status_at_deploy?: string | null
  upgrade_authority_verified?: boolean
  squads_authority_validation_status?: string
  deployment_estimate?: BackendDeploymentFeeEstimate | null
  payment_request?: BackendDeploymentTransactionRequest | null
  payment_signature?: string | null
  refund_signature?: string | null
  signature_request?: BackendDeploymentTransactionRequest | null
  error?: BackendErrorInfo
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

type BackendVerificationProperty = {
  property_id?: string
  id?: string
  label: string
  statement: string
  rationale: string
}

type BackendProjectSnapshot = {
  project: BackendProjectSummary
  messages: BackendChatMessage[]
  design_doc: BackendDesignDoc | null
  design_doc_approved_at?: string | null
  verification_properties?: BackendVerificationProperty[]
  verification_properties_approved_at?: string | null
  cvlr_spec_checks_rs?: string | null
  cvlr_spec_system_doc_txt?: string | null
  cvlr_spec_generated_at?: string | null
  cvlr_spec_approved_at?: string | null
  published_at?: string | null
  suggestions?: BackendSuggestion[]
  latest_job: BackendGenerationJob | null
  latest_deployment_job?: BackendDeploymentJob | null
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

export type ProjectSummary = ProjectRouteSummary & {
  workflowMode: WorkflowMode
  updatedAt: string
  publishedAt: string | null
}

export async function listProjects(backendBaseUrl: string): Promise<string[]> {
  const projects = await listProjectSummaries(backendBaseUrl)
  return projects.map((project) => project.projectId)
}

export async function listProjectSummaries(backendBaseUrl: string): Promise<ProjectSummary[]> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects`, { method: 'GET' })
  if (!response.ok) {
    throw new Error('Project list is unavailable right now.')
  }
  const payload = (await response.json()) as BackendProjectList
  return payload.projects.map((project) => ({
    projectId: project.project_id,
    title: project.title,
    workflowMode: normalizeWorkflowMode(project.workflow_mode),
    updatedAt: project.updated_at,
    publishedAt: project.published_at ?? null,
  }))
}

export async function listPublishedProjectSnapshots({
  backendBaseUrl,
  limit = 20,
}: {
  backendBaseUrl: string
  limit?: number
}): Promise<ProjectSnapshot[]> {
  const summaries = await listProjectSummaries(backendBaseUrl)
  const publishedSummaries = summaries.filter((project) => project.publishedAt).slice(0, limit)
  const snapshots = await Promise.all(
    publishedSummaries.map((project) => readProjectSnapshot({ backendBaseUrl, projectId: project.projectId })),
  )
  return snapshots.filter((snapshot) => snapshot.state.publishedAt)
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
  const response = await fetch(
    `${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/design-doc/apply-vibe-defaults`,
    {
      method: 'POST',
    },
  )
  const payload = (await response.json()) as BackendProjectSnapshot | BackendErrorResponse
  if (!response.ok) {
    throw new Error(readBackendErrorMessage(payload, 'AI defaults are unavailable right now.'))
  }
  return normalizeProjectSnapshot(payload as BackendProjectSnapshot)
}

export async function approveProjectDesignDoc({
  backendBaseUrl,
  projectId,
}: {
  backendBaseUrl: string
  projectId: string
}): Promise<ProjectSnapshot> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/design-doc/approve`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Design Doc approval failed. Try again when the backend is reachable.')
  }
  const payload = (await response.json()) as BackendProjectSnapshot
  return normalizeProjectSnapshot(payload)
}

export async function approveProjectVerificationProperties({
  backendBaseUrl,
  projectId,
}: {
  backendBaseUrl: string
  projectId: string
}): Promise<ProjectSnapshot> {
  const response = await fetch(
    `${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/verification-properties/approve`,
    {
      method: 'POST',
    },
  )
  if (!response.ok) {
    throw new Error('Property approval failed. Try again when the backend is reachable.')
  }
  const payload = (await response.json()) as BackendProjectSnapshot
  return normalizeProjectSnapshot(payload)
}

export async function approveProjectCvlrSpec({
  backendBaseUrl,
  projectId,
}: {
  backendBaseUrl: string
  projectId: string
}): Promise<ProjectSnapshot> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/cvlr-specs/approve`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('CVLR spec approval failed. Try again when the backend is reachable.')
  }
  const payload = (await response.json()) as BackendProjectSnapshot
  return normalizeProjectSnapshot(payload)
}

export async function publishProject({
  backendBaseUrl,
  projectId,
}: {
  backendBaseUrl: string
  projectId: string
}): Promise<ProjectSnapshot> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/publish`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Project publish failed. Try again when the backend is reachable.')
  }
  const payload = (await response.json()) as BackendProjectSnapshot
  return normalizeProjectSnapshot(payload)
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
  detail?:
    | string
    | {
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
}): Promise<ProjectSnapshot> {
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
  await response.json()
  return readProjectSnapshot({ backendBaseUrl, projectId })
}

export function deriveLatestPromptSeed(messages: ChatMessage[]): MvpProjectSeed | null {
  const latestPromptSeedMessage = [...messages]
    .reverse()
    .find((message) => message.side === 'user' && message.source === 'prompt_seed')
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
    errorMessage: job.error?.message ?? null,
  }
}

export function normalizeDeploymentJob(job: BackendDeploymentJob): DeploymentJobRecord {
  return {
    jobId: job.job_id,
    status: job.status,
    summary: job.summary,
    statusUrl: job.status_url,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    cluster: job.cluster ?? 'devnet',
    sourceArtifactId: job.source_artifact_id ?? job.artifact_id ?? '',
    payerWallet: job.payer_wallet ?? null,
    authorityWallet: job.authority_wallet ?? null,
    authorityMode: job.authority_mode ?? 'user_wallet_demo_authority',
    programId: job.program_id ?? null,
    transactionSignatures: job.transaction_signatures ?? [],
    deploymentRefs: job.deployment_refs ?? [],
    verificationStatusAtDeploy: job.verification_status_at_deploy ?? null,
    upgradeAuthorityVerified: job.upgrade_authority_verified ?? false,
    squadsAuthorityValidationStatus: job.squads_authority_validation_status ?? 'not_applicable',
    deploymentEstimate: normalizeDeploymentEstimate(job.deployment_estimate),
    paymentRequest: normalizeDeploymentSignatureRequest(job.payment_request),
    paymentSignature: job.payment_signature ?? null,
    refundSignature: job.refund_signature ?? null,
    signatureRequest: normalizeDeploymentSignatureRequest(job.signature_request),
    errorMessage: job.error?.message ?? null,
  }
}

function normalizeProjectSnapshot(payload: BackendProjectSnapshot): ProjectSnapshot {
  const messages = payload.messages.map(normalizeChatMessage)
  const designDoc = payload.design_doc ? normalizeDesignDoc(payload.design_doc) : null
  const generationJob = payload.latest_job ? normalizeGenerationJob(payload.latest_job) : null
  const deploymentJob = payload.latest_deployment_job ? normalizeDeploymentJob(payload.latest_deployment_job) : null
  const suggestions = normalizeSuggestions(payload.suggestions)
  const workflowMode = normalizeWorkflowMode(payload.project.workflow_mode)
  const designDocApprovedAt = payload.design_doc_approved_at ?? payload.project.design_doc_approved_at ?? null
  const verificationPropertiesApprovedAt =
    payload.verification_properties_approved_at ?? payload.project.verification_properties_approved_at ?? null
  const cvlrSpecApprovedAt = payload.cvlr_spec_approved_at ?? null
  const cvlrSpec =
    payload.cvlr_spec_checks_rs && payload.cvlr_spec_system_doc_txt && payload.cvlr_spec_generated_at
      ? {
          checksRs: payload.cvlr_spec_checks_rs,
          systemDocTxt: payload.cvlr_spec_system_doc_txt,
          generatedAt: payload.cvlr_spec_generated_at,
        }
      : null
  const publishedAt = payload.published_at ?? payload.project.published_at ?? null
  return {
    projectId: payload.project.project_id,
    projectTitle: payload.project.title,
    workflowMode,
    state: {
      workflowMode,
      generationFramework: DEFAULT_GENERATION_FRAMEWORK,
      messages,
      latestPromptSeed: deriveLatestPromptSeed(messages),
      designDoc,
      designDocApprovedAt,
      verificationProperties: normalizeVerificationProperties(payload.verification_properties),
      verificationPropertiesApprovedAt,
      cvlrSpec,
      cvlrSpecApprovedAt,
      secProReviewRequestedAt: null,
      publishedAt,
      suggestions,
      generationJob,
      deploymentJob,
    },
  }
}

function normalizeDeploymentSignatureRequest(
  request: BackendDeploymentTransactionRequest | null | undefined,
): DeploymentTransactionRequest | null {
  if (!request) {
    return null
  }

  return {
    requestId: request.request_id,
    transactionBase64: request.transaction_base64,
    minContextSlot:
      request.min_context_slot === undefined || request.min_context_slot === null
        ? null
        : String(request.min_context_slot),
    summary: request.summary,
    simulationSummary: request.simulation_summary ?? null,
  }
}

function normalizeDeploymentEstimate(
  estimate: BackendDeploymentFeeEstimate | null | undefined,
): DeploymentFeeEstimate | null {
  if (!estimate) {
    return null
  }

  return {
    programSizeBytes: estimate.program_size_bytes,
    programSha256: estimate.program_sha256 ?? null,
    programDataSpaceBytes: estimate.program_data_space_bytes ?? null,
    programAccountSpaceBytes: estimate.program_account_space_bytes ?? null,
    rentLamports: estimate.rent_lamports,
    estimatedNetworkFeeLamports: estimate.estimated_network_fee_lamports,
    serviceFeeLamports: estimate.service_fee_lamports,
    totalLamports: estimate.total_lamports,
    calculationBasis: estimate.calculation_basis ?? null,
    estimateExpiresAt: estimate.estimate_expires_at,
    paymentRecipient: estimate.payment_recipient,
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

function normalizeVerificationProperties(
  properties: BackendProjectSnapshot['verification_properties'],
): VerificationProperty[] {
  return (properties ?? []).map((property, index) => ({
    id: property.property_id ?? property.id ?? `backend-property-${index + 1}`,
    label: property.label,
    statement: property.statement,
    rationale: property.rationale,
  }))
}

function normalizeArtifacts(artifacts: BackendGenerationJob['artifacts']): GenerationArtifactRecord[] {
  return (artifacts ?? []).map((artifact) => ({
    artifactId: artifact.artifact_id,
    name: artifact.name,
    typeLabel: artifact.type_label,
    path: artifact.path,
    summary: artifact.summary,
  }))
}
