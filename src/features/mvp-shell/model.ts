export type ChatMessage = {
  id: string
  side: 'user' | 'app'
  text: string
  source?: 'main' | 'prompt_seed' | 'suggestion'
}

export type MvpProjectSeed = {
  prompt: string
  updatedAt: string
}

export type WorkflowMode = 'vibe_coding' | 'professional_development'
export type GenerationFramework = 'Anchor' | 'Quasar' | 'Pinocchio'

export const DEFAULT_WORKFLOW_MODE: WorkflowMode = 'vibe_coding'
export const DEFAULT_GENERATION_FRAMEWORK: GenerationFramework = 'Anchor'

export type ProjectRouteSummary = {
  projectId: string
  title: string
}

export type ChatProjectRouteDecision =
  | {
      kind: 'existing'
      project: ProjectRouteSummary
    }
  | {
      kind: 'confirm'
      project: ProjectRouteSummary
    }
  | {
      kind: 'new'
    }

export type MvpDesignDoc = {
  title: string
  goal: string
  coreRequirements: string[]
  assumptions: string[]
  missingInformation: string[]
  updatedAt: string
}

export type VerificationProperty = {
  id: string
  label: string
  statement: string
  rationale: string
}

export type CvlrSpec = {
  checksRs: string
  systemDocTxt: string
  generatedAt: string
}

export type Suggestion = {
  id: string
  label: string
  title: string
  body: string
  detail: string
  impact: string
  createdAt: string
}

export type GenerationArtifactRecord = {
  artifactId: string
  name: string
  typeLabel: string
  path: string
  summary: string
}

export type DeploymentArtifactKind = 'program_binary' | 'cargo_project_source'

export type GenerationJobRecord = {
  jobId: string
  status: string
  summary: string
  statusUrl: string
  createdAt: string
  updatedAt: string
  currentPhase?: string | null
  progressSummary?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  lastHeartbeatAt?: string | null
  aiComposerThreadId?: string | null
  lastCheckpointId?: string | null
  latestLogExcerpt?: string | null
  lastMaterializedSnapshotAt?: string | null
  artifactRefs: string[]
  artifacts: GenerationArtifactRecord[]
  providerLabel?: string | null
  modelLabel?: string | null
  errorMessage?: string | null
}

export type DeploymentTransactionRequest = {
  requestId: string
  transactionBase64: string
  minContextSlot: string | null
  summary: string
  simulationSummary: string | null
}

export type DeploymentFeeEstimate = {
  programSizeBytes: number
  programSha256: string | null
  programDataSpaceBytes: number | null
  programAccountSpaceBytes: number | null
  rentLamports: number
  estimatedNetworkFeeLamports: number
  serviceFeeLamports: number
  totalLamports: number
  calculationBasis: string | null
  estimateExpiresAt: string
  paymentRecipient: string
}

export type DeploymentJobRecord = {
  jobId: string
  status: string
  summary: string
  statusUrl: string
  createdAt: string
  updatedAt: string
  cluster: string
  sourceArtifactId: string
  payerWallet: string | null
  authorityWallet: string | null
  authorityMode: string
  programId: string | null
  transactionSignatures: string[]
  deploymentRefs: string[]
  verificationStatusAtDeploy: string | null
  upgradeAuthorityVerified: boolean
  squadsAuthorityValidationStatus: string
  deploymentEstimate: DeploymentFeeEstimate | null
  paymentRequest: DeploymentTransactionRequest | null
  paymentSignature: string | null
  refundSignature: string | null
  signatureRequest: DeploymentTransactionRequest | null
  errorMessage: string | null
}

export type MvpShellState = {
  workflowMode: WorkflowMode
  generationFramework: GenerationFramework
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
  designDoc: MvpDesignDoc | null
  designDocApprovedAt: string | null
  verificationProperties: VerificationProperty[]
  verificationPropertiesApprovedAt: string | null
  cvlrSpec: CvlrSpec | null
  cvlrSpecApprovedAt: string | null
  secProReviewRequestedAt: string | null
  publishedAt: string | null
  suggestions: Suggestion[]
  generationJob: GenerationJobRecord | null
  deploymentJob: DeploymentJobRecord | null
}

type StoredMvpShellState = {
  workflowMode?: WorkflowMode
  generationFramework?: GenerationFramework
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
  designDoc: MvpDesignDoc | null
  designDocApprovedAt?: string | null
  verificationProperties?: VerificationProperty[]
  verificationPropertiesApprovedAt?: string | null
  cvlrSpec?: CvlrSpec | null
  cvlrSpecApprovedAt?: string | null
  secProReviewRequestedAt?: string | null
  publishedAt?: string | null
  suggestions?: Suggestion[]
  generationJob: GenerationJobRecord | null
  deploymentJob?: DeploymentJobRecord | null
}

