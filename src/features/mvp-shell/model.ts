export type ChatMessage = {
  id: string
  side: 'user' | 'app'
  text: string
}

export type MvpProjectSeed = {
  prompt: string
  updatedAt: string
}

export type MvpDesignDoc = {
  title: string
  goal: string
  coreRequirements: string[]
  assumptions: string[]
  missingInformation: string[]
  updatedAt: string
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
  artifactRefs: string[]
  artifacts: GenerationArtifactRecord[]
  providerLabel?: string | null
  modelLabel?: string | null
}

export type MvpShellState = {
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
  designDoc: MvpDesignDoc | null
  generationJob: GenerationJobRecord | null
}

type StoredMvpShellState = {
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
  designDoc: MvpDesignDoc | null
  generationJob: GenerationJobRecord | null
}

export type GenerationJobRequest = {
  title: string
  workflow_mode: string
  project_type: string
  design_doc: string
}

export const MVP_CAPTURE_ACK =
  'Saved as the MVP prompt seed. You can review or refine it before generation.'

export function createInitialMvpShellState(): MvpShellState {
  return {
    messages: [
      {
        id: 'welcome-1',
        side: 'app',
        text: 'Describe the app or program you want to build. Your latest prompt will be kept as the MVP seed.',
      },
    ],
    latestPromptSeed: null,
    designDoc: null,
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
      },
      {
        id: createId(),
        side: 'app',
        text: MVP_CAPTURE_ACK,
      },
    ],
    latestPromptSeed: {
      prompt,
      updatedAt: nowIso,
    },
    designDoc: createDesignDocFromPrompt(prompt, nowIso),
    generationJob: null,
  }
}

export function buildGenerationRequest(state: MvpShellState): GenerationJobRequest | null {
  if (!state.designDoc) {
    return null
  }

  return {
    title: state.designDoc.title,
    workflow_mode: 'generate',
    project_type: 'solana_mobile_app',
    design_doc: renderDesignDocMarkdown(state.designDoc),
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
  }
}

export function serializeMvpShellState(state: MvpShellState): string {
  const snapshot: StoredMvpShellState = {
    messages: state.messages,
    latestPromptSeed: state.latestPromptSeed,
    designDoc: state.designDoc,
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

    if (parsed.generationJob !== null && parsed.generationJob !== undefined) {
      const normalizedGenerationJob = normalizeGenerationJobRecord(parsed.generationJob)

      if (!normalizedGenerationJob) {
        return null
      }

      parsed.generationJob = normalizedGenerationJob
    }

    return {
      messages: parsed.messages,
      latestPromptSeed: parsed.latestPromptSeed ?? null,
      designDoc:
        parsed.designDoc ??
        (parsed.latestPromptSeed
          ? createDesignDocFromPrompt(parsed.latestPromptSeed.prompt, parsed.latestPromptSeed.updatedAt)
          : null),
      generationJob: (parsed.generationJob as GenerationJobRecord | undefined) ?? null,
    }
  } catch {
    return null
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
  const withoutArticle = truncated.replace(/^(a|an|the)\s+/i, '')

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
    typeof candidate.text === 'string'
  )
}

function isPromptSeed(value: unknown): value is MvpProjectSeed {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<MvpProjectSeed>
  return typeof candidate.prompt === 'string' && typeof candidate.updatedAt === 'string'
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
