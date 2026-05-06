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

export type MvpShellState = {
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
  designDoc: MvpDesignDoc | null
}

type StoredMvpShellState = {
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
  designDoc: MvpDesignDoc | null
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
  }
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

    return {
      messages: parsed.messages,
      latestPromptSeed: parsed.latestPromptSeed ?? null,
      designDoc:
        parsed.designDoc ??
        (parsed.latestPromptSeed
          ? createDesignDocFromPrompt(parsed.latestPromptSeed.prompt, parsed.latestPromptSeed.updatedAt)
          : null),
    }
  } catch {
    return null
  }
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
