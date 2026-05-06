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

export const DEFAULT_WORKFLOW_MODE: WorkflowMode = 'professional_development'

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
}

export type MvpShellState = {
  workflowMode: WorkflowMode
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
  designDoc: MvpDesignDoc | null
  designDocApprovedAt: string | null
  verificationProperties: VerificationProperty[]
  verificationPropertiesApprovedAt: string | null
  suggestions: Suggestion[]
  generationJob: GenerationJobRecord | null
}

type StoredMvpShellState = {
  workflowMode?: WorkflowMode
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
  designDoc: MvpDesignDoc | null
  designDocApprovedAt?: string | null
  verificationProperties?: VerificationProperty[]
  verificationPropertiesApprovedAt?: string | null
  suggestions?: Suggestion[]
  generationJob: GenerationJobRecord | null
}

export type GenerationJobRequest = {
  title: string
  workflow_mode: string
  project_type: string
  design_doc: string
}

export const MVP_CAPTURE_ACK =
  'Project request captured. Review the Design Doc in Workspace before generation.'

export function createInitialMvpShellState(): MvpShellState {
  return {
    workflowMode: DEFAULT_WORKFLOW_MODE,
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
    suggestions: [],
    generationJob: null,
  }
}

export function submitPrompt(
  state: MvpShellState,
  input: string,
  createId: () => string,
  nowIso: string
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
    latestPromptSeed: {
      prompt,
      updatedAt: nowIso,
    },
    designDoc: createDesignDocFromPrompt(prompt, nowIso),
    designDocApprovedAt: null,
    verificationProperties: [],
    verificationPropertiesApprovedAt: null,
    suggestions: [],
    generationJob: null,
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
    design_doc: renderDesignDocMarkdown(state.designDoc),
  }
}

export function updateWorkflowMode(state: MvpShellState, workflowMode: WorkflowMode): MvpShellState {
  return {
    ...state,
    workflowMode,
  }
}