export type GenerationJobRequest = {
  title: string
  workflow_mode: string
  project_type: string
  framework: GenerationFramework
  design_doc: string
  cvlr_specs_ready?: boolean
}

export const DEVNET_DEPLOYMENT_DEMO_WARNING =
  'Devnet deploy: your wallet signs one prepayment. Backend deploys, then transfers upgrade authority to Squads before success.'

export const MVP_CAPTURE_ACK = 'Project request captured. Review the Design Doc in Workspace before generation.'

export function createInitialMvpShellState(): MvpShellState {
  return {
    workflowMode: DEFAULT_WORKFLOW_MODE,
    generationFramework: DEFAULT_GENERATION_FRAMEWORK,
    messages: [
      {
        id: 'welcome-1',
        side: 'app',
        text: 'Describe the app or program you want to build. I will turn it into a Design Doc you can review.',
      },
    ],
    latestPromptSeed: null,
    designDoc: null,
    designDocApprovedAt: null,
    verificationProperties: [],
    verificationPropertiesApprovedAt: null,
    cvlrSpec: null,
    cvlrSpecApprovedAt: null,
    secProReviewRequestedAt: null,
    publishedAt: null,
    suggestions: [],
    generationJob: null,
    deploymentJob: null,
  }
}

export function createClearedChatState(
  workflowMode: WorkflowMode = DEFAULT_WORKFLOW_MODE,
  generationFramework: GenerationFramework = DEFAULT_GENERATION_FRAMEWORK,
): MvpShellState {
  return {
    ...createInitialMvpShellState(),
    workflowMode,
    generationFramework,
  }
}

export function deriveChatProjectRouteDecision(
  prompt: string,
  projects: ProjectRouteSummary[],
): ChatProjectRouteDecision {
  const promptTokens = tokenizeRouteText(prompt)
  if (promptTokens.length === 0 || projects.length === 0) {
    return { kind: 'new' }
  }

  const [best] = projects
    .map((project) => {
      const titleTokens = tokenizeRouteText(project.title)
      const overlap = titleTokens.filter((token) => promptTokens.includes(token)).length
      const titleContained = titleTokens.length > 0 && titleTokens.every((token) => promptTokens.includes(token))
      const promptContained = promptTokens.length > 0 && promptTokens.every((token) => titleTokens.includes(token))
      const ratio = titleTokens.length === 0 ? 0 : overlap / titleTokens.length

      return {
        project,
        score: ratio + (titleContained ? 0.5 : 0) + (promptContained ? 0.25 : 0),
        overlap,
      }
    })
    .sort((left, right) => right.score - left.score)

  if (!best || best.overlap === 0) {
    return { kind: 'new' }
  }

  if (best.score >= 0.45) {
    return { kind: 'confirm', project: best.project }
  }

  return { kind: 'new' }
}

export function submitPrompt(
  state: MvpShellState,
  input: string,
  createId: () => string,
  nowIso: string,
): MvpShellState {
  const prompt = input.trim()

  if (!prompt) {
    return state
  }

  return {
    messages: [
      ...state.messages,
      {
        id: createId(),
        side: 'user',
        text: prompt,
        source: 'prompt_seed',
      },
      {
        id: createId(),
        side: 'app',
        text: MVP_CAPTURE_ACK,
      },
    ],
    workflowMode: state.workflowMode,
    generationFramework: state.generationFramework,
    latestPromptSeed: {
      prompt,
      updatedAt: nowIso,
    },
    designDoc: createDesignDocFromPrompt(prompt, nowIso),
    designDocApprovedAt: null,
    verificationProperties: [],
    verificationPropertiesApprovedAt: null,
    cvlrSpec: null,
    cvlrSpecApprovedAt: null,
    secProReviewRequestedAt: null,
    publishedAt: null,
    suggestions: [],
    generationJob: null,
    deploymentJob: null,
  }
}

export function buildGenerationRequest(state: MvpShellState): GenerationJobRequest | null {
  if (!state.designDoc) {
    return null
  }

  return {
    title: state.designDoc.title,
    workflow_mode: state.workflowMode,
    project_type: 'solana_mobile_app',
    framework: state.generationFramework,
    design_doc: renderDesignDocMarkdown(state.designDoc),
    ...(state.cvlrSpec ? { cvlr_specs_ready: true } : {}),
  }
}

