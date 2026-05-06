import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import {
  approveDesignDoc,
  approveVerificationProperties,
  buildGenerationRequest,
  createInitialMvpShellState,
  getGenerationBlocker,
  getGenerationResultIssue,
  getGenerationStatusLabel,
  hasRenderableGenerationResult,
  mergeBackendProjectState,
  restoreMvpShellState,
  saveGenerationJob,
  serializeMvpShellState,
  submitPrompt,
  type GenerationArtifactRecord,
  type ChatMessage,
  type GenerationJobRecord,
  type MvpDesignDoc,
  type MvpProjectSeed,
  type Suggestion,
  type VerificationProperty,
  type WorkflowMode,
  updateDesignDocField,
  updateDesignDocListField,
  updateWorkflowMode,
} from '../features/mvp-shell/model'
import {
  applyVibeDefaultsToProject,
  capturePromptToProject,
  listProjects,
  readProjectSnapshot,
  saveDesignDocToProject,
  sendProjectChatMessage,
  updateProjectWorkflowMode,
} from '../features/mvp-shell/backend'
import { readGenerationJobStatus, submitGenerationJob } from '../features/mvp-shell/generation'

type PrimaryTab = 'explore' | 'chat' | 'workspace'
type DisplayWorkflowMode = 'Vibe' | 'Pro'
type ExploreTab = 'projects' | 'properties'
type AppSettings = {
  certoraApiKey: string
  easAuth: string
  expoAccount: string
}
const projects = [
  {
    name: 'Escrow Lens',
    summary: '1 blocker, generation waiting',
    badge: 'Now',
    stage: 'Props',
    assurance: 'Spec ready, properties pending',
  },
  {
    name: 'Policy Mint',
    summary: 'PBT running, no blocker',
    badge: 'Verify',
    stage: 'Verify',
    assurance: 'Level 2 in progress',
  },
  {
    name: 'Spec Atlas',
    summary: 'Record draft ready',
    badge: 'Publish',
    stage: 'Record',
    assurance: 'Attestation manifest drafted',
  },
]

const builderProjects = [
  {
    name: 'Protocol Atlas',
    summary: 'Published project with a visible assurance ladder.',
    badge: 'L2',
  },
  {
    name: 'Vault Witness',
    summary: 'Escrow project. Partial property checks.',
    badge: 'Partial',
  },
  {
    name: 'Record Studio',
    summary: 'Publishing project with a visible record trail.',
    badge: 'Live',
  },
]

const propertyGuides = [
  {
    name: 'Money never disappears',
    summary: 'Learn how builders turn balances, fees, and withdrawals into conservation checks.',
    badge: 'Invariant',
  },
  {
    name: 'Only the right actor can pause',
    summary: 'Translate product roles into clear authority properties before code exists.',
    badge: 'Authority',
  },
  {
    name: 'Every record matches its source',
    summary: 'See how hashes and manifests become simple traceability properties.',
    badge: 'Trace',
  },
]

const stages = ['Clarify', 'Props', 'Gen', 'Verify', 'Deploy', 'Record']
const MVP_SHELL_STORAGE_KEY = 'verified-spec-dev.mvp-shell'
const ACTIVE_PROJECT_STORAGE_KEY = 'verified-spec-dev.active-project'
const LOCAL_BACKEND_BASE_URL = 'http://10.0.2.2:8000'

function getWalletErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/websocket|connection|associate|authorize|wallet/i.test(message)) {
    return 'Wallet connection failed. Unlock your wallet and try again.'
  }

  return 'Wallet action failed. Try again from your wallet.'
}

function toDisplayWorkflowMode(workflowMode: WorkflowMode): DisplayWorkflowMode {
  return workflowMode === 'vibe_coding' ? 'Vibe' : 'Pro'
}

function toCanonicalWorkflowMode(mode: DisplayWorkflowMode): WorkflowMode {
  return mode === 'Vibe' ? 'vibe_coding' : 'professional_development'
}

