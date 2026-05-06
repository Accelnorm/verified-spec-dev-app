export type ChatMessage = {
  id: string
  side: 'user' | 'app'
  text: string
}

export type MvpProjectSeed = {
  prompt: string
  updatedAt: string
}

export type MvpShellState = {
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
}

type StoredMvpShellState = {
  messages: ChatMessage[]
  latestPromptSeed: MvpProjectSeed | null
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
  }
}

export function serializeMvpShellState(state: MvpShellState): string {
  const snapshot: StoredMvpShellState = {
    messages: state.messages,
    latestPromptSeed: state.latestPromptSeed,
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

    return {
      messages: parsed.messages,
      latestPromptSeed: parsed.latestPromptSeed ?? null,
    }
  } catch {
    return null
  }
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