export function updateWorkflowMode(state: MvpShellState, workflowMode: WorkflowMode): MvpShellState {
  return {
    ...state,
    workflowMode,
  }
}

export function updateGenerationFramework(state: MvpShellState, generationFramework: GenerationFramework): MvpShellState {
  return {
    ...state,
    generationFramework,
  }
}

export function getGenerationBlocker(state: MvpShellState): string | null {
  if (!state.designDoc) {
    return 'Create or restore a Design Doc before generation can start.'
  }
  if (state.designDoc.missingInformation.length > 0) {
    if (state.workflowMode === 'vibe_coding') {
      return 'Use AI defaults or clear the missing information before generation.'
    }
    return 'Answer or clear the Design Doc missing information before generation.'
  }
  if (!state.designDocApprovedAt) {
    return 'Approve the Design Doc in Workspace before generation.'
  }
  if (state.verificationProperties.length === 0 || !state.verificationPropertiesApprovedAt) {
    return 'Review and approve the properties to hold before generation.'
  }
  if (!state.cvlrSpec) {
    return 'Generate CVLR specs from the approved properties before generation.'
  }
  if (!state.cvlrSpecApprovedAt) {
    return 'Approve the CVLR specs before generation.'
  }
  return null
}

export function getCvlrSpecBlocker(state: MvpShellState): string | null {
  if (state.verificationProperties.length === 0) {
    return 'Verification properties must exist before generating CVLR specs.'
  }
  if (!state.verificationPropertiesApprovedAt) {
    return 'Approve the verification properties before generating CVLR specs.'
  }
  return null
}

export function getCvlrApprovalBlocker(state: MvpShellState): string | null {
  if (!state.cvlrSpec) {
    return 'Generate CVLR specs before approving.'
  }
  return null
}

export function approveCvlrSpec(state: MvpShellState, nowIso: string): MvpShellState {
  if (!state.cvlrSpec) {
    return state
  }
  return {
    ...state,
    cvlrSpecApprovedAt: nowIso,
  }
}

export function saveCvlrSpec(state: MvpShellState, spec: CvlrSpec): MvpShellState {
  return {
    ...state,
    cvlrSpec: spec,
    cvlrSpecApprovedAt: null,
  }
}

export function approveDesignDoc(state: MvpShellState, nowIso: string): MvpShellState {
  if (!state.designDoc) {
    return state
  }

  return {
    ...state,
    designDocApprovedAt: nowIso,
    verificationProperties: state.verificationProperties,
    verificationPropertiesApprovedAt: null,
  }
}

export function approveVerificationProperties(state: MvpShellState, nowIso: string): MvpShellState {
  if (!state.designDocApprovedAt || state.verificationProperties.length === 0) {
    return state
  }

  return {
    ...state,
    verificationPropertiesApprovedAt: nowIso,
    cvlrSpec: null,
    cvlrSpecApprovedAt: null,
  }
}

export function saveGenerationJob(state: MvpShellState, job: GenerationJobRecord): MvpShellState {
  return {
    ...state,
    generationJob: job,
  }
}

export function saveDeploymentJob(state: MvpShellState, job: DeploymentJobRecord): MvpShellState {
  return {
    ...state,
    deploymentJob: job,
  }
}

export function getGenerationStatusLabel(status: string) {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'succeeded':
      return 'Succeeded'
    case 'failed':
    case 'timed_out':
    case 'canceled':
      return 'Failed'
    case 'unavailable':
    default:
      return 'Unavailable'
  }
}

export function hasRenderableGenerationResult(job: GenerationJobRecord | null) {
  return Boolean(job && job.status === 'succeeded' && job.artifacts.length > 0)
}

export function getDeployableGenerationArtifact(job: GenerationJobRecord | null): GenerationArtifactRecord | null {
  if (!hasRenderableGenerationResult(job)) {
    return null
  }

  return job?.artifacts.find((artifact) => getGenerationArtifactDeploymentKind(artifact) === 'program_binary') ?? null
}

export function getGenerationArtifactDeploymentKind(
  artifact: GenerationArtifactRecord | null,
): DeploymentArtifactKind | null {
  if (!artifact) {
    return null
  }

  const name = artifact.name.toLowerCase()
  const path = artifact.path.toLowerCase()
  const typeLabel = artifact.typeLabel.toLowerCase()

  if (typeLabel === 'program_binary' || name.endsWith('.so') || path.endsWith('.so')) {
    return 'program_binary'
  }

  if (name === 'cargo.toml' || path.endsWith('/cargo.toml')) {
    return 'cargo_project_source'
  }

  return null
}