export function SpecDrivenApp() {
  const { account, connect, disconnect } = useMobileWallet()
  const [activeTab, setActiveTab] = useState<PrimaryTab>('chat')
  const [suggestionPage, setSuggestionPage] = useState(0)
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)
  const [mvpState, setMvpState] = useState(createInitialMvpShellState)
  const [hasLoadedMvpState, setHasLoadedMvpState] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [followUpDraft, setFollowUpDraft] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [exploreTab, setExploreTab] = useState<ExploreTab>('projects')
  const [walletError, setWalletError] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isSubmittingGeneration, setIsSubmittingGeneration] = useState(false)
  const [isRefreshingGenerationStatus, setIsRefreshingGenerationStatus] = useState(false)
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const [isApplyingVibeDefaults, setIsApplyingVibeDefaults] = useState(false)
  const generationSubmitLock = useRef(false)
  const designDocSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [appSettings, setAppSettings] = useState<AppSettings>({
    certoraApiKey: '',
    easAuth: '',
    expoAccount: '',
  })

  const accountAddress = account?.address.toString()
  const suggestionPageCount = Math.max(1, Math.ceil(mvpState.suggestions.length / 2))
  const normalizedSuggestionPage = Math.min(suggestionPage, suggestionPageCount - 1)
  const visibleSuggestions = mvpState.suggestions.slice(normalizedSuggestionPage * 2, normalizedSuggestionPage * 2 + 2)
  const displayMode = toDisplayWorkflowMode(mvpState.workflowMode)
  const screenKey = `${activeTab}-${selectedSuggestion ? selectedSuggestion.id : 'main'}-${exploreTab}`

  useEffect(() => {
    if (suggestionPage !== normalizedSuggestionPage) {
      setSuggestionPage(normalizedSuggestionPage)
    }
    if (selectedSuggestion && !mvpState.suggestions.some((suggestion) => suggestion.id === selectedSuggestion.id)) {
      setSelectedSuggestion(null)
    }
  }, [mvpState.suggestions, normalizedSuggestionPage, selectedSuggestion, suggestionPage])

  useEffect(() => {
    let isCancelled = false

    async function loadPersistedState() {
      try {
        const storedValue = await AsyncStorage.getItem(MVP_SHELL_STORAGE_KEY)
        const restoredState = restoreMvpShellState(storedValue)
        const storedProjectId = await AsyncStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)

        if (!isCancelled && restoredState) {
          setMvpState(restoredState)
        }
        if (!isCancelled && storedProjectId) {
          setActiveProjectId(storedProjectId)
        }
      } finally {
        if (!isCancelled) {
          setHasLoadedMvpState(true)
        }
      }
    }

    void loadPersistedState()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedMvpState) {
      return
    }

    void AsyncStorage.setItem(MVP_SHELL_STORAGE_KEY, serializeMvpShellState(mvpState))
    void AsyncStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProjectId ?? '')
  }, [activeProjectId, hasLoadedMvpState, mvpState])

  useEffect(() => {
    if (!hasLoadedMvpState) {
      return
    }

    let isCancelled = false

    async function hydrateFromBackend() {
      try {
        if (activeProjectId) {
          const snapshot = await readProjectSnapshot({
            backendBaseUrl: LOCAL_BACKEND_BASE_URL,
            projectId: activeProjectId,
          })
          if (!isCancelled) {
            setMvpState((currentState) => mergeBackendProjectState(snapshot.state, currentState))
            setActiveProjectId(snapshot.projectId)
          }
          return
        }

        const projectIds = await listProjects(LOCAL_BACKEND_BASE_URL)
        if (!projectIds.length) {
          return
        }
        const snapshot = await readProjectSnapshot({
          backendBaseUrl: LOCAL_BACKEND_BASE_URL,
          projectId: projectIds[0],
        })
        if (!isCancelled) {
          setMvpState((currentState) => mergeBackendProjectState(snapshot.state, currentState))
          setActiveProjectId(snapshot.projectId)
        }
      } catch {
        // Keep local cache when backend data is unavailable.
      }
    }

    void hydrateFromBackend()

    return () => {
      isCancelled = true
    }
  }, [activeProjectId, hasLoadedMvpState])

  useEffect(() => {
    if (!hasLoadedMvpState || !activeProjectId || !mvpState.designDoc) {
      return
    }

    if (designDocSaveTimer.current) {
      clearTimeout(designDocSaveTimer.current)
    }

    designDocSaveTimer.current = setTimeout(() => {
      void saveDesignDocToProject({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
        designDoc: mvpState.designDoc!,
      }).catch(() => {
        // Preserve local edits if the backend is unavailable.
      })
    }, 500)

    return () => {
      if (designDocSaveTimer.current) {
        clearTimeout(designDocSaveTimer.current)
      }
    }
  }, [activeProjectId, hasLoadedMvpState, mvpState.designDoc])

  useEffect(() => {
    const job = mvpState.generationJob
    if (!job || !isActiveGenerationJob(job.status)) {
      return
    }

    const timer = setInterval(() => {
      void handleGenerationRefresh()
    }, 15000)

    return () => {
      clearInterval(timer)
    }
  }, [mvpState.generationJob?.jobId, mvpState.generationJob?.status, isRefreshingGenerationStatus])

  async function handleWalletPress() {
    setWalletError(null)

    try {
      if (account) {
        await disconnect()
      } else {
        await connect()
      }
    } catch (error) {
      setWalletError(getWalletErrorMessage(error))
    }
  }

  async function handleSendMessage() {
    const prompt = draft.trim()
    if (!prompt) {
      return
    }

    try {
      const snapshot = await capturePromptToProject({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
        prompt,
        workflowMode: mvpState.workflowMode,
      })
      setMvpState(snapshot.state)
      setActiveProjectId(snapshot.projectId)
    } catch {
      setMvpState((currentState) =>
        submitPrompt(currentState, prompt, () => `message-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, new Date().toISOString())
      )
    }
    setDraft('')
  }

  async function handleModeChange(nextMode: DisplayWorkflowMode) {
    const workflowMode = toCanonicalWorkflowMode(nextMode)
    setMvpState((currentState) => updateWorkflowMode(currentState, workflowMode))
    setGenerationError(null)

    if (!activeProjectId) {
      return
    }

    try {
      const snapshot = await updateProjectWorkflowMode({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
        workflowMode,
      })
      setMvpState((currentState) => mergeBackendProjectState(snapshot.state, currentState))
      setActiveProjectId(snapshot.projectId)
    } catch {
      setGenerationError('Workflow mode is saved locally. Backend mode save is unavailable right now.')
    }
  }

  async function handleApplyVibeDefaults() {
    if (!activeProjectId || isApplyingVibeDefaults) {
      return
    }

    setGenerationError(null)
    setIsApplyingVibeDefaults(true)
    try {
      const snapshot = await applyVibeDefaultsToProject({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
      })
      setMvpState(snapshot.state)
      setActiveProjectId(snapshot.projectId)
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'AI defaults are unavailable right now.')
    } finally {
      setIsApplyingVibeDefaults(false)
    }
  }

  function handleSuggestionPress(suggestion: Suggestion) {
    setSelectedSuggestion(suggestion)
    setFollowUpDraft('')
    setFollowUpNote('')
  }

  async function handleFollowUpSend() {
    const message = followUpDraft.trim()
    if (!message || isSendingFollowUp) {
      return
    }

    if (!activeProjectId) {
      setFollowUpNote('Submit a project prompt in Chat before discussing a suggestion.')
      return
    }

    setIsSendingFollowUp(true)
    setFollowUpNote('Sending follow-up to the backend...')

    try {
      const snapshot = await sendProjectChatMessage({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
        message,
        context: {
          source: selectedSuggestion ? 'suggestion' : 'main',
          suggestionId: selectedSuggestion?.id,
          suggestionTitle: selectedSuggestion?.title,
        },
      })
      setMvpState((currentState) => mergeBackendProjectState(snapshot.state, currentState))
      setActiveProjectId(snapshot.projectId)
      setFollowUpDraft('')
      setFollowUpNote('Backend reply added to the project chat.')
    } catch {
      setFollowUpNote('Backend clarification is unavailable right now. Try again when the backend is reachable.')
    } finally {
      setIsSendingFollowUp(false)
    }
  }

  function updateAppSetting(key: keyof AppSettings, value: string) {
    setAppSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value,
    }))
  }

  function handleReviewDesignDoc() {
    setActiveTab('workspace')
  }

  function handleApproveDesignDoc() {
    setGenerationError(null)
    setMvpState((currentState) => approveDesignDoc(currentState, new Date().toISOString()))
  }

  function handleApproveVerificationProperties() {
    setGenerationError(null)
    setMvpState((currentState) => approveVerificationProperties(currentState, new Date().toISOString()))
  }

  async function handleGenerationSubmit() {
    if (generationSubmitLock.current || isSubmittingGeneration) {
      return
    }

    const request = buildGenerationRequest(mvpState)
    if (!request) {
      setGenerationError('Create or restore an MVP Design Doc before generation can start.')
      return
    }
    const generationBlocker = getGenerationBlocker(mvpState)
    if (generationBlocker) {
      setGenerationError(generationBlocker)
      return
    }

    setGenerationError(null)
    generationSubmitLock.current = true
    setIsSubmittingGeneration(true)

    try {
      const job = await submitGenerationJob({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
        request,
      })

      setMvpState((currentState) => saveGenerationJob(currentState, job))
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Generation request failed. Try again.')
    } finally {
      generationSubmitLock.current = false
      setIsSubmittingGeneration(false)
    }
  }

  async function handleGenerationRefresh() {
    if (!mvpState.generationJob || isRefreshingGenerationStatus) {
      return
    }

    setGenerationError(null)
    setIsRefreshingGenerationStatus(true)

    try {
      const job = await readGenerationJobStatus({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        job: mvpState.generationJob,
      })

      setMvpState((currentState) => saveGenerationJob(currentState, job))
    } finally {
      setIsRefreshingGenerationStatus(false)
    }
  }

  function showPreviousSuggestions() {
    setSuggestionPage((currentPage) => (currentPage <= 0 ? suggestionPageCount - 1 : currentPage - 1))
  }

  function showNextSuggestions() {
    setSuggestionPage((currentPage) => (currentPage + 1 >= suggestionPageCount ? 0 : currentPage + 1))
  }

  return (
    <View className="flex-1 bg-[#201626]">
      <StatusBar style="light" />
      <View className="flex-1 px-4 pb-2 pt-7">
        <View className="flex-1 rounded-3xl border border-[#fff4cf]/10 bg-[#2a1720] p-4">
          <Header
            accountAddress={accountAddress}
            activeTab={activeTab}
            onWalletPress={handleWalletPress}
            walletConnected={Boolean(account)}
          />

          <ScrollView
            key={screenKey}
            className="mt-4 min-h-0 flex-1"
            contentContainerStyle={{ flexGrow: 1, gap: 14, paddingBottom: activeTab === 'chat' ? 0 : 4 }}
            showsVerticalScrollIndicator={false}
          >
            {walletError ? (
              <Text
                numberOfLines={2}
                className="rounded-lg border border-[#ff8a5c]/30 bg-[#ff8a5c]/10 px-3 py-2 text-xs font-semibold leading-4 text-[#ffd2bd]"
              >
                {walletError}
              </Text>
            ) : null}

            {activeTab === 'chat' ? (
              <ChatView
                draft={draft}
                followUpDraft={followUpDraft}
                followUpNote={followUpNote}
                hasDesignDoc={Boolean(mvpState.designDoc)}
                isSendingFollowUp={isSendingFollowUp}
                messages={mvpState.messages}
                selectedSuggestion={selectedSuggestion}
                suggestionCount={mvpState.suggestions.length}
                suggestionPage={normalizedSuggestionPage}
                visibleSuggestions={visibleSuggestions}
                onBackFromSuggestion={() => setSelectedSuggestion(null)}
                onChangeDraft={setDraft}
                onChangeFollowUpDraft={setFollowUpDraft}
                onFollowUpSend={handleFollowUpSend}
                onNextSuggestions={showNextSuggestions}
                onPreviousSuggestions={showPreviousSuggestions}
                onReviewDesignDoc={handleReviewDesignDoc}
                onSendMessage={handleSendMessage}
                onSuggestionPress={handleSuggestionPress}
              />
            ) : null}

            {activeTab === 'workspace' ? (
              <WorkspaceView
                accountAddress={accountAddress}
                appSettings={appSettings}
                designDoc={mvpState.designDoc}
                designDocApprovedAt={mvpState.designDocApprovedAt}
                latestPromptSeed={mvpState.latestPromptSeed}
                mode={displayMode}
                verificationProperties={mvpState.verificationProperties}
                verificationPropertiesApprovedAt={mvpState.verificationPropertiesApprovedAt}
                workflowMode={mvpState.workflowMode}
                walletConnected={Boolean(account)}
                generationError={generationError}
                generationJob={mvpState.generationJob}
                isApplyingVibeDefaults={isApplyingVibeDefaults}
                isRefreshingGenerationStatus={isRefreshingGenerationStatus}
                isSubmittingGeneration={isSubmittingGeneration}
                onAppSettingChange={updateAppSetting}
                onApproveDesignDoc={handleApproveDesignDoc}
                onApproveVerificationProperties={handleApproveVerificationProperties}
                onDesignDocFieldChange={(field, value) =>
                  setMvpState((currentState) => updateDesignDocField(currentState, field, value))
                }
                onDesignDocListFieldChange={(field, value) =>
                  setMvpState((currentState) => updateDesignDocListField(currentState, field, value))
                }
                onGenerationSubmit={handleGenerationSubmit}
                onGenerationRefresh={handleGenerationRefresh}
                onApplyVibeDefaults={handleApplyVibeDefaults}
                onModeChange={handleModeChange}
                onWalletPress={handleWalletPress}
              />
            ) : null}

            {activeTab === 'explore' ? (
              <ExploreView exploreTab={exploreTab} onExploreTabChange={setExploreTab} />
            ) : null}
          </ScrollView>

          <View className={activeTab === 'chat' ? 'mt-0' : 'mt-4'}>
            <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
          </View>
        </View>
      </View>
    </View>
  )
}

function Header({
  accountAddress,
  activeTab,
  onWalletPress,
  walletConnected,
}: {
  accountAddress?: string
  activeTab: PrimaryTab
  onWalletPress: () => void
  walletConnected: boolean
}) {
  const activeTitle = activeTab === 'chat' ? 'Chat' : activeTab === 'workspace' ? 'Workspace' : 'Explore'
  const walletLabel =
    walletConnected && accountAddress
      ? `${accountAddress.slice(0, 4)}...${accountAddress.slice(-4)}`
      : walletConnected
        ? 'Connected'
        : 'Connect'

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-[#ffd978]">Spec-Driven</Text>
          <Text className="text-3xl font-black text-[#fff4cf]">{activeTitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onWalletPress}
          className="rounded-full border border-[#ffd978]/25 bg-[#ffd978]/15 px-4 py-3 active:bg-[#ffd978]/25"
        >
          <Text
            selectable={walletConnected}
            numberOfLines={1}
            className="max-w-32 text-center text-xs font-black text-[#fff4cf]"
          >
            {walletLabel}
          </Text>
        </Pressable>
      </View>
      <View className="h-px bg-[#fff4cf]/10" />
    </View>
  )
}

function ChatView({
  draft,
  followUpDraft,
  followUpNote,
  hasDesignDoc,
  isSendingFollowUp,
  messages,
  selectedSuggestion,
  suggestionCount,
  suggestionPage,
  visibleSuggestions,
  onBackFromSuggestion,
  onChangeDraft,
  onChangeFollowUpDraft,
  onFollowUpSend,
  onNextSuggestions,
  onPreviousSuggestions,
  onReviewDesignDoc,
  onSendMessage,
  onSuggestionPress,
}: {
  draft: string
  followUpDraft: string
  followUpNote: string
  hasDesignDoc: boolean
  isSendingFollowUp: boolean
  messages: ChatMessage[]
  selectedSuggestion: Suggestion | null
  suggestionCount: number
  suggestionPage: number
  visibleSuggestions: Suggestion[]
  onBackFromSuggestion: () => void
  onChangeDraft: (value: string) => void
  onChangeFollowUpDraft: (value: string) => void
  onFollowUpSend: () => void
  onNextSuggestions: () => void
  onPreviousSuggestions: () => void
  onReviewDesignDoc: () => void
  onSendMessage: () => void
  onSuggestionPress: (suggestion: Suggestion) => void
}) {
  if (selectedSuggestion) {
    return (
      <SuggestionFollowUpView
        draft={followUpDraft}
        note={followUpNote}
        isSending={isSendingFollowUp}
        suggestion={selectedSuggestion}
        onBack={onBackFromSuggestion}
        onChangeDraft={onChangeFollowUpDraft}
        onSend={onFollowUpSend}
      />
    )
  }

  const hasUserPrompt = messages.some((message) => message.side === 'user')

  return (
    <View className="flex-1 justify-between gap-3">
      <View className="gap-3">
        <View className="gap-2">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </View>

        {hasDesignDoc ? (
          <View className="gap-3 rounded-lg border border-[#9db4ff]/25 bg-[#9db4ff]/10 p-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">Workspace review</Text>
                <Text className="mt-1 text-base font-black text-[#eef2ff]">Design Doc is ready</Text>
                <Text className="mt-1 text-sm leading-5 text-[#eef2ff]/70">
                  Review and approve it in Workspace before properties are proposed.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={onReviewDesignDoc}
                className="rounded-full bg-[#ffd978] px-4 py-2 active:bg-[#ffe6a3]"
              >
                <Text className="text-xs font-black text-[#201626]">Review</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {hasUserPrompt && suggestionCount > 0 ? (
          <View className="gap-2">
            <View className="flex-row items-center justify-between gap-3">
              <Text numberOfLines={1} className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-[#ffd978]">
                Suggestions
              </Text>
              <Text className="text-xs font-bold text-[#fff4cf]/55">
                {suggestionPage * 2 + 1}-{Math.min(suggestionPage * 2 + visibleSuggestions.length, suggestionCount)} of {suggestionCount}
              </Text>
            </View>
            <View className="flex-row items-stretch gap-2">
              <RailArrow label="<" onPress={onPreviousSuggestions} />
              <View className="flex-1 flex-row gap-2">
                {visibleSuggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.id}
                    accessibilityRole="button"
                    onPress={() => onSuggestionPress(suggestion)}
                    className="min-h-32 flex-1 gap-2 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3 active:border-[#ffd978]/40 active:bg-[#372647]"
                  >
                    <Text className="text-[10px] font-black uppercase tracking-widest text-[#fff4cf]/50">
                      {suggestion.label}
                    </Text>
                    <Text className="text-base font-black leading-5 text-[#fff4cf]">{suggestion.title}</Text>
                    <Text className="text-xs leading-5 text-[#fff4cf]/65">{suggestion.body}</Text>
                  </Pressable>
                ))}
              </View>
              <RailArrow label=">" onPress={onNextSuggestions} />
            </View>
          </View>
        ) : null}
      </View>

      <Composer
        draft={draft}
        placeholder="Describe the app or program you want..."
        onChangeDraft={onChangeDraft}
        onSend={onSendMessage}
      />
    </View>
  )
}

function SuggestionFollowUpView({
  draft,
  isSending,
  note,
  suggestion,
  onBack,
  onChangeDraft,
  onSend,
}: {
  draft: string
  isSending: boolean
  note: string
  suggestion: Suggestion
  onBack: () => void
  onChangeDraft: (value: string) => void
  onSend: () => void
}) {
  return (
    <View className="flex-1 justify-between gap-4">
      <View className="gap-4">
        <View className="flex-row items-center justify-between gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            className="rounded-full border border-[#fff4cf]/15 bg-[#fff4cf]/10 px-4 py-2 active:bg-[#fff4cf]/15"
          >
            <Text className="text-sm font-black text-[#fff4cf]">Back</Text>
          </Pressable>
          <Text className="text-right text-xs font-bold uppercase tracking-widest text-[#ffd978]">Follow-up view</Text>
        </View>

        <View className="gap-4 rounded-lg border border-[#ffd978]/30 bg-[#2d1e37] p-4">
          <View className="gap-2">
            <Text className="text-xs font-black uppercase tracking-widest text-[#fff4cf]/50">{suggestion.label}</Text>
            <Text className="text-2xl font-black leading-7 text-[#fff4cf]">{suggestion.title}</Text>
            <Text className="text-sm leading-6 text-[#fff4cf]/70">{suggestion.detail}</Text>
          </View>
          <View className="rounded-lg border border-[#75e6be]/25 bg-[#75e6be]/10 p-3">
            <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Expected impact</Text>
            <Text className="mt-1 text-sm font-bold text-[#dffdf4]">{suggestion.impact}</Text>
          </View>
        </View>

        {note ? (
          <Text selectable className="rounded-lg border border-[#75e6be]/25 bg-[#75e6be]/10 p-3 text-sm text-[#dffdf4]">
            {note}
          </Text>
        ) : null}
      </View>

      <Composer
        draft={draft}
        isSending={isSending}
        placeholder="Discuss only this suggestion..."
        onChangeDraft={onChangeDraft}
        onSend={onSend}
      />
    </View>
  )
}

function ModeSwitch({ mode, onModeChange }: { mode: DisplayWorkflowMode; onModeChange: (value: DisplayWorkflowMode) => void }) {
  return (
    <View className="flex-row rounded-full border border-[#fff4cf]/10 bg-[#fff4cf]/10 p-1">
      {(['Vibe', 'Pro'] as DisplayWorkflowMode[]).map((option) => {
        const active = option === mode

        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            onPress={() => onModeChange(option)}
            className={`flex-1 rounded-full px-4 py-1.5 ${active ? 'bg-[#ffd978]' : 'bg-transparent'}`}
          >
            <Text className={`text-center text-sm font-black ${active ? 'text-[#201626]' : 'text-[#fff4cf]/65'}`}>
              {option}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const fromUser = message.side === 'user'

  return (
    <View
      className={`max-w-[88%] rounded-lg p-2.5 ${fromUser ? 'self-end bg-[#ffd978]' : 'self-start bg-[#75e6be]/15'}`}
    >
      <Text className={`text-sm font-semibold leading-6 ${fromUser ? 'text-[#201626]' : 'text-[#dffdf4]'}`}>
        {message.text}
      </Text>
    </View>
  )
}

function RailArrow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label === '<' ? 'Previous suggestions' : 'Next suggestions'}
      accessibilityRole="button"
      onPress={onPress}
      className="w-6 items-center justify-center rounded-full bg-[#fff4cf]/5 active:bg-[#fff4cf]/10"
    >
      <Text className="text-sm font-black text-[#fff4cf]">{label}</Text>
    </Pressable>
  )
}

function Composer({
  draft,
  isSending = false,
  placeholder,
  onChangeDraft,
  onSend,
}: {
  draft: string
  isSending?: boolean
  placeholder: string
  onChangeDraft: (value: string) => void
  onSend: () => void
}) {
  const canSend = Boolean(draft.trim()) && !isSending

  return (
    <View className="flex-row items-end gap-2 rounded-[24px] border border-[#fff4cf]/15 bg-[#fff4cf]/10 p-1.5">
      <Pressable
        accessibilityLabel="Voice input"
        accessibilityRole="button"
        className="h-9 w-9 items-center justify-center rounded-full bg-[#75e6be]/15 active:bg-[#75e6be]/25"
      >
        <MicIcon />
      </Pressable>
      <TextInput
        className="min-h-9 min-w-0 flex-1 px-1 py-2 text-sm font-semibold leading-5 text-[#fff4cf]"
        blurOnSubmit={false}
        editable={!isSending}
        multiline
        onChangeText={onChangeDraft}
        onSubmitEditing={onSend}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,244,207,0.45)"
        returnKeyType="send"
        style={{ maxHeight: 112, textAlignVertical: 'top' }}
        submitBehavior="submit"
        value={draft}
      />
      <Pressable
        accessibilityLabel="Send message"
        accessibilityRole="button"
        disabled={!canSend}
        onPress={onSend}
        className={`h-9 w-9 items-center justify-center rounded-full ${canSend ? 'bg-[#ffd978] active:bg-[#ffe6a3]' : 'bg-[#fff4cf]/20'}`}
      >
        <SendArrowIcon />
      </Pressable>
    </View>
  )
}

function SendArrowIcon() {
  return (
    <View className="h-5 w-5 items-center justify-center">
      <View className="h-0.5 w-4 rounded-full bg-[#201626]" />
      <View className="absolute right-0 h-2.5 w-2.5 rotate-45 border-r-2 border-t-2 border-[#201626]" />
    </View>
  )
}

function MicIcon() {
  return (
    <View className="items-center justify-center">
      <View className="h-4 w-2.5 rounded-full border border-[#adf7e6]" />
      <View className="-mt-0.5 h-2 w-4 rounded-b-full border-b border-l border-r border-[#adf7e6]" />
      <View className="h-1.5 w-px bg-[#adf7e6]" />
      <View className="h-px w-3 bg-[#adf7e6]" />
    </View>
  )
}

function WorkspaceView({
  accountAddress,
  appSettings,
  designDoc,
  designDocApprovedAt,
  generationError,
  generationJob,
  isRefreshingGenerationStatus,
  isSubmittingGeneration,
  isApplyingVibeDefaults,
  latestPromptSeed,
  mode,
  verificationProperties,
  verificationPropertiesApprovedAt,
  workflowMode,
  onAppSettingChange,
  onApplyVibeDefaults,
  onApproveDesignDoc,
  onApproveVerificationProperties,
  onDesignDocFieldChange,
  onDesignDocListFieldChange,
  onGenerationRefresh,
  onGenerationSubmit,
  onModeChange,
  onWalletPress,
  walletConnected,
}: {
  accountAddress?: string
  appSettings: AppSettings
  designDoc: MvpDesignDoc | null
  designDocApprovedAt: string | null
  generationError: string | null
  generationJob: GenerationJobRecord | null
  isApplyingVibeDefaults: boolean
  isRefreshingGenerationStatus: boolean
  isSubmittingGeneration: boolean
  latestPromptSeed: MvpProjectSeed | null
  mode: DisplayWorkflowMode
  verificationProperties: VerificationProperty[]
  verificationPropertiesApprovedAt: string | null
  workflowMode: WorkflowMode
  onAppSettingChange: (key: keyof AppSettings, value: string) => void
  onApplyVibeDefaults: () => void
  onApproveDesignDoc: () => void
  onApproveVerificationProperties: () => void
  onDesignDocFieldChange: (field: 'title' | 'goal', value: string) => void
  onDesignDocListFieldChange: (
    field: 'coreRequirements' | 'assumptions' | 'missingInformation',
    value: string
  ) => void
  onGenerationRefresh: () => void
  onGenerationSubmit: () => void
  onModeChange: (value: DisplayWorkflowMode) => void
  onWalletPress: () => void
  walletConnected: boolean
}) {
  return (
    <View className="gap-4">
      <View className="gap-3 rounded-lg border border-[#75e6be]/20 bg-[#75e6be]/10 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Project request</Text>
            <Text className="mt-1 text-xl font-black leading-6 text-[#dffdf4]">
              {latestPromptSeed ? 'Ready for Design Doc review' : 'Waiting for your first request'}
            </Text>
          </View>
          <View className="rounded-full bg-[#75e6be]/15 px-3 py-2">
            <Text className="text-xs font-black text-[#dffdf4]">{latestPromptSeed ? 'Captured' : 'Empty'}</Text>
          </View>
        </View>
        <Text className="text-sm leading-6 text-[#dffdf4]/80">
          {latestPromptSeed
            ? latestPromptSeed.prompt
            : 'Describe what you want to build in Chat. Workspace will show the Design Doc once the backend drafts it.'}
        </Text>
      </View>

      <DesignDocCard
        approvedAt={designDocApprovedAt}
        designDoc={designDoc}
        generationError={generationError}
        generationJob={generationJob}
        isApplyingVibeDefaults={isApplyingVibeDefaults}
        isRefreshingGenerationStatus={isRefreshingGenerationStatus}
        isSubmittingGeneration={isSubmittingGeneration}
        propertiesApprovedAt={verificationPropertiesApprovedAt}
        workflowMode={workflowMode}
        onApplyVibeDefaults={onApplyVibeDefaults}
        onApprove={onApproveDesignDoc}
        onFieldChange={onDesignDocFieldChange}
        onRefresh={onGenerationRefresh}
        onGenerate={onGenerationSubmit}
        onListFieldChange={onDesignDocListFieldChange}
      />

      <PropertiesToProveCard
        designDocApprovedAt={designDocApprovedAt}
        properties={verificationProperties}
        propertiesApprovedAt={verificationPropertiesApprovedAt}
        onApprove={onApproveVerificationProperties}
      />

      <View className="gap-4 rounded-lg border border-[#ffd978]/25 bg-[#23182c] p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xs font-black uppercase tracking-widest text-[#ffd978]">Suggested next action</Text>
            <Text className="text-2xl font-black leading-7 text-[#fff4cf]">Choose pause authority</Text>
            <Text className="text-sm leading-6 text-[#fff4cf]/70">
              Highest-value project action across the workspace. Resolving this unlocks generation for Escrow Lens.
            </Text>
          </View>
          <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
            <Text className="text-xs font-black text-[#ffe6a3]">Top</Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          <MiniDecisionCard label="Option A" title="Buyer pauses" body="Fast unblock" />
          <MiniDecisionCard label="Option B" title="Mutual pause" body="Safer default" />
        </View>

        <StageRow activeStage="Props" />
      </View>

      <View className="gap-3">
        <SectionTitle title="Your projects" badge="3 active" />
        {projects.map((project) => (
          <View key={project.name} className="gap-3 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-lg font-black text-[#fff4cf]">{project.name}</Text>
                <Text className="text-sm leading-5 text-[#fff4cf]/65">{project.summary}</Text>
                <Text className="mt-1 text-xs leading-5 text-[#fff4cf]/50">{project.assurance}</Text>
              </View>
              <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
                <Text className="text-xs font-black text-[#ffe6a3]">{project.badge}</Text>
              </View>
            </View>
            <StageRow activeStage={project.stage} compact />
          </View>
        ))}
      </View>

      <View className="gap-3">
        <SectionTitle title="Settings and integrations" badge={walletConnected ? 'Wallet on' : 'Wallet off'} />
        <View className="gap-3 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3">
          <View>
            <Text className="text-base font-black text-[#fff4cf]">Assistant mode</Text>
            <Text className="mt-1 text-sm leading-5 text-[#fff4cf]/65">
              Vibe keeps the conversation loose. Pro asks for sharper rules and property-ready details.
            </Text>
          </View>
          <ModeSwitch mode={mode} onModeChange={onModeChange} />
        </View>
        <SettingRow
          actionLabel={walletConnected ? 'Disconnect' : 'Connect'}
          body={
            walletConnected && accountAddress
              ? `Connected on Solana devnet: ${accountAddress.slice(0, 8)}...${accountAddress.slice(-6)}`
              : 'Uses the existing Solana Mobile wallet adapter from the template.'
          }
          title="Solana wallet"
          value={walletConnected ? 'Ready' : 'Needed later'}
          onAction={onWalletPress}
        />
        <Text className="rounded-lg border border-[#fff4cf]/10 bg-[#fff4cf]/5 px-3 py-2 text-xs leading-5 text-[#fff4cf]/55">
          Integration values entered here are held in local app state only. Backend credential storage and account
          linking are not connected in this template yet.
        </Text>
        <EditableSettingRow
          body="Used to associate generated app builds with the right Expo identity once backend linking exists."
          onChangeText={(value) => onAppSettingChange('expoAccount', value)}
          placeholder="expo username or email"
          title="Expo account"
          value={appSettings.expoAccount}
          status={appSettings.expoAccount.trim() ? 'Entered' : 'Not linked'}
        />
        <EditableSettingRow
          body="Required for backend-triggered non-interactive EAS CLI jobs. Paste an EXPO_TOKEN or mark the EAS auth state."
          onChangeText={(value) => onAppSettingChange('easAuth', value)}
          placeholder="EXPO_TOKEN or EAS auth note"
          secureTextEntry
          title="EXPO_TOKEN / EAS auth"
          value={appSettings.easAuth}
          status={appSettings.easAuth.trim() ? 'Saved locally' : 'Missing'}
        />
        <EditableSettingRow
          body="Needed before deeper verification jobs can be queued from Spec-Driven."
          onChangeText={(value) => onAppSettingChange('certoraApiKey', value)}
          placeholder="Certora API key"
          secureTextEntry
          title="Certora API key"
          value={appSettings.certoraApiKey}
          status={appSettings.certoraApiKey.trim() ? 'Saved locally' : 'Missing'}
        />
      </View>
    </View>
  )
}

function formatSavedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function getGenerationStatusBadgeClass(status: string) {
  switch (getGenerationStatusLabel(status)) {
    case 'Queued':
      return 'bg-[#9db4ff]/18'
    case 'Running':
      return 'bg-[#ffd978]/18'
    case 'Succeeded':
      return 'bg-[#75e6be]/15'
    case 'Failed':
      return 'bg-[#ff8a5c]/18'
    case 'Unavailable':
    default:
      return 'bg-[#7a8197]/25'
  }
}

function isActiveGenerationJob(status: string) {
  return status === 'queued' || status === 'running'
}

function formatShortIdentifier(value: string | null | undefined) {
  if (!value) {
    return null
  }
  if (value.length <= 30) {
    return value
  }
  return `${value.slice(0, 14)}...${value.slice(-10)}`
}

function DesignDocCard({
  approvedAt,
  designDoc,
  generationError,
  generationJob,
  isApplyingVibeDefaults,
  isRefreshingGenerationStatus,
  isSubmittingGeneration,
  propertiesApprovedAt,
  workflowMode,
  onApplyVibeDefaults,
  onApprove,
  onFieldChange,
  onRefresh,
  onGenerate,
  onListFieldChange,
}: {
  approvedAt: string | null
  designDoc: MvpDesignDoc | null
  generationError: string | null
  generationJob: GenerationJobRecord | null
  isApplyingVibeDefaults: boolean
  isRefreshingGenerationStatus: boolean
  isSubmittingGeneration: boolean
  propertiesApprovedAt: string | null
  workflowMode: WorkflowMode
  onApplyVibeDefaults: () => void
  onApprove: () => void
  onFieldChange: (field: 'title' | 'goal', value: string) => void
  onRefresh: () => void
  onGenerate: () => void
  onListFieldChange: (field: 'coreRequirements' | 'assumptions' | 'missingInformation', value: string) => void
}) {
  const missingInformationCount = designDoc?.missingInformation.length ?? 0
  const hasMissingInformation = missingInformationCount > 0
  const generationBlocked = isSubmittingGeneration || hasMissingInformation || !approvedAt || !propertiesApprovedAt
  const modeLabel = toDisplayWorkflowMode(workflowMode)
  const generationButtonLabel = isSubmittingGeneration
    ? 'Submitting to backend...'
    : hasMissingInformation
      ? 'Resolve gate before generation'
      : !approvedAt
        ? 'Approve Design Doc first'
        : !propertiesApprovedAt
          ? 'Approve properties first'
          : 'Generate MVP'

  if (!designDoc) {
    return (
      <View className="gap-2 rounded-lg border border-[#9db4ff]/20 bg-[#9db4ff]/10 p-4">
        <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">MVP Design Doc</Text>
        <Text className="text-lg font-black text-[#eef2ff]">Not generated yet</Text>
        <Text className="text-sm leading-6 text-[#eef2ff]/75">
          Submit a prompt in Chat to provision one editable MVP Design Doc for review before generation.
        </Text>
      </View>
    )
  }

  return (
    <View className="gap-4 rounded-lg border border-[#9db4ff]/25 bg-[#1f2338] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">MVP Design Doc</Text>
          <Text className="text-2xl font-black leading-7 text-[#eef2ff]">Editable review surface</Text>
          <Text className="text-sm leading-6 text-[#eef2ff]/70">
            Review and approve this single MVP artifact before properties are proposed.
          </Text>
        </View>
        <View className={`rounded-full px-3 py-2 ${approvedAt ? 'bg-[#75e6be]/15' : 'bg-[#9db4ff]/15'}`}>
          <Text className={`text-xs font-black ${approvedAt ? 'text-[#dffdf4]' : 'text-[#eef2ff]'}`}>
            {approvedAt ? 'Approved' : '1 doc'}
          </Text>
        </View>
      </View>

      <EditableDocField
        label="Title"
        value={designDoc.title}
        onChangeText={(value) => onFieldChange('title', value)}
      />
      <EditableDocField
        label="Goal"
        multiline
        value={designDoc.goal}
        onChangeText={(value) => onFieldChange('goal', value)}
      />
      <EditableDocField
        label="Core requirements"
        multiline
        value={designDoc.coreRequirements.join('\n')}
        onChangeText={(value) => onListFieldChange('coreRequirements', value)}
      />
      <EditableDocField
        label="Assumptions"
        multiline
        value={designDoc.assumptions.join('\n')}
        onChangeText={(value) => onListFieldChange('assumptions', value)}
      />
      <EditableDocField
        label="Missing information"
        multiline
        value={designDoc.missingInformation.join('\n')}
        onChangeText={(value) => onListFieldChange('missingInformation', value)}
      />

      {hasMissingInformation ? (
        <View className="gap-3 rounded-2xl border border-[#ff8a5c]/30 bg-[#ff8a5c]/10 p-3">
          <Text className="text-xs font-black uppercase tracking-widest text-[#ffd2bd]">Generation gate</Text>
          <Text className="text-sm leading-5 text-[#ffd2bd]/85">
            {modeLabel === 'Vibe'
              ? 'Vibe can ask the backend to turn missing details into visible assumptions before generation.'
              : 'Pro requires these missing details to be answered or edited away before generation.'}
          </Text>
          {modeLabel === 'Vibe' ? (
            <Pressable
              accessibilityLabel="Use AI defaults"
              accessibilityRole="button"
              disabled={isApplyingVibeDefaults}
              onPress={onApplyVibeDefaults}
              className={`items-center rounded-full px-4 py-2 ${isApplyingVibeDefaults ? 'bg-[#ffd978]/25' : 'bg-[#ffd978] active:bg-[#ffe6a3]'}`}
            >
              <Text className="text-xs font-black text-[#201626]">
                {isApplyingVibeDefaults ? 'Applying defaults...' : 'Use AI defaults'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="gap-3 rounded-2xl border border-[#75e6be]/20 bg-[#75e6be]/10 p-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Approval</Text>
            <Text className="text-sm leading-5 text-[#dffdf4]/80">
              {approvedAt
                ? `Approved ${formatSavedAt(approvedAt)}. Editing the Design Doc will reset this approval.`
                : 'Approve this Design Doc to propose properties and invariants before CVLR generation.'}
            </Text>
          </View>
          {approvedAt ? (
            <View className="rounded-full bg-[#75e6be]/15 px-3 py-2">
              <Text className="text-xs font-black text-[#dffdf4]">Locked</Text>
            </View>
          ) : null}
        </View>
        {!approvedAt ? (
          <Pressable
            accessibilityLabel="Approve Design Doc"
            accessibilityRole="button"
            onPress={onApprove}
            className="items-center rounded-full bg-[#75e6be] px-4 py-2 active:bg-[#9af2d7]"
          >
            <Text className="text-xs font-black text-[#0d3b35]">Approve Design Doc</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="gap-3 rounded-2xl border border-[#eef2ff]/12 bg-[#eef2ff]/6 p-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">Generation submission</Text>
            <Text className="text-sm leading-5 text-[#eef2ff]/70">
              Submit this MVP Design Doc to the local backend at `10.0.2.2:8000` as one AI Composer generation job.
            </Text>
          </View>
          <View className={`rounded-full px-3 py-2 ${getGenerationStatusBadgeClass(generationJob?.status ?? 'ready')}`}>
            <Text className="text-xs font-black text-[#dffdf4]">
              {generationJob ? getGenerationStatusLabel(generationJob.status) : 'Ready'}
            </Text>
          </View>
        </View>

        {generationJob ? (
          <View className="gap-3 rounded-xl border border-[#75e6be]/20 bg-[#75e6be]/10 p-3">
            <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Latest job</Text>
            <Text className="text-sm font-semibold text-[#dffdf4]">{generationJob.summary}</Text>
            <Text selectable className="text-xs leading-5 text-[#dffdf4]/70">
              Job id: {generationJob.jobId}
            </Text>
            <Text className="text-xs leading-5 text-[#dffdf4]/70">
              Status: {getGenerationStatusLabel(generationJob.status)}
            </Text>
            {generationJob.currentPhase ? (
              <Text className="text-xs leading-5 text-[#dffdf4]/70">Phase: {generationJob.currentPhase}</Text>
            ) : null}
            {generationJob.progressSummary ? (
              <Text className="text-xs leading-5 text-[#dffdf4]/70">Progress: {generationJob.progressSummary}</Text>
            ) : null}
            <Text className="text-xs leading-5 text-[#dffdf4]/70">Updated: {formatSavedAt(generationJob.updatedAt)}</Text>
            {generationJob.lastHeartbeatAt ? (
              <Text className="text-xs leading-5 text-[#dffdf4]/70">
                Worker heartbeat: {formatSavedAt(generationJob.lastHeartbeatAt)}
              </Text>
            ) : null}
            {generationJob.aiComposerThreadId ? (
              <Text className="text-xs leading-5 text-[#dffdf4]/70">
                AI Composer thread: {formatShortIdentifier(generationJob.aiComposerThreadId)}
              </Text>
            ) : null}
            {generationJob.lastCheckpointId ? (
              <Text className="text-xs leading-5 text-[#dffdf4]/70">
                Latest checkpoint: {formatShortIdentifier(generationJob.lastCheckpointId)}
              </Text>
            ) : null}
            {generationJob.lastMaterializedSnapshotAt ? (
              <Text className="text-xs leading-5 text-[#dffdf4]/70">
                Last safe snapshot: {formatSavedAt(generationJob.lastMaterializedSnapshotAt)}
              </Text>
            ) : null}
            {generationJob.latestLogExcerpt ? (
              <Text className="rounded-xl border border-[#eef2ff]/12 bg-[#eef2ff]/6 px-3 py-2 text-xs leading-5 text-[#dffdf4]/72">
                Latest status: {generationJob.latestLogExcerpt}
              </Text>
            ) : null}
            {hasRenderableGenerationResult(generationJob) ? (
              <GeneratedResultSummary
                artifacts={generationJob.artifacts}
                modelLabel={generationJob.modelLabel ?? null}
                providerLabel={generationJob.providerLabel ?? null}
                summary={generationJob.summary}
              />
            ) : null}
            {getGenerationResultIssue(generationJob) ? (
              <Text className="rounded-xl border border-[#ff8a5c]/30 bg-[#ff8a5c]/10 px-3 py-2 text-sm leading-5 text-[#ffd2bd]">
                {getGenerationResultIssue(generationJob)}
              </Text>
            ) : null}
            <Pressable
              accessibilityLabel="Refresh generation status"
              accessibilityRole="button"
              disabled={isRefreshingGenerationStatus}
              onPress={onRefresh}
              className={`items-center rounded-full px-4 py-2 ${isRefreshingGenerationStatus ? 'bg-[#75e6be]/15' : 'bg-[#75e6be]/25 active:bg-[#75e6be]/35'}`}
            >
              <Text className="text-xs font-black text-[#dffdf4]">
                {isRefreshingGenerationStatus ? 'Refreshing status...' : 'Refresh status'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {generationError ? (
          <Text className="rounded-xl border border-[#ff8a5c]/30 bg-[#ff8a5c]/10 px-3 py-2 text-sm leading-5 text-[#ffd2bd]">
            {generationError}
          </Text>
        ) : null}

        <Pressable
          accessibilityLabel="Generate MVP"
          accessibilityRole="button"
          disabled={generationBlocked}
          onPress={onGenerate}
          className={`items-center rounded-full px-4 py-3 ${generationBlocked ? 'bg-[#ffd978]/35' : 'bg-[#ffd978] active:bg-[#ffe6a3]'}`}
        >
          <Text className="text-sm font-black text-[#201626]">{generationButtonLabel}</Text>
        </Pressable>
      </View>

      <Text className="text-xs leading-5 text-[#eef2ff]/55">Last updated: {formatSavedAt(designDoc.updatedAt)}</Text>
    </View>
  )
}

function PropertiesToProveCard({
  designDocApprovedAt,
  properties,
  propertiesApprovedAt,
  onApprove,
}: {
  designDocApprovedAt: string | null
  properties: VerificationProperty[]
  propertiesApprovedAt: string | null
  onApprove: () => void
}) {
  if (!designDocApprovedAt) {
    return (
      <View className="gap-2 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-4">
        <Text className="text-xs font-black uppercase tracking-widest text-[#ffd978]">Properties to prove</Text>
        <Text className="text-lg font-black text-[#fff4cf]">Waiting on Design Doc approval</Text>
        <Text className="text-sm leading-6 text-[#fff4cf]/70">
          Approve the Design Doc above before the app proposes properties and invariants for CVLR generation.
        </Text>
      </View>
    )
  }

  const approved = Boolean(propertiesApprovedAt)

  return (
    <View className="gap-4 rounded-lg border border-[#ffd978]/25 bg-[#23182c] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-black uppercase tracking-widest text-[#ffd978]">Properties to prove</Text>
          <Text className="text-2xl font-black leading-7 text-[#fff4cf]">Review before CVLR generation</Text>
          <Text className="text-sm leading-6 text-[#fff4cf]/70">
            These proof targets come from the approved Design Doc and must be approved before generation starts.
          </Text>
        </View>
        <View className={`rounded-full px-3 py-2 ${approved ? 'bg-[#75e6be]/15' : 'bg-[#ffd978]/15'}`}>
          <Text className={`text-xs font-black ${approved ? 'text-[#dffdf4]' : 'text-[#ffe6a3]'}`}>
            {approved ? 'Approved' : `${properties.length} props`}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {properties.map((property) => (
          <View key={property.id} className="gap-2 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3">
            <Text className="text-[10px] font-black uppercase tracking-widest text-[#fff4cf]/50">
              {property.label}
            </Text>
            <Text className="text-sm font-black leading-5 text-[#fff4cf]">{property.statement}</Text>
            <Text className="text-xs leading-5 text-[#fff4cf]/65">{property.rationale}</Text>
          </View>
        ))}
      </View>

      {propertiesApprovedAt ? (
        <Text className="rounded-xl border border-[#75e6be]/20 bg-[#75e6be]/10 px-3 py-2 text-sm leading-5 text-[#dffdf4]">
          Approved {formatSavedAt(propertiesApprovedAt)}. Editing the Design Doc will reset these properties.
        </Text>
      ) : (
        <Pressable
          accessibilityLabel="Approve properties to prove"
          accessibilityRole="button"
          disabled={properties.length === 0}
          onPress={onApprove}
          className={`items-center rounded-full px-4 py-3 ${properties.length === 0 ? 'bg-[#ffd978]/35' : 'bg-[#ffd978] active:bg-[#ffe6a3]'}`}
        >
          <Text className="text-sm font-black text-[#201626]">
            {properties.length === 0 ? 'No properties proposed yet' : 'Approve properties to prove'}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

function GeneratedResultSummary({
  artifacts,
  modelLabel,
  providerLabel,
  summary,
}: {
  artifacts: GenerationArtifactRecord[]
  modelLabel: string | null
  providerLabel: string | null
  summary: string
}) {
  return (
    <View className="gap-3 rounded-xl border border-[#75e6be]/20 bg-[#75e6be]/10 p-3">
      <View className="gap-1">
        <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Generated result</Text>
        <Text className="text-sm font-semibold text-[#dffdf4]">{summary}</Text>
      </View>
      {providerLabel || modelLabel ? (
        <Text className="text-xs leading-5 text-[#dffdf4]/70">
          {providerLabel ? `Provider: ${providerLabel}` : 'Provider: n/a'}
          {modelLabel ? `  Model: ${modelLabel}` : ''}
        </Text>
      ) : null}
      <View className="gap-2">
        {artifacts.map((artifact) => (
          <View key={artifact.artifactId} className="gap-1 rounded-lg border border-[#dffdf4]/12 bg-[#dffdf4]/6 p-3">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="min-w-0 flex-1 text-sm font-black text-[#eef2ff]">{artifact.name}</Text>
              <Text className="text-[10px] font-black uppercase tracking-widest text-[#adf7e6]">{artifact.typeLabel}</Text>
            </View>
            <Text className="text-xs leading-5 text-[#dffdf4]/70">{artifact.summary}</Text>
            <Text selectable className="text-xs leading-5 text-[#dffdf4]/60">
              {artifact.path}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function EditableDocField({
  label,
  multiline = false,
  onChangeText,
  value,
}: {
  label: string
  multiline?: boolean
  onChangeText: (value: string) => void
  value: string
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="rgba(238,242,255,0.35)"
        style={{ minHeight: multiline ? 88 : 46, textAlignVertical: multiline ? 'top' : 'center' }}
        className="rounded-2xl border border-[#eef2ff]/12 bg-[#eef2ff]/8 px-4 py-3 text-sm font-semibold leading-6 text-[#eef2ff]"
        value={value}
      />
    </View>
  )
}

function MiniDecisionCard({ body, label, title }: { body: string; label: string; title: string }) {
  return (
    <View className="min-h-28 flex-1 gap-2 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3">
      <Text className="text-[10px] font-black uppercase tracking-widest text-[#fff4cf]/50">{label}</Text>
      <Text className="text-sm font-black leading-5 text-[#fff4cf]">{title}</Text>
      <Text className="text-xs text-[#fff4cf]/60">{body}</Text>
    </View>
  )
}

function StageRow({ activeStage, compact = false }: { activeStage: string; compact?: boolean }) {
  return (
    <View
      className={`flex-row flex-wrap gap-1 rounded-lg bg-[#fff4cf]/10 p-1 ${compact ? '' : 'border border-[#fff4cf]/10'}`}
    >
      {stages.map((stage) => {
        const active = stage === activeStage
        const done = stages.indexOf(stage) < stages.indexOf(activeStage)

        return (
          <View
            key={stage}
            className={`rounded-md px-2 py-1 ${active ? 'bg-[#ffd978]' : done ? 'bg-[#75e6be]' : 'bg-transparent'}`}
          >
            <Text
              className={`text-[10px] font-black ${active ? 'text-[#201626]' : done ? 'text-[#0d3b35]' : 'text-[#fff4cf]/45'}`}
            >
              {stage}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function SettingRow({
  actionLabel,
  body,
  onAction,
  title,
  value,
}: {
  actionLabel?: string
  body: string
  onAction?: () => void
  title: string
  value: string
}) {
  return (
    <View className="gap-3 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-black text-[#fff4cf]">{title}</Text>
          <Text
            selectable={title.includes('TOKEN') || title.includes('wallet')}
            className="mt-1 text-sm leading-5 text-[#fff4cf]/65"
          >
            {body}
          </Text>
        </View>
        <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
          <Text className="text-xs font-black text-[#ffe6a3]">{value}</Text>
        </View>
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          className="self-start rounded-full border border-[#ffd978]/25 bg-[#ffd978]/15 px-4 py-2 active:bg-[#ffd978]/25"
        >
          <Text className="text-sm font-black text-[#fff4cf]">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function EditableSettingRow({
  body,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  status,
  title,
  value,
}: {
  body: string
  onChangeText: (value: string) => void
  placeholder: string
  secureTextEntry?: boolean
  status: string
  title: string
  value: string
}) {
  return (
    <View className="gap-3 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-black text-[#fff4cf]">{title}</Text>
          <Text className="mt-1 text-sm leading-5 text-[#fff4cf]/65">{body}</Text>
        </View>
        <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
          <Text className="text-xs font-black text-[#ffe6a3]">{status}</Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2 rounded-xl border border-[#fff4cf]/15 bg-[#fff4cf]/10 px-3 py-2">
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          className="min-w-0 flex-1 text-sm font-semibold text-[#fff4cf]"
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,244,207,0.45)"
          secureTextEntry={secureTextEntry}
          value={value}
        />
        {value ? (
          <Pressable
            accessibilityLabel={`Clear ${title}`}
            accessibilityRole="button"
            onPress={() => onChangeText('')}
            className="rounded-full bg-[#fff4cf]/10 px-3 py-1.5 active:bg-[#fff4cf]/15"
          >
            <Text className="text-xs font-black text-[#fff4cf]/70">Clear</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function ExploreView({
  exploreTab,
  onExploreTabChange,
}: {
  exploreTab: ExploreTab
  onExploreTabChange: (tab: ExploreTab) => void
}) {
  const activeItems = exploreTab === 'projects' ? builderProjects : propertyGuides
  const featured =
    exploreTab === 'projects'
      ? {
          eyebrow: 'Featured project',
          title: 'Protocol Atlas',
          heading: 'Visible assurance ladder',
          body: 'Browse what was checked and what still needs review.',
          badge: 'Level 2 assurance',
        }
      : {
          eyebrow: 'Featured property guide',
          title: 'Money never disappears',
          heading: 'Invariants without the scare words',
          body: 'Turn a user promise into a checkable rule.',
          badge: 'Beginner friendly',
        }

  return (
    <View className="gap-4">
      <View className="gap-2">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-2xl font-black leading-7 text-[#fff4cf]">Other builders&apos; projects</Text>
            <Text className="mt-2 text-sm leading-5 text-[#fff4cf]/70">
              Learn from opt-in projects, properties, and assurance trails.
            </Text>
          </View>
          <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
            <Text className="text-xs font-black text-[#ffe6a3]">Opt-in</Text>
          </View>
        </View>
      </View>

      <View className="flex-row rounded-full border border-[#fff4cf]/10 bg-[#fff4cf]/10 p-1">
        <ExploreTabButton
          active={exploreTab === 'projects'}
          label="Projects"
          onPress={() => onExploreTabChange('projects')}
        />
        <ExploreTabButton
          active={exploreTab === 'properties'}
          label="Properties"
          onPress={() => onExploreTabChange('properties')}
        />
      </View>

      <View className="overflow-hidden rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37]">
        <View className="min-h-44 justify-end bg-[#5b3146] p-4">
          <Text className="text-xs font-black uppercase tracking-widest text-[#fff4cf]/55">{featured.eyebrow}</Text>
          <Text className="mt-2 text-3xl font-black leading-8 text-[#fff4cf]">{featured.title}</Text>
        </View>
        <View className="gap-2 p-4">
          <Text className="text-base font-black text-[#fff4cf]">{featured.heading}</Text>
          <Text className="text-sm leading-6 text-[#fff4cf]/65">{featured.body}</Text>
          <View className="self-start rounded-full bg-[#75e6be]/15 px-3 py-2">
            <Text className="text-xs font-black text-[#adf7e6]">{featured.badge}</Text>
          </View>
        </View>
      </View>

      <View className="gap-3">
        <SectionTitle
          title={exploreTab === 'projects' ? 'Published projects' : 'Learn invariants and properties'}
          badge="Read-only"
        />
        {activeItems.map((item) => (
          <View
            key={item.name}
            className="flex-row items-center gap-3 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3"
          >
            <View className="h-14 w-11 rounded-lg border border-[#fff4cf]/15 bg-[#ff8a5c]" />
            <View className="min-w-0 flex-1">
              <Text className="text-base font-black text-[#fff4cf]">{item.name}</Text>
              <Text className="text-sm leading-5 text-[#fff4cf]/65">{item.summary}</Text>
            </View>
            <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
              <Text className="text-xs font-black text-[#ffe6a3]">{item.badge}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="gap-2 rounded-lg border border-[#75e6be]/25 bg-[#75e6be]/10 p-4">
        <Text className="text-base font-black text-[#dffdf4]">From product promise to property</Text>
        <Text className="text-sm leading-5 text-[#dffdf4]/75">
          Start with: always true, allowed to act, never lost.
        </Text>
      </View>
    </View>
  )
}

function ExploreTabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-1 rounded-full px-4 py-2 ${active ? 'bg-[#ffd978]' : 'bg-transparent'}`}
    >
      <Text className={`text-center text-sm font-black ${active ? 'text-[#201626]' : 'text-[#fff4cf]/65'}`}>
        {label}
      </Text>
    </Pressable>
  )
}

function SectionTitle({ badge, title }: { badge: string; title: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="min-w-0 flex-1 text-xl font-black text-[#fff4cf]">{title}</Text>
      <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
        <Text className="text-xs font-black text-[#ffe6a3]">{badge}</Text>
      </View>
    </View>
  )
}

function BottomNav({ activeTab, onChangeTab }: { activeTab: PrimaryTab; onChangeTab: (tab: PrimaryTab) => void }) {
  const tabs: { key: PrimaryTab; label: string }[] = [
    { key: 'explore', label: 'Explore' },
    { key: 'chat', label: 'Chat' },
    { key: 'workspace', label: 'Workspace' },
  ]

  return (
    <View className="flex-row rounded-full border border-[#fff4cf]/10 bg-[#160f1d] p-1">
      {tabs.map((tab) => {
        const active = tab.key === activeTab

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            onPress={() => onChangeTab(tab.key)}
            className={`flex-1 rounded-full px-3 py-3 ${active ? 'bg-[#ffd978]' : 'bg-transparent'}`}
          >
            <Text className={`text-center text-xs font-black ${active ? 'text-[#201626]' : 'text-[#fff4cf]/50'}`}>
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