export function getGenerationBlocker(state: MvpShellState): string | null {
  if (!state.designDoc) {
    return 'Create or restore an MVP Design Doc before generation can start.'
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
  if (!state.verificationPropertiesApprovedAt) {
    return 'Review and approve the properties to prove before generation.'
  }
  return null
}

export function approveDesignDoc(state: MvpShellState, nowIso: string): MvpShellState {
  if (!state.designDoc) {
    return state
  }

  return {
    ...state,
    designDocApprovedAt: nowIso,
    verificationProperties: deriveVerificationProperties(state.designDoc, nowIso),
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
  }
}

export function saveGenerationJob(state: MvpShellState, job: GenerationJobRecord): MvpShellState {
  return {
    ...state,
    generationJob: job,
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

export function getGenerationResultIssue(job: GenerationJobRecord | null) {
  if (!job) {
    return null
  }

  if (job.status === 'succeeded' && job.artifacts.length === 0) {
    return 'Backend returned a succeeded generation without generated artifacts.'
  }

  if (job.status === 'failed' && job.artifacts.length === 0) {
    return 'The backend did not return generated artifacts for this result.'
  }

  return null
}

export function updateDesignDocField(
  state: MvpShellState,
  field: keyof Pick<MvpDesignDoc, 'title' | 'goal'>,
  value: string
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
  value: string
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
    messages: state.messages,
    latestPromptSeed: state.latestPromptSeed,
    designDoc: state.designDoc,
    designDocApprovedAt: state.designDocApprovedAt,
    verificationProperties: state.verificationProperties,
    verificationPropertiesApprovedAt: state.verificationPropertiesApprovedAt,
    suggestions: state.suggestions,
    generationJob: state.generationJob,
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

    if (parsed.latestPromptSeed !== null && parsed.latestPromptSeed !== undefined && !isPromptSeed(parsed.latestPromptSeed)) {
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

    if (parsed.suggestions !== undefined && (!Array.isArray(parsed.suggestions) || !parsed.suggestions.every(isSuggestion))) {
      return null
    }

    if (parsed.generationJob !== null && parsed.generationJob !== undefined) {
      const normalizedGenerationJob = normalizeGenerationJobRecord(parsed.generationJob)

      if (!normalizedGenerationJob) {
        return null
      }

      parsed.generationJob = normalizedGenerationJob
    }

    return {
      workflowMode: normalizeWorkflowMode(parsed.workflowMode),
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
      suggestions: parsed.suggestions ?? [],
      generationJob: (parsed.generationJob as GenerationJobRecord | undefined) ?? null,
    }
  } catch {
    return null
  }
}

export function mergeBackendProjectState(backendState: MvpShellState, localState: MvpShellState): MvpShellState {
  if (!backendState.designDoc || !localState.designDoc || !isSameDesignDoc(backendState.designDoc, localState.designDoc)) {
    return backendState
  }

  return {
    ...backendState,
    designDocApprovedAt: localState.designDocApprovedAt,
    verificationProperties: localState.verificationProperties,
    verificationPropertiesApprovedAt: localState.verificationPropertiesApprovedAt,
  }
}

function renderDesignDocMarkdown(designDoc: MvpDesignDoc): string {
  return [
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
    '',
    '## Missing information',
    ...renderBulletList(designDoc.missingInformation),
  ].join('\n')
}

function createDesignDocFromPrompt(prompt: string, nowIso: string): MvpDesignDoc {
  const subject = extractPromptSubject(prompt)
  const title = /\bmvp$/i.test(subject) ? subject : `${subject} MVP`

  return {
    title,
    goal: `Deliver ${subject.toLowerCase()} through a hackathon-ready MVP flow before generation starts.`,
    coreRequirements: [
      'Capture the user prompt as the project seed and keep it visible during review.',
      `Turn ${subject.toLowerCase()} into one editable MVP Design Doc with clear requirements.`,
      'Keep the Design Doc ready for a later backend generation submission without requiring extra setup.',
    ],
    assumptions: [
      'The first generated Design Doc is a concise MVP draft that the user can refine in-app.',
      'Generation, verification, and deployment stay outside this review step until the backend contract is available.',
    ],
    missingInformation: [
      'Success criteria or acceptance checks that define a finished MVP outcome.',
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
    return 'MVP design doc'
  }

  return withoutArticle.charAt(0).toUpperCase() + withoutArticle.slice(1)
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function deriveVerificationProperties(designDoc: MvpDesignDoc, nowIso: string): VerificationProperty[] {
  const title = designDoc.title.trim() || 'MVP'
  const primaryRequirement = designDoc.coreRequirements[0] ?? 'The approved Design Doc requirements are preserved.'
  const missingInformation =
    designDoc.missingInformation.length > 0
      ? 'Open questions are resolved by the user or explicitly defaulted before generation.'
      : 'The approved Design Doc has no unresolved missing-information items.'

  return [
    {
      id: `prop_request_preserved_${nowIso}`,
      label: 'Property 01',
      statement: `${title} generation preserves the approved goal and core requirements.`,
      rationale: 'Prevents CVLR generation from drifting away from the Design Doc the user approved.',
    },
    {
      id: `prop_primary_requirement_${nowIso}`,
      label: 'Property 02',
      statement: primaryRequirement,
      rationale: 'Turns the highest-priority requirement into an explicit proof target before generation.',
    },
    {
      id: `prop_missing_information_${nowIso}`,
      label: 'Property 03',
      statement: missingInformation,
      rationale: 'Keeps assumptions and open questions visible before AI Composer/CVLR work starts.',
    },
  ]
}

function isSameDesignDoc(left: MvpDesignDoc, right: MvpDesignDoc) {
  return (
    left.title === right.title &&
    left.goal === right.goal &&
    left.coreRequirements.join('\n') === right.coreRequirements.join('\n') &&
    left.assumptions.join('\n') === right.assumptions.join('\n') &&
    left.missingInformation.join('\n') === right.missingInformation.join('\n')
  )
}

function renderBulletList(entries: string[]): string[] {
  return entries.map((entry) => `- ${entry}`)
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
    (candidate.currentPhase === undefined || candidate.currentPhase === null || typeof candidate.currentPhase === 'string') &&
    (candidate.progressSummary === undefined || candidate.progressSummary === null || typeof candidate.progressSummary === 'string') &&
    (candidate.startedAt === undefined || candidate.startedAt === null || typeof candidate.startedAt === 'string') &&
    (candidate.finishedAt === undefined || candidate.finishedAt === null || typeof candidate.finishedAt === 'string') &&
    (candidate.lastHeartbeatAt === undefined || candidate.lastHeartbeatAt === null || typeof candidate.lastHeartbeatAt === 'string') &&
    (candidate.aiComposerThreadId === undefined || candidate.aiComposerThreadId === null || typeof candidate.aiComposerThreadId === 'string') &&
    (candidate.lastCheckpointId === undefined || candidate.lastCheckpointId === null || typeof candidate.lastCheckpointId === 'string') &&
    (candidate.latestLogExcerpt === undefined || candidate.latestLogExcerpt === null || typeof candidate.latestLogExcerpt === 'string') &&
    (candidate.lastMaterializedSnapshotAt === undefined || candidate.lastMaterializedSnapshotAt === null || typeof candidate.lastMaterializedSnapshotAt === 'string') &&
    (candidate.providerLabel === undefined || candidate.providerLabel === null || typeof candidate.providerLabel === 'string') &&
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
    artifactRefs: Array.isArray(candidate.artifactRefs) ? candidate.artifactRefs.filter((entry): entry is string => typeof entry === 'string') : [],
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