export function getDevnetDeploymentBlocker(
  state: MvpShellState,
  walletConnected: boolean,
  squadsUpgradeAuthorityAddress = '',
): string | null {
  if (!getDeployableGenerationArtifact(state.generationJob)) {
    return 'Build a Solana program binary before devnet deployment.'
  }
  if (!walletConnected) {
    return 'Connect a wallet before devnet deployment.'
  }
  if (!squadsUpgradeAuthorityAddress.trim()) {
    return 'Paste the Squads upgrade authority before devnet deployment.'
  }
  return null
}

export function getDeploymentStatusLabel(status: string) {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'payment_required':
      return 'Payment required'
    case 'payment_confirming':
      return 'Confirming payment'
    case 'deploying':
      return 'Deploying'
    case 'authority_verification_pending':
      return 'Verifying authority'
    case 'blocked':
    case 'signature_needed':
      return 'Signature needed'
    case 'refund_pending':
      return 'Refund pending'
    case 'refunded':
      return 'Refunded'
    case 'succeeded':
      return 'Succeeded'
    case 'failed':
    case 'timed_out':
    case 'canceled':
      return 'Failed'
    case 'unavailable':
    default:
      return 'Unavailable'
  }
}

export function isActiveDeploymentJob(status: string) {
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'retrying' ||
    status === 'payment_confirming' ||
    status === 'deploying' ||
    status === 'authority_verification_pending' ||
    status === 'refund_pending'
  )
}

export function getGenerationResultIssue(job: GenerationJobRecord | null) {
  if (!job) {
    return null
  }

  if (job.status === 'succeeded' && job.artifacts.length === 0) {
    return 'Backend returned a succeeded generation without generated artifacts.'
  }

  if (job.status === 'failed' && job.artifacts.length === 0) {
    return job.errorMessage ?? 'The backend did not return generated artifacts for this result.'
  }

  return null
}

export function updateDesignDocField(
  state: MvpShellState,
  field: keyof Pick<MvpDesignDoc, 'title' | 'goal'>,
  value: string,
): MvpShellState {
  if (!state.designDoc) {
    return state
  }

  return {
    ...state,
    designDoc: {
      ...state.designDoc,
      [field]: value.trim(),
    },
    designDocApprovedAt: null,
    verificationProperties: [],
    verificationPropertiesApprovedAt: null,
  }
}

export function updateDesignDocListField(
  state: MvpShellState,
  field: keyof Pick<MvpDesignDoc, 'coreRequirements' | 'assumptions' | 'missingInformation'>,
  value: string,
): MvpShellState {
  if (!state.designDoc) {
    return state
  }

  return {
    ...state,
    designDoc: {
      ...state.designDoc,
      [field]: splitLines(value),
    },
    designDocApprovedAt: null,
    verificationProperties: [],
    verificationPropertiesApprovedAt: null,
  }
}

export function serializeMvpShellState(state: MvpShellState): string {
  const snapshot: StoredMvpShellState = {
    workflowMode: state.workflowMode,
    generationFramework: state.generationFramework,
    messages: state.messages,
    latestPromptSeed: state.latestPromptSeed,
    designDoc: state.designDoc,
    designDocApprovedAt: state.designDocApprovedAt,
    verificationProperties: state.verificationProperties,
    verificationPropertiesApprovedAt: state.verificationPropertiesApprovedAt,
    cvlrSpec: state.cvlrSpec,
    cvlrSpecApprovedAt: state.cvlrSpecApprovedAt,
    secProReviewRequestedAt: state.secProReviewRequestedAt,
    publishedAt: state.publishedAt,
    suggestions: state.suggestions,
    generationJob: state.generationJob,
    deploymentJob: state.deploymentJob,
  }

  return JSON.stringify(snapshot)
}

export function restoreMvpShellState(serialized: string | null | undefined): MvpShellState | null {
  if (!serialized) {
    return null
  }

  try {
    const parsed = JSON.parse(serialized) as Partial<StoredMvpShellState>

    if (!Array.isArray(parsed.messages)) {
      return null
    }

    if (!parsed.messages.every(isChatMessage)) {
      return null
    }

    if (
      parsed.latestPromptSeed !== null &&
      parsed.latestPromptSeed !== undefined &&
      !isPromptSeed(parsed.latestPromptSeed)
    ) {
      return null
    }

    if (parsed.designDoc !== null && parsed.designDoc !== undefined && !isDesignDoc(parsed.designDoc)) {
      return null
    }

    if (
      parsed.verificationProperties !== undefined &&
      (!Array.isArray(parsed.verificationProperties) || !parsed.verificationProperties.every(isVerificationProperty))
    ) {
      return null
    }

    if (
      parsed.suggestions !== undefined &&
      (!Array.isArray(parsed.suggestions) || !parsed.suggestions.every(isSuggestion))
    ) {
      return null
    }

    if (parsed.cvlrSpec !== undefined && parsed.cvlrSpec !== null && !isCvlrSpec(parsed.cvlrSpec)) {
      return null
    }

    if (parsed.generationJob !== null && parsed.generationJob !== undefined) {
      const normalizedGenerationJob = normalizeGenerationJobRecord(parsed.generationJob)

      if (!normalizedGenerationJob) {
        return null
      }

      parsed.generationJob = normalizedGenerationJob
    }

    if (parsed.deploymentJob !== null && parsed.deploymentJob !== undefined) {
      const normalizedDeploymentJob = normalizeDeploymentJobRecord(parsed.deploymentJob)

      if (!normalizedDeploymentJob) {
        return null
      }

      parsed.deploymentJob = normalizedDeploymentJob
    }

    return {
      workflowMode: normalizeWorkflowMode(parsed.workflowMode),
      generationFramework: normalizeGenerationFramework(parsed.generationFramework),
      messages: parsed.messages,
      latestPromptSeed: parsed.latestPromptSeed ?? null,
      designDoc:
        parsed.designDoc ??
        (parsed.latestPromptSeed
          ? createDesignDocFromPrompt(parsed.latestPromptSeed.prompt, parsed.latestPromptSeed.updatedAt)
          : null),
      designDocApprovedAt: typeof parsed.designDocApprovedAt === 'string' ? parsed.designDocApprovedAt : null,
      verificationProperties: parsed.verificationProperties ?? [],
      verificationPropertiesApprovedAt:
        typeof parsed.verificationPropertiesApprovedAt === 'string' ? parsed.verificationPropertiesApprovedAt : null,
      cvlrSpec: parsed.cvlrSpec ?? null,
      cvlrSpecApprovedAt: typeof parsed.cvlrSpecApprovedAt === 'string' ? parsed.cvlrSpecApprovedAt : null,
      secProReviewRequestedAt:
        typeof parsed.secProReviewRequestedAt === 'string' ? parsed.secProReviewRequestedAt : null,
      publishedAt: typeof parsed.publishedAt === 'string' ? parsed.publishedAt : null,
      suggestions: parsed.suggestions ?? [],
      generationJob: (parsed.generationJob as GenerationJobRecord | undefined) ?? null,
      deploymentJob: (parsed.deploymentJob as DeploymentJobRecord | undefined) ?? null,
    }
  } catch {
    return null
  }
}

export function mergeBackendProjectState(backendState: MvpShellState, localState: MvpShellState): MvpShellState {
  return {
    ...backendState,
    generationFramework: localState.generationFramework,
  }
}

export function renderDesignDocMarkdown(designDoc: MvpDesignDoc): string {
  const lines = [
    `# ${designDoc.title}`,
    '',
    '## Goal',
    designDoc.goal,
    '',
    '## Core requirements',
    ...renderBulletList(designDoc.coreRequirements),
    '',
    '## Assumptions',
    ...renderBulletList(designDoc.assumptions),
  ]

  if (designDoc.missingInformation.length > 0) {
    lines.push('', '## Missing information', ...renderBulletList(designDoc.missingInformation))
  }

  return lines.join('\n')
}

function createDesignDocFromPrompt(prompt: string, nowIso: string): MvpDesignDoc {
  const subject = extractPromptSubject(prompt)
  const title = subject

  return {
    title,
    goal: `Deliver ${subject.toLowerCase()} before generation starts.`,
    coreRequirements: [
      'Capture the user prompt as the project seed and keep it visible during review.',
      `Turn ${subject.toLowerCase()} into one editable Design Doc with clear requirements.`,
      'Keep the Design Doc ready for a later backend generation submission without requiring extra setup.',
    ],
    assumptions: [
      'The first generated Design Doc is concise and user-editable.',
      'Generation, verification, and deployment stay outside this review step until the backend contract is available.',
    ],
    missingInformation: [
      'Success criteria or acceptance checks that define a finished outcome.',
      'Any integration, wallet, or backend constraints that must shape generation later.',
    ],
    updatedAt: nowIso,
  }
}

function extractPromptSubject(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, ' ')
  const withoutLead = normalized.replace(/^(build|create|design|make)\s+/i, '')
  const truncated = withoutLead.split(/\b(?:that|with|for|using|which|to)\b/i)[0]?.trim() || withoutLead
  const withoutArticle = truncated.replace(/^(a|an|the)\s+/i, '').replace(/[.!?;:]+$/g, '')

  if (!withoutArticle) {
    return 'Design Doc'
  }

  return withoutArticle.charAt(0).toUpperCase() + withoutArticle.slice(1)
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function renderBulletList(entries: string[]): string[] {
  return entries.map((entry) => `- ${entry}`)
}

function tokenizeRouteText(value: string): string[] {
  const stopWords = new Set(['a', 'an', 'and', 'app', 'build', 'create', 'for', 'mvp', 'new', 'project', 'the', 'to'])
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token))
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ChatMessage>
  return (
    typeof candidate.id === 'string' &&
    (candidate.side === 'user' || candidate.side === 'app') &&
    typeof candidate.text === 'string' &&
    (candidate.source === undefined ||
      candidate.source === 'main' ||
      candidate.source === 'prompt_seed' ||
      candidate.source === 'suggestion')
  )
}

function isPromptSeed(value: unknown): value is MvpProjectSeed {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<MvpProjectSeed>
  return typeof candidate.prompt === 'string' && typeof candidate.updatedAt === 'string'
}

function normalizeWorkflowMode(value: unknown): WorkflowMode {
  if (value === 'vibe_coding' || value === 'Vibe') {
    return 'vibe_coding'
  }
  if (value === 'professional_development' || value === 'Pro') {
    return 'professional_development'
  }
  return DEFAULT_WORKFLOW_MODE
}

function normalizeGenerationFramework(value: unknown): GenerationFramework {
  if (value === 'Quasar' || value === 'Pinocchio') {
    return value
  }
  return DEFAULT_GENERATION_FRAMEWORK
}

function isDesignDoc(value: unknown): value is MvpDesignDoc {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<MvpDesignDoc>
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.goal === 'string' &&
    Array.isArray(candidate.coreRequirements) &&
    candidate.coreRequirements.every((entry) => typeof entry === 'string') &&
    Array.isArray(candidate.assumptions) &&
    candidate.assumptions.every((entry) => typeof entry === 'string') &&
    Array.isArray(candidate.missingInformation) &&
    candidate.missingInformation.every((entry) => typeof entry === 'string') &&
    typeof candidate.updatedAt === 'string'
  )
}

function isSuggestion(value: unknown): value is Suggestion {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Suggestion>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.body === 'string' &&
    typeof candidate.detail === 'string' &&
    typeof candidate.impact === 'string' &&
    typeof candidate.createdAt === 'string'
  )
}

function isVerificationProperty(value: unknown): value is VerificationProperty {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<VerificationProperty>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.statement === 'string' &&
    typeof candidate.rationale === 'string'
  )
}

function isCvlrSpec(value: unknown): value is CvlrSpec {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<CvlrSpec>
  return (
    typeof candidate.checksRs === 'string' &&
    typeof candidate.systemDocTxt === 'string' &&
    typeof candidate.generatedAt === 'string'
  )
}

function isGenerationJobRecord(value: unknown): value is GenerationJobRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GenerationJobRecord>
  return (
    typeof candidate.jobId === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.statusUrl === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.artifactRefs) &&
    candidate.artifactRefs.every((entry) => typeof entry === 'string') &&
    Array.isArray(candidate.artifacts) &&
    candidate.artifacts.every(isGenerationArtifactRecord) &&
    (candidate.currentPhase === undefined ||
      candidate.currentPhase === null ||
      typeof candidate.currentPhase === 'string') &&
    (candidate.progressSummary === undefined ||
      candidate.progressSummary === null ||
      typeof candidate.progressSummary === 'string') &&
    (candidate.startedAt === undefined || candidate.startedAt === null || typeof candidate.startedAt === 'string') &&
    (candidate.finishedAt === undefined || candidate.finishedAt === null || typeof candidate.finishedAt === 'string') &&
    (candidate.lastHeartbeatAt === undefined ||
      candidate.lastHeartbeatAt === null ||
      typeof candidate.lastHeartbeatAt === 'string') &&
    (candidate.aiComposerThreadId === undefined ||
      candidate.aiComposerThreadId === null ||
      typeof candidate.aiComposerThreadId === 'string') &&
    (candidate.lastCheckpointId === undefined ||
      candidate.lastCheckpointId === null ||
      typeof candidate.lastCheckpointId === 'string') &&
    (candidate.latestLogExcerpt === undefined ||
      candidate.latestLogExcerpt === null ||
      typeof candidate.latestLogExcerpt === 'string') &&
    (candidate.lastMaterializedSnapshotAt === undefined ||
      candidate.lastMaterializedSnapshotAt === null ||
      typeof candidate.lastMaterializedSnapshotAt === 'string') &&
    (candidate.providerLabel === undefined ||
      candidate.providerLabel === null ||
      typeof candidate.providerLabel === 'string') &&
    (candidate.modelLabel === undefined || candidate.modelLabel === null || typeof candidate.modelLabel === 'string')
  )
}

function normalizeGenerationJobRecord(value: unknown): GenerationJobRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<GenerationJobRecord> & {
    artifactRefs?: unknown
    artifacts?: unknown
  }

  const normalized: GenerationJobRecord = {
    jobId: typeof candidate.jobId === 'string' ? candidate.jobId : '',
    status: typeof candidate.status === 'string' ? candidate.status : '',
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    statusUrl: typeof candidate.statusUrl === 'string' ? candidate.statusUrl : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
    currentPhase: typeof candidate.currentPhase === 'string' ? candidate.currentPhase : null,
    progressSummary: typeof candidate.progressSummary === 'string' ? candidate.progressSummary : null,
    startedAt: typeof candidate.startedAt === 'string' ? candidate.startedAt : null,
    finishedAt: typeof candidate.finishedAt === 'string' ? candidate.finishedAt : null,
    lastHeartbeatAt: typeof candidate.lastHeartbeatAt === 'string' ? candidate.lastHeartbeatAt : null,
    aiComposerThreadId: typeof candidate.aiComposerThreadId === 'string' ? candidate.aiComposerThreadId : null,
    lastCheckpointId: typeof candidate.lastCheckpointId === 'string' ? candidate.lastCheckpointId : null,
    latestLogExcerpt: typeof candidate.latestLogExcerpt === 'string' ? candidate.latestLogExcerpt : null,
    lastMaterializedSnapshotAt:
      typeof candidate.lastMaterializedSnapshotAt === 'string' ? candidate.lastMaterializedSnapshotAt : null,
    artifactRefs: Array.isArray(candidate.artifactRefs)
      ? candidate.artifactRefs.filter((entry): entry is string => typeof entry === 'string')
      : [],
    artifacts: Array.isArray(candidate.artifacts) ? candidate.artifacts.filter(isGenerationArtifactRecord) : [],
    providerLabel: typeof candidate.providerLabel === 'string' ? candidate.providerLabel : null,
    modelLabel: typeof candidate.modelLabel === 'string' ? candidate.modelLabel : null,
  }

  return isGenerationJobRecord(normalized) ? normalized : null
}

function isGenerationArtifactRecord(value: unknown): value is GenerationArtifactRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GenerationArtifactRecord>
  return (
    typeof candidate.artifactId === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.typeLabel === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.summary === 'string'
  )
}

function isDeploymentTransactionRequest(value: unknown): value is DeploymentTransactionRequest {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<DeploymentTransactionRequest>
  return (
    typeof candidate.requestId === 'string' &&
    typeof candidate.transactionBase64 === 'string' &&
    (candidate.minContextSlot === null || typeof candidate.minContextSlot === 'string') &&
    typeof candidate.summary === 'string' &&
    (candidate.simulationSummary === null || typeof candidate.simulationSummary === 'string')
  )
}

function isDeploymentFeeEstimate(value: unknown): value is DeploymentFeeEstimate {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<DeploymentFeeEstimate>
  return (
    typeof candidate.programSizeBytes === 'number' &&
    (candidate.programSha256 === undefined ||
      candidate.programSha256 === null ||
      typeof candidate.programSha256 === 'string') &&
    (candidate.programDataSpaceBytes === undefined ||
      candidate.programDataSpaceBytes === null ||
      typeof candidate.programDataSpaceBytes === 'number') &&
    (candidate.programAccountSpaceBytes === undefined ||
      candidate.programAccountSpaceBytes === null ||
      typeof candidate.programAccountSpaceBytes === 'number') &&
    typeof candidate.rentLamports === 'number' &&
    typeof candidate.estimatedNetworkFeeLamports === 'number' &&
    typeof candidate.serviceFeeLamports === 'number' &&
    typeof candidate.totalLamports === 'number' &&
    (candidate.calculationBasis === undefined ||
      candidate.calculationBasis === null ||
      typeof candidate.calculationBasis === 'string') &&
    typeof candidate.estimateExpiresAt === 'string' &&
    typeof candidate.paymentRecipient === 'string'
  )
}

function isDeploymentJobRecord(value: unknown): value is DeploymentJobRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<DeploymentJobRecord>
  return (
    typeof candidate.jobId === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.statusUrl === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.cluster === 'string' &&
    typeof candidate.sourceArtifactId === 'string' &&
    (candidate.payerWallet === null || typeof candidate.payerWallet === 'string') &&
    (candidate.authorityWallet === null || typeof candidate.authorityWallet === 'string') &&
    typeof candidate.authorityMode === 'string' &&
    (candidate.programId === null || typeof candidate.programId === 'string') &&
    Array.isArray(candidate.transactionSignatures) &&
    candidate.transactionSignatures.every((entry) => typeof entry === 'string') &&
    Array.isArray(candidate.deploymentRefs) &&
    candidate.deploymentRefs.every((entry) => typeof entry === 'string') &&
    (candidate.verificationStatusAtDeploy === null || typeof candidate.verificationStatusAtDeploy === 'string') &&
    typeof candidate.upgradeAuthorityVerified === 'boolean' &&
    typeof candidate.squadsAuthorityValidationStatus === 'string' &&
    (candidate.deploymentEstimate === null || isDeploymentFeeEstimate(candidate.deploymentEstimate)) &&
    (candidate.paymentRequest === null || isDeploymentTransactionRequest(candidate.paymentRequest)) &&
    (candidate.paymentSignature === null || typeof candidate.paymentSignature === 'string') &&
    (candidate.refundSignature === null || typeof candidate.refundSignature === 'string') &&
    (candidate.signatureRequest === null || isDeploymentTransactionRequest(candidate.signatureRequest)) &&
    (candidate.errorMessage === null || typeof candidate.errorMessage === 'string')
  )
}

function normalizeDeploymentJobRecord(value: unknown): DeploymentJobRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<DeploymentJobRecord> & {
    transactionSignatures?: unknown
    deploymentRefs?: unknown
    deploymentEstimate?: unknown
    paymentRequest?: unknown
    signatureRequest?: unknown
  }

  const normalizedDeploymentEstimate =
    candidate.deploymentEstimate && isDeploymentFeeEstimate(candidate.deploymentEstimate)
      ? candidate.deploymentEstimate
      : null
  const normalizedPaymentRequest =
    candidate.paymentRequest && isDeploymentTransactionRequest(candidate.paymentRequest) ? candidate.paymentRequest : null
  const normalizedSignatureRequest =
    candidate.signatureRequest && isDeploymentTransactionRequest(candidate.signatureRequest)
      ? candidate.signatureRequest
      : null

  const normalized: DeploymentJobRecord = {
    jobId: typeof candidate.jobId === 'string' ? candidate.jobId : '',
    status: typeof candidate.status === 'string' ? candidate.status : '',
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    statusUrl: typeof candidate.statusUrl === 'string' ? candidate.statusUrl : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
    cluster: typeof candidate.cluster === 'string' ? candidate.cluster : 'devnet',
    sourceArtifactId: typeof candidate.sourceArtifactId === 'string' ? candidate.sourceArtifactId : '',
    payerWallet: typeof candidate.payerWallet === 'string' ? candidate.payerWallet : null,
    authorityWallet: typeof candidate.authorityWallet === 'string' ? candidate.authorityWallet : null,
    authorityMode: typeof candidate.authorityMode === 'string' ? candidate.authorityMode : 'user_wallet_demo_authority',
    programId: typeof candidate.programId === 'string' ? candidate.programId : null,
    transactionSignatures: Array.isArray(candidate.transactionSignatures)
      ? candidate.transactionSignatures.filter((entry): entry is string => typeof entry === 'string')
      : [],
    deploymentRefs: Array.isArray(candidate.deploymentRefs)
      ? candidate.deploymentRefs.filter((entry): entry is string => typeof entry === 'string')
      : [],
    verificationStatusAtDeploy:
      typeof candidate.verificationStatusAtDeploy === 'string' ? candidate.verificationStatusAtDeploy : null,
    upgradeAuthorityVerified:
      typeof candidate.upgradeAuthorityVerified === 'boolean' ? candidate.upgradeAuthorityVerified : false,
    squadsAuthorityValidationStatus:
      typeof candidate.squadsAuthorityValidationStatus === 'string'
        ? candidate.squadsAuthorityValidationStatus
        : 'not_applicable',
    deploymentEstimate: normalizedDeploymentEstimate,
    paymentRequest: normalizedPaymentRequest,
    paymentSignature: typeof candidate.paymentSignature === 'string' ? candidate.paymentSignature : null,
    refundSignature: typeof candidate.refundSignature === 'string' ? candidate.refundSignature : null,
    signatureRequest: normalizedSignatureRequest,
    errorMessage: typeof candidate.errorMessage === 'string' ? candidate.errorMessage : null,
  }

  return isDeploymentJobRecord(normalized) ? normalized : null
}
