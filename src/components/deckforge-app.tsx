import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import {
  buildGenerationRequest,
  createClearedChatState,
  createInitialMvpShellState,
  DEVNET_DEPLOYMENT_DEMO_WARNING,
  deriveChatProjectRouteDecision,
  getDeployableGenerationArtifact,
  getDeploymentStatusLabel,
  getDevnetDeploymentBlocker,
  getGenerationBlocker,
  getGenerationResultIssue,
  getGenerationStatusLabel,
  hasRenderableGenerationResult,
  isActiveDeploymentJob,
  mergeBackendProjectState,
  restoreMvpShellState,
  saveDeploymentJob,
  saveGenerationJob,
  saveCvlrSpec,
  serializeMvpShellState,
  submitPrompt,
  type ChatProjectRouteDecision,
  type CvlrSpec,
  type DeploymentJobRecord,
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
  approveProjectCvlrSpec,
  approveProjectDesignDoc,
  approveProjectVerificationProperties,
  applyVibeDefaultsToProject,
  capturePromptToProject,
  listProjects,
  listProjectSummaries,
  publishProject,
  readProjectSnapshot,
  saveDesignDocToProject,
  sendProjectChatMessage,
  type ProjectSnapshot,
  updateProjectWorkflowMode,
} from '../features/mvp-shell/backend'
import { generateCvlrSpec } from '../features/mvp-shell/cvlr'
import {
  bytesToBase64,
  decodeBase64Transaction,
  readDeploymentJobStatus,
  submitDeploymentSignature,
  submitDevnetDeploymentJob,
} from '../features/mvp-shell/deployment'
import { readGenerationJobStatus, submitGenerationJob } from '../features/mvp-shell/generation'

type PrimaryTab = 'explore' | 'chat' | 'workspace'
type DisplayWorkflowMode = 'Vibe' | 'Pro'
type ExploreTab = 'projects' | 'properties'
type WorkspaceCardTarget =
  | 'chat'
  | 'design-doc'
  | 'properties'
  | 'cvlr-spec'
  | 'generation'
  | 'deployment'
  | 'publish'
  | 'daily-property'
type DesignDocSectionKey = 'title' | 'goal' | 'coreRequirements' | 'assumptions' | 'missingInformation'
type DesignDocScrollTarget = DesignDocSectionKey | 'approval'
type PendingRouteConfirmation = Extract<ChatProjectRouteDecision, { kind: 'confirm' }> & {
  prompt: string
}
type AppSettings = {
  certoraApiKey: string
  easAuth: string
  expoAccount: string
}
const MVP_SHELL_STORAGE_KEY = 'verified-spec-dev.mvp-shell'
const ACTIVE_PROJECT_STORAGE_KEY = 'verified-spec-dev.active-project'
const LOCAL_BACKEND_BASE_URL = 'http://10.0.2.2:8000'
const PROGRAM_DEPLOYMENT_FLOW_ENABLED = false
const PROGRAM_DEPLOYMENT_DISABLED_MESSAGE = 'Program deployment is disabled until this flow has been tested end to end.'

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

function areDesignDocsEqual(left: MvpDesignDoc | null, right: MvpDesignDoc | null) {
  if (!left || !right) {
    return left === right
  }

  return (
    left.title === right.title &&
    left.goal === right.goal &&
    left.updatedAt === right.updatedAt &&
    left.coreRequirements.join('\n') === right.coreRequirements.join('\n') &&
    left.assumptions.join('\n') === right.assumptions.join('\n') &&
    left.missingInformation.join('\n') === right.missingInformation.join('\n')
  )
}

export function SpecDrivenApp() {
  const { account, connect, disconnect, signAndSendTransaction } = useMobileWallet()
  const [activeTab, setActiveTab] = useState<PrimaryTab>('chat')
  const [suggestionPage, setSuggestionPage] = useState(0)
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)
  const [mvpState, setMvpState] = useState(createInitialMvpShellState)
  const [hasLoadedMvpState, setHasLoadedMvpState] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [followUpDraft, setFollowUpDraft] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [pendingRouteConfirmation, setPendingRouteConfirmation] = useState<PendingRouteConfirmation | null>(null)
  const [exploreTab, setExploreTab] = useState<ExploreTab>('projects')
  const [walletError, setWalletError] = useState<string | null>(null)
  const [deploymentError, setDeploymentError] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isRefreshingDeploymentStatus, setIsRefreshingDeploymentStatus] = useState(false)
  const [isSigningDeployment, setIsSigningDeployment] = useState(false)
  const [isSubmittingDeployment, setIsSubmittingDeployment] = useState(false)
  const [isSubmittingGeneration, setIsSubmittingGeneration] = useState(false)
  const [isRefreshingGenerationStatus, setIsRefreshingGenerationStatus] = useState(false)
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const [isApplyingVibeDefaults, setIsApplyingVibeDefaults] = useState(false)
  const [isGeneratingCvlrSpec, setIsGeneratingCvlrSpec] = useState(false)
  const [isApprovingCvlrSpec, setIsApprovingCvlrSpec] = useState(false)
  const [cvlrError, setCvlrError] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const generationSubmitLock = useRef(false)
  const designDocSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipAutoProjectHydrate = useRef(false)
  const skipNextDesignDocAutosave = useRef(false)
  const workspaceScrollRef = useRef<ScrollView>(null)
  const workspaceCardOffsets = useRef<Partial<Record<WorkspaceCardTarget, number>>>({})
  const designDocSectionOffsets = useRef<Partial<Record<DesignDocScrollTarget, number>>>({})
  const [approvedDesignDocSections, setApprovedDesignDocSections] = useState<DesignDocSectionKey[]>([])
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

  function applyBackendSnapshot(snapshot: ProjectSnapshot, mode: 'replace' | 'merge' = 'replace') {
    skipNextDesignDocAutosave.current = true
    if (mode === 'merge') {
      setMvpState((currentState) => mergeBackendProjectState(snapshot.state, currentState))
    } else {
      setMvpState(snapshot.state)
    }
    setActiveProjectId(snapshot.projectId)
  }

  useEffect(() => {
    if (suggestionPage !== normalizedSuggestionPage) {
      setSuggestionPage(normalizedSuggestionPage)
    }
    if (
      selectedSuggestion &&
      !selectedSuggestion.id.startsWith('design-doc-') &&
      !mvpState.suggestions.some((suggestion) => suggestion.id === selectedSuggestion.id)
    ) {
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
          skipNextDesignDocAutosave.current = true
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
            applyBackendSnapshot(snapshot, 'merge')
          }
          return
        }

        if (skipAutoProjectHydrate.current) {
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
          applyBackendSnapshot(snapshot, 'merge')
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

    if (skipNextDesignDocAutosave.current) {
      skipNextDesignDocAutosave.current = false
      return
    }

    if (designDocSaveTimer.current) {
      clearTimeout(designDocSaveTimer.current)
    }

    designDocSaveTimer.current = setTimeout(() => {
      const designDocToSave = mvpState.designDoc!
      void saveDesignDocToProject({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
        designDoc: designDocToSave,
      })
        .then((snapshot) => {
          setMvpState((currentState) =>
            areDesignDocsEqual(currentState.designDoc, designDocToSave) ? snapshot.state : currentState,
          )
          setActiveProjectId(snapshot.projectId)
        })
        .catch(() => {
          // Preserve local edits if the backend is unavailable.
        })
    }, 500)

    return () => {
      if (designDocSaveTimer.current) {
        clearTimeout(designDocSaveTimer.current)
      }
    }
  }, [activeProjectId, hasLoadedMvpState, mvpState.designDoc])

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

  async function capturePrompt(prompt: string, projectId: string | null) {
    try {
      const snapshot = await capturePromptToProject({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId,
        prompt,
        workflowMode: mvpState.workflowMode,
      })
      applyBackendSnapshot(snapshot)
      skipAutoProjectHydrate.current = false
    } catch {
      setMvpState((currentState) =>
        submitPrompt(
          currentState,
          prompt,
          () => `message-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          new Date().toISOString(),
        ),
      )
    }
    setDraft('')
    setPendingRouteConfirmation(null)
  }

  async function handleSendMessage() {
    const prompt = draft.trim()
    if (!prompt) {
      return
    }

    try {
      const projects = await listProjectSummaries(LOCAL_BACKEND_BASE_URL)
      const routeDecision = deriveChatProjectRouteDecision(prompt, projects)
      if (routeDecision.kind === 'existing') {
        await capturePrompt(prompt, routeDecision.project.projectId)
        return
      }
      if (routeDecision.kind === 'confirm') {
        setPendingRouteConfirmation({ ...routeDecision, prompt })
        setDraft('')
        return
      }
    } catch {
      // If routing data is unavailable, treat the prompt as a new local/backend project.
    }

    await capturePrompt(prompt, null)
  }

  function handleClearChat() {
    skipAutoProjectHydrate.current = true
    setActiveProjectId(null)
    setMvpState((currentState) => createClearedChatState(currentState.workflowMode))
    setDraft('')
    setFollowUpDraft('')
    setFollowUpNote('')
    setSelectedSuggestion(null)
    setPendingRouteConfirmation(null)
    setGenerationError(null)
    setCvlrError(null)
    setDeploymentError(null)
  }

  async function handleConfirmExistingProjectRoute() {
    if (!pendingRouteConfirmation) {
      return
    }
    await capturePrompt(pendingRouteConfirmation.prompt, pendingRouteConfirmation.project.projectId)
  }

  async function handleStartNewProjectRoute() {
    if (!pendingRouteConfirmation) {
      return
    }
    await capturePrompt(pendingRouteConfirmation.prompt, null)
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
      applyBackendSnapshot(snapshot, 'merge')
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
      applyBackendSnapshot(snapshot)
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'AI defaults are unavailable right now.')
    } finally {
      setIsApplyingVibeDefaults(false)
    }
  }

  async function handleGenerateCvlrSpec() {
    if (!activeProjectId || isGeneratingCvlrSpec || !mvpState.designDoc) {
      return
    }

    setCvlrError(null)
    setIsGeneratingCvlrSpec(true)
    try {
      const spec = await generateCvlrSpec({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
        verificationProperties: mvpState.verificationProperties,
        designDoc: mvpState.designDoc,
      })
      setMvpState((current) => saveCvlrSpec(current, spec))
    } catch (error) {
      setCvlrError(error instanceof Error ? error.message : 'Formal verification specification generation failed.')
    } finally {
      setIsGeneratingCvlrSpec(false)
    }
  }

  async function handleApproveCvlrSpec() {
    if (!activeProjectId || isApprovingCvlrSpec) {
      return
    }

    setCvlrError(null)
    setIsApprovingCvlrSpec(true)
    try {
      const snapshot = await approveProjectCvlrSpec({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
      })
      applyBackendSnapshot(snapshot)
    } catch (error) {
      setCvlrError(error instanceof Error ? error.message : 'Formal verification specification approval failed.')
    } finally {
      setIsApprovingCvlrSpec(false)
    }
  }

  function handleSuggestProperty(text: string) {
    setDraft(`I want to add this invariant to my program: ${text.trim()}`)
    setActiveTab('chat')
  }

  async function handlePublish() {
    if (!activeProjectId || isPublishing) {
      return
    }

    setIsPublishing(true)
    try {
      const snapshot = await publishProject({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
      })
      applyBackendSnapshot(snapshot)
    } catch {
      // publish errors are non-critical; surface via the card state (publishedAt stays null)
    } finally {
      setIsPublishing(false)
    }
  }

  function handleSuggestionPress(suggestion: Suggestion) {
    setSelectedSuggestion(suggestion)
    setFollowUpDraft('')
    setFollowUpNote('')
  }

  function handleDiscussDesignDocSection(section: { key: DesignDocSectionKey; label: string; value: string }) {
    setSelectedSuggestion({
      id: `design-doc-${section.key}`,
      label: 'Design Doc section',
      title: `Change ${section.label}`,
      body: section.value,
      detail: section.value || `Discuss what should change in the ${section.label} section.`,
      impact: 'The backend reply can return an updated Design Doc snapshot for Workspace review.',
      createdAt: new Date().toISOString(),
    })
    setFollowUpDraft(`Let's revise the ${section.label} section. `)
    setFollowUpNote('')
    setActiveTab('chat')
  }

  function handleApproveDesignDocSection(sectionKey: DesignDocSectionKey) {
    setApprovedDesignDocSections((current) => {
      const alreadyApproved = current.includes(sectionKey)
      const nextApprovedSections = alreadyApproved ? current.filter((key) => key !== sectionKey) : [...current, sectionKey]

      if (!alreadyApproved) {
        const sectionOrder: DesignDocSectionKey[] = ['title', 'goal', 'coreRequirements', 'assumptions', 'missingInformation']
        const currentIndex = sectionOrder.indexOf(sectionKey)
        const nextSection =
          currentIndex >= 0
            ? sectionOrder.slice(currentIndex + 1).find((key) => !nextApprovedSections.includes(key))
            : null

        setTimeout(() => {
          scrollToDesignDocTarget(nextSection ?? 'approval')
        }, 50)
      }

      return nextApprovedSections
    })
  }

  function handleDesignDocFieldChange(field: 'title' | 'goal', value: string) {
    setApprovedDesignDocSections((current) => current.filter((key) => key !== field))
    setMvpState((currentState) => updateDesignDocField(currentState, field, value))
  }

  function handleDesignDocListFieldChange(
    field: 'coreRequirements' | 'assumptions' | 'missingInformation',
    value: string,
  ) {
    setApprovedDesignDocSections((current) => current.filter((key) => key !== field))
    setMvpState((currentState) => updateDesignDocListField(currentState, field, value))
  }

  function handleWorkspaceCardLayout(target: WorkspaceCardTarget, y: number) {
    workspaceCardOffsets.current[target] = y
  }

  function handleDesignDocSectionLayout(target: DesignDocScrollTarget, y: number) {
    designDocSectionOffsets.current[target] = y
  }

  function scrollToDesignDocTarget(target: DesignDocScrollTarget) {
    setActiveTab('workspace')
    setTimeout(() => {
      const cardY = workspaceCardOffsets.current['design-doc']
      const sectionY = designDocSectionOffsets.current[target]

      if (typeof cardY === 'number' && typeof sectionY === 'number') {
        workspaceScrollRef.current?.scrollTo({ y: Math.max(cardY + sectionY - 8, 0), animated: true })
      }
    }, 50)
  }

  function handleGoToWorkspaceCard(target: WorkspaceCardTarget) {
    if (target === 'chat') {
      setActiveTab('chat')
      return
    }

    setActiveTab('workspace')
    setTimeout(() => {
      const y = workspaceCardOffsets.current[target]
      if (typeof y === 'number') {
        workspaceScrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true })
      }
    }, 50)
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
      applyBackendSnapshot(snapshot, 'merge')
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

  async function handleApproveDesignDoc() {
    setGenerationError(null)

    if (!activeProjectId) {
      setGenerationError('Submit the project prompt in Chat before approving the Design Doc.')
      return
    }

    try {
      const snapshot = await approveProjectDesignDoc({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
      })
      applyBackendSnapshot(snapshot)
    } catch {
      setGenerationError('Design Doc approval failed. Try again when the backend is reachable.')
    }
  }

  async function handleApproveVerificationProperties() {
    setGenerationError(null)

    if (!activeProjectId) {
      setGenerationError('Submit the project prompt in Chat before approving properties to prove.')
      return
    }

    try {
      const snapshot = await approveProjectVerificationProperties({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        projectId: activeProjectId,
      })
      applyBackendSnapshot(snapshot)
    } catch {
      setGenerationError('Property approval failed. Try again when the backend is reachable.')
    }
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

  const handleGenerationRefresh = useCallback(async () => {
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
  }, [isRefreshingGenerationStatus, mvpState.generationJob])

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
  }, [handleGenerationRefresh, mvpState.generationJob])

  async function handleDeploymentStart() {
    if (!PROGRAM_DEPLOYMENT_FLOW_ENABLED) {
      setDeploymentError(PROGRAM_DEPLOYMENT_DISABLED_MESSAGE)
      return
    }

    if (isSubmittingDeployment || isActiveDeploymentJob(mvpState.deploymentJob?.status ?? '')) {
      return
    }

    const blocker = getDevnetDeploymentBlocker(mvpState, Boolean(accountAddress))
    if (blocker) {
      setDeploymentError(blocker)
      return
    }

    const artifact = getDeployableGenerationArtifact(mvpState.generationJob)
    if (!artifact || !accountAddress) {
      setDeploymentError('Devnet deployment is unavailable for this generated result.')
      return
    }

    setDeploymentError(null)
    setIsSubmittingDeployment(true)

    try {
      const job = await submitDevnetDeploymentJob({
        artifact,
        authorityWallet: accountAddress,
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        payerWallet: accountAddress,
        projectId: activeProjectId,
        verificationStatusAcknowledged: mvpState.generationJob?.status ?? 'unknown',
      })

      setMvpState((currentState) => saveDeploymentJob(currentState, job))
    } catch (error) {
      setDeploymentError(error instanceof Error ? error.message : 'Devnet deployment request failed. Try again.')
    } finally {
      setIsSubmittingDeployment(false)
    }
  }

  async function handleDeploymentSign() {
    if (!PROGRAM_DEPLOYMENT_FLOW_ENABLED) {
      setDeploymentError(PROGRAM_DEPLOYMENT_DISABLED_MESSAGE)
      return
    }

    const deploymentJob = mvpState.deploymentJob
    const signatureRequest = deploymentJob?.signatureRequest

    if (!deploymentJob || !signatureRequest || isSigningDeployment) {
      return
    }

    setDeploymentError(null)
    setIsSigningDeployment(true)

    try {
      const transaction = decodeBase64Transaction(signatureRequest.transactionBase64)
      const minContextSlot = signatureRequest.minContextSlot ? BigInt(signatureRequest.minContextSlot) : 0n
      const signatureBytes = await signAndSendTransaction(transaction, minContextSlot)
      const updatedJob = await submitDeploymentSignature({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        job: deploymentJob,
        signatureBase64: bytesToBase64(signatureBytes),
      })

      setMvpState((currentState) => saveDeploymentJob(currentState, updatedJob))
    } catch (error) {
      setDeploymentError(error instanceof Error ? error.message : 'Wallet signing failed. Try again from your wallet.')
    } finally {
      setIsSigningDeployment(false)
    }
  }

  async function handleDeploymentRefresh() {
    if (!PROGRAM_DEPLOYMENT_FLOW_ENABLED) {
      setDeploymentError(PROGRAM_DEPLOYMENT_DISABLED_MESSAGE)
      return
    }

    if (!mvpState.deploymentJob || isRefreshingDeploymentStatus) {
      return
    }

    setDeploymentError(null)
    setIsRefreshingDeploymentStatus(true)

    try {
      const job = await readDeploymentJobStatus({
        backendBaseUrl: LOCAL_BACKEND_BASE_URL,
        job: mvpState.deploymentJob,
      })

      setMvpState((currentState) => saveDeploymentJob(currentState, job))
    } finally {
      setIsRefreshingDeploymentStatus(false)
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

          {activeTab === 'chat' ? (
            <View key={screenKey} className="mt-4 min-h-0 flex-1 gap-3">
              {walletError ? (
                <Text
                  numberOfLines={2}
                  className="rounded-lg border border-[#ff8a5c]/30 bg-[#ff8a5c]/10 px-3 py-2 text-xs font-semibold leading-4 text-[#ffd2bd]"
                >
                  {walletError}
                </Text>
              ) : null}
              <ChatView
                draft={draft}
                followUpDraft={followUpDraft}
                followUpNote={followUpNote}
                hasDesignDoc={Boolean(mvpState.designDoc)}
                isSendingFollowUp={isSendingFollowUp}
                messages={mvpState.messages}
                pendingRouteConfirmation={pendingRouteConfirmation}
                selectedSuggestion={selectedSuggestion}
                suggestionCount={mvpState.suggestions.length}
                suggestionPage={normalizedSuggestionPage}
                visibleSuggestions={visibleSuggestions}
                onBackFromSuggestion={() => setSelectedSuggestion(null)}
                onChangeDraft={setDraft}
                onChangeFollowUpDraft={setFollowUpDraft}
                onClearChat={handleClearChat}
                onConfirmExistingProjectRoute={handleConfirmExistingProjectRoute}
                onFollowUpSend={handleFollowUpSend}
                onNextSuggestions={showNextSuggestions}
                onPreviousSuggestions={showPreviousSuggestions}
                onReviewDesignDoc={handleReviewDesignDoc}
                onSendMessage={handleSendMessage}
                onStartNewProjectRoute={handleStartNewProjectRoute}
                onSuggestionPress={handleSuggestionPress}
              />
            </View>
          ) : (
            <ScrollView
              key={screenKey}
              ref={workspaceScrollRef}
              className="mt-4 min-h-0 flex-1"
              contentContainerStyle={{ flexGrow: 1, gap: 14, paddingBottom: 4 }}
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

              {activeTab === 'workspace' ? (
                <WorkspaceView
                  accountAddress={accountAddress}
                  appSettings={appSettings}
                  designDoc={mvpState.designDoc}
                  designDocApprovedAt={mvpState.designDocApprovedAt}
                  deploymentError={deploymentError}
                  deploymentJob={mvpState.deploymentJob}
                  latestPromptSeed={mvpState.latestPromptSeed}
                  mode={displayMode}
                  verificationProperties={mvpState.verificationProperties}
                  verificationPropertiesApprovedAt={mvpState.verificationPropertiesApprovedAt}
                  workflowMode={mvpState.workflowMode}
                  walletConnected={Boolean(account)}
                  generationError={generationError}
                  generationJob={mvpState.generationJob}
                  cvlrError={cvlrError}
                  cvlrSpec={mvpState.cvlrSpec}
                  cvlrSpecApprovedAt={mvpState.cvlrSpecApprovedAt}
                  isApprovingCvlrSpec={isApprovingCvlrSpec}
                  isApplyingVibeDefaults={isApplyingVibeDefaults}
                  isGeneratingCvlrSpec={isGeneratingCvlrSpec}
                  isRefreshingDeploymentStatus={isRefreshingDeploymentStatus}
                  isRefreshingGenerationStatus={isRefreshingGenerationStatus}
                  isSigningDeployment={isSigningDeployment}
                  isSubmittingDeployment={isSubmittingDeployment}
                  isSubmittingGeneration={isSubmittingGeneration}
                  approvedDesignDocSections={approvedDesignDocSections}
                  onAppSettingChange={updateAppSetting}
                  onApproveDesignDoc={handleApproveDesignDoc}
                  onApproveDesignDocSection={handleApproveDesignDocSection}
                  onApproveVerificationProperties={handleApproveVerificationProperties}
                  onDesignDocFieldChange={handleDesignDocFieldChange}
                  onDesignDocSectionLayout={handleDesignDocSectionLayout}
                  onDesignDocListFieldChange={handleDesignDocListFieldChange}
                  onDiscussDesignDocSection={handleDiscussDesignDocSection}
                  onApproveCvlrSpec={handleApproveCvlrSpec}
                  onGenerateCvlrSpec={handleGenerateCvlrSpec}
                  onGenerationSubmit={handleGenerationSubmit}
                  onGenerationRefresh={handleGenerationRefresh}
                  onDeploymentRefresh={handleDeploymentRefresh}
                  onGoToWorkspaceCard={handleGoToWorkspaceCard}
                  onWorkspaceCardLayout={handleWorkspaceCardLayout}
                  onDeploymentSign={handleDeploymentSign}
                  onDeploymentStart={handleDeploymentStart}
                  isPublishing={isPublishing}
                  publishedAt={mvpState.publishedAt}
                  onApplyVibeDefaults={handleApplyVibeDefaults}
                  onModeChange={handleModeChange}
                  onPublish={handlePublish}
                  onSuggestProperty={handleSuggestProperty}
                  onWalletPress={handleWalletPress}
                />
              ) : null}

              {activeTab === 'explore' ? (
                <ExploreView
                  exploreTab={exploreTab}
                  onExploreTabChange={setExploreTab}
                  projectTitle={mvpState.designDoc?.title ?? null}
                  projectSummary={mvpState.designDoc?.goal ?? null}
                  publishedAt={mvpState.publishedAt}
                  verificationProperties={mvpState.verificationProperties}
                />
              ) : null}
            </ScrollView>
          )}

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
  pendingRouteConfirmation,
  selectedSuggestion,
  suggestionCount,
  suggestionPage,
  visibleSuggestions,
  onBackFromSuggestion,
  onChangeDraft,
  onChangeFollowUpDraft,
  onClearChat,
  onConfirmExistingProjectRoute,
  onFollowUpSend,
  onNextSuggestions,
  onPreviousSuggestions,
  onReviewDesignDoc,
  onSendMessage,
  onStartNewProjectRoute,
  onSuggestionPress,
}: {
  draft: string
  followUpDraft: string
  followUpNote: string
  hasDesignDoc: boolean
  isSendingFollowUp: boolean
  messages: ChatMessage[]
  pendingRouteConfirmation: PendingRouteConfirmation | null
  selectedSuggestion: Suggestion | null
  suggestionCount: number
  suggestionPage: number
  visibleSuggestions: Suggestion[]
  onBackFromSuggestion: () => void
  onChangeDraft: (value: string) => void
  onChangeFollowUpDraft: (value: string) => void
  onClearChat: () => void
  onConfirmExistingProjectRoute: () => void
  onFollowUpSend: () => void
  onNextSuggestions: () => void
  onPreviousSuggestions: () => void
  onReviewDesignDoc: () => void
  onSendMessage: () => void
  onStartNewProjectRoute: () => void
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
    <View className="min-h-0 flex-1 gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-black uppercase tracking-widest text-[#ffd978]">Project chat</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onClearChat}
          className="rounded-full border border-[#fff4cf]/15 bg-[#fff4cf]/10 px-4 py-2 active:bg-[#fff4cf]/15"
        >
          <Text className="text-xs font-black text-[#fff4cf]">Clear</Text>
        </Pressable>
      </View>

      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </View>

        {pendingRouteConfirmation ? (
          <View className="gap-3 rounded-lg border border-[#ffd978]/30 bg-[#ffd978]/10 p-3">
            <View className="gap-1">
              <Text className="text-xs font-black uppercase tracking-widest text-[#ffd978]">Related project found</Text>
              <Text className="text-base font-black text-[#fff4cf]">{pendingRouteConfirmation.project.title}</Text>
              <Text className="text-sm leading-5 text-[#fff4cf]/70">
                Continue this chat in that project, or start a separate project?
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                accessibilityLabel="Continue related project"
                accessibilityRole="button"
                onPress={onConfirmExistingProjectRoute}
                testID="related-project-continue"
                className="flex-1 rounded-full bg-[#ffd978] px-4 py-2 active:bg-[#ffe6a3]"
              >
                <Text className="text-center text-xs font-black text-[#201626]">Continue</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Start new project"
                accessibilityRole="button"
                onPress={onStartNewProjectRoute}
                testID="related-project-new"
                className="flex-1 rounded-full border border-[#fff4cf]/15 bg-[#fff4cf]/10 px-4 py-2 active:bg-[#fff4cf]/15"
              >
                <Text className="text-center text-xs font-black text-[#fff4cf]">New project</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-[#ffd978]"
              >
                Suggestions
              </Text>
              <Text className="text-xs font-bold text-[#fff4cf]/55">
                {suggestionPage * 2 + 1}-{Math.min(suggestionPage * 2 + visibleSuggestions.length, suggestionCount)} of{' '}
                {suggestionCount}
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
      </ScrollView>

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
    <View className="min-h-0 flex-1 gap-4">
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ gap: 16, paddingBottom: 4 }}
        showsVerticalScrollIndicator={false}
      >
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
      </ScrollView>

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

function ModeSwitch({
  mode,
  onModeChange,
}: {
  mode: DisplayWorkflowMode
  onModeChange: (value: DisplayWorkflowMode) => void
}) {
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
        accessibilityLabel="Project prompt input"
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
        testID="project-prompt-input"
        value={draft}
      />
      <Pressable
        accessibilityLabel="Send message"
        accessibilityRole="button"
        disabled={!canSend}
        onPress={onSend}
        testID="send-message-button"
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
  approvedDesignDocSections,
  cvlrError,
  cvlrSpec,
  cvlrSpecApprovedAt,
  designDoc,
  designDocApprovedAt,
  deploymentError,
  deploymentJob,
  generationError,
  generationJob,
  isApprovingCvlrSpec,
  isApplyingVibeDefaults,
  isGeneratingCvlrSpec,
  isPublishing,
  isRefreshingDeploymentStatus,
  isRefreshingGenerationStatus,
  isSigningDeployment,
  isSubmittingDeployment,
  isSubmittingGeneration,
  latestPromptSeed,
  mode,
  publishedAt,
  verificationProperties,
  verificationPropertiesApprovedAt,
  workflowMode,
  onAppSettingChange,
  onApproveCvlrSpec,
  onApplyVibeDefaults,
  onApproveDesignDoc,
  onApproveDesignDocSection,
  onApproveVerificationProperties,
  onDesignDocFieldChange,
  onDesignDocSectionLayout,
  onDesignDocListFieldChange,
  onDiscussDesignDocSection,
  onDeploymentRefresh,
  onDeploymentSign,
  onDeploymentStart,
  onGenerateCvlrSpec,
  onGenerationRefresh,
  onGenerationSubmit,
  onGoToWorkspaceCard,
  onModeChange,
  onPublish,
  onSuggestProperty,
  onWalletPress,
  onWorkspaceCardLayout,
  walletConnected,
}: {
  accountAddress?: string
  appSettings: AppSettings
  approvedDesignDocSections: DesignDocSectionKey[]
  designDoc: MvpDesignDoc | null
  designDocApprovedAt: string | null
  deploymentError: string | null
  deploymentJob: DeploymentJobRecord | null
  generationError: string | null
  generationJob: GenerationJobRecord | null
  cvlrError: string | null
  cvlrSpec: CvlrSpec | null
  cvlrSpecApprovedAt: string | null
  isApprovingCvlrSpec: boolean
  isApplyingVibeDefaults: boolean
  isGeneratingCvlrSpec: boolean
  isPublishing: boolean
  isRefreshingDeploymentStatus: boolean
  isRefreshingGenerationStatus: boolean
  isSigningDeployment: boolean
  isSubmittingDeployment: boolean
  isSubmittingGeneration: boolean
  latestPromptSeed: MvpProjectSeed | null
  mode: DisplayWorkflowMode
  publishedAt: string | null
  verificationProperties: VerificationProperty[]
  verificationPropertiesApprovedAt: string | null
  workflowMode: WorkflowMode
  onAppSettingChange: (key: keyof AppSettings, value: string) => void
  onApproveCvlrSpec: () => void
  onApplyVibeDefaults: () => void
  onApproveDesignDoc: () => void
  onApproveDesignDocSection: (sectionKey: DesignDocSectionKey) => void
  onApproveVerificationProperties: () => void
  onDesignDocFieldChange: (field: 'title' | 'goal', value: string) => void
  onDesignDocSectionLayout: (target: DesignDocScrollTarget, y: number) => void
  onDesignDocListFieldChange: (field: 'coreRequirements' | 'assumptions' | 'missingInformation', value: string) => void
  onDiscussDesignDocSection: (section: { key: DesignDocSectionKey; label: string; value: string }) => void
  onDeploymentRefresh: () => void
  onDeploymentSign: () => void
  onDeploymentStart: () => void
  onGenerateCvlrSpec: () => void
  onGenerationRefresh: () => void
  onGenerationSubmit: () => void
  onGoToWorkspaceCard: (target: WorkspaceCardTarget) => void
  onModeChange: (value: DisplayWorkflowMode) => void
  onPublish: () => void
  onSuggestProperty: (text: string) => void
  onWalletPress: () => void
  onWorkspaceCardLayout: (target: WorkspaceCardTarget, y: number) => void
  walletConnected: boolean
}) {
  return (
    <View className="gap-4">
      <SuggestedNextActionCard
        cvlrSpec={cvlrSpec}
        cvlrSpecApprovedAt={cvlrSpecApprovedAt}
        deploymentJob={deploymentJob}
        designDoc={designDoc}
        designDocApprovedAt={designDocApprovedAt}
        generationJob={generationJob}
        publishedAt={publishedAt}
        verificationProperties={verificationProperties}
        verificationPropertiesApprovedAt={verificationPropertiesApprovedAt}
        onGoToCard={onGoToWorkspaceCard}
      />

      <View onLayout={(event) => onWorkspaceCardLayout('design-doc', event.nativeEvent.layout.y)}>
        <DesignDocCard
          approvedAt={designDocApprovedAt}
          approvedSections={approvedDesignDocSections}
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
          onApproveSection={onApproveDesignDocSection}
          onDiscussSection={onDiscussDesignDocSection}
          onFieldChange={onDesignDocFieldChange}
          onSectionLayout={onDesignDocSectionLayout}
          onRefresh={onGenerationRefresh}
          onGenerate={onGenerationSubmit}
          onListFieldChange={onDesignDocListFieldChange}
        />
      </View>

      <View onLayout={(event) => onWorkspaceCardLayout('properties', event.nativeEvent.layout.y)}>
        <PropertiesToProveCard
          designDocApprovedAt={designDocApprovedAt}
          properties={verificationProperties}
          propertiesApprovedAt={verificationPropertiesApprovedAt}
          onApprove={onApproveVerificationProperties}
        />
      </View>

      <View onLayout={(event) => onWorkspaceCardLayout('cvlr-spec', event.nativeEvent.layout.y)}>
        <CvlrSpecCard
          cvlrSpec={cvlrSpec}
          cvlrSpecApprovedAt={cvlrSpecApprovedAt}
          error={cvlrError}
          isApproving={isApprovingCvlrSpec}
          isGenerating={isGeneratingCvlrSpec}
          verificationPropertiesApprovedAt={verificationPropertiesApprovedAt}
          onApprove={onApproveCvlrSpec}
          onGenerate={onGenerateCvlrSpec}
        />
      </View>

      <View onLayout={(event) => onWorkspaceCardLayout('daily-property', event.nativeEvent.layout.y)}>
        <DailyPropertyCard designDocApprovedAt={designDocApprovedAt} onSuggestProperty={onSuggestProperty} />
      </View>

      {PROGRAM_DEPLOYMENT_FLOW_ENABLED ? (
        <>
          <View onLayout={(event) => onWorkspaceCardLayout('deployment', event.nativeEvent.layout.y)}>
            <DeploymentCard
              accountAddress={accountAddress}
              deploymentError={deploymentError}
              deploymentJob={deploymentJob}
              generationJob={generationJob}
              isRefreshingDeploymentStatus={isRefreshingDeploymentStatus}
              isSigningDeployment={isSigningDeployment}
              isSubmittingDeployment={isSubmittingDeployment}
              walletConnected={walletConnected}
              onRefresh={onDeploymentRefresh}
              onSign={onDeploymentSign}
              onStart={onDeploymentStart}
            />
          </View>

          <ProgramHealthCard deploymentJob={deploymentJob} />
        </>
      ) : (
        <ProgramDeploymentDisabledCard />
      )}

      {designDoc ? (
        <View
          className="gap-3 rounded-lg border border-[#75e6be]/20 bg-[#75e6be]/10 p-4"
          onLayout={(event) => onWorkspaceCardLayout('publish', event.nativeEvent.layout.y)}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Publish to Explore</Text>
              <Text className="text-xl font-black leading-6 text-[#dffdf4]">
                {publishedAt ? 'Project is published' : 'Share with the community'}
              </Text>
              <Text className="text-sm leading-5 text-[#dffdf4]/70">
                {publishedAt
                  ? 'Your project title and verification properties are visible in the Explore tab.'
                  : 'Opt in to make your project title and verification properties visible to other builders in the Explore tab.'}
              </Text>
            </View>
            <View className={`rounded-full px-3 py-2 ${publishedAt ? 'bg-[#75e6be]/25' : 'bg-[#75e6be]/15'}`}>
              <Text className="text-xs font-black text-[#adf7e6]">{publishedAt ? 'Live' : 'Off'}</Text>
            </View>
          </View>
          {!publishedAt ? (
            <Pressable
              accessibilityLabel="Publish project"
              accessibilityRole="button"
              disabled={isPublishing}
              onPress={onPublish}
              testID="publish-project-button"
              className="rounded-lg bg-[#75e6be] px-4 py-3 active:bg-[#adf7e6]"
            >
              <Text className="text-center text-sm font-black text-[#0d3b35]">
                {isPublishing ? 'Publishing…' : 'Publish project'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
          These integrations are shown for future setup. They are disabled until the app has a working backend flow that
          uses them.
        </Text>
        <EditableSettingRow
          body="Expo account linking is not connected in this build."
          disabled
          onChangeText={(value) => onAppSettingChange('expoAccount', value)}
          placeholder="expo username or email"
          title="Expo account"
          value={appSettings.expoAccount}
          status="Not active"
        />
        <EditableSettingRow
          body="EAS authentication is not used by the current app flow."
          disabled
          onChangeText={(value) => onAppSettingChange('easAuth', value)}
          placeholder="EXPO_TOKEN or EAS auth note"
          secureTextEntry
          title="EXPO_TOKEN / EAS auth"
          value={appSettings.easAuth}
          status="Not active"
        />
        <EditableSettingRow
          body="Certora access is not used by the current app flow."
          disabled
          onChangeText={(value) => onAppSettingChange('certoraApiKey', value)}
          placeholder="Certora API key"
          secureTextEntry
          title="Certora API key"
          value={appSettings.certoraApiKey}
          status="Not active"
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

function getDeploymentStatusBadgeClass(status: string) {
  switch (getDeploymentStatusLabel(status)) {
    case 'Queued':
      return 'bg-[#9db4ff]/18'
    case 'Running':
      return 'bg-[#ffd978]/18'
    case 'Signature needed':
      return 'bg-[#ffd978]/20'
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
  approvedSections,
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
  onApproveSection,
  onDiscussSection,
  onFieldChange,
  onSectionLayout,
  onRefresh,
  onGenerate,
  onListFieldChange,
}: {
  approvedAt: string | null
  approvedSections: DesignDocSectionKey[]
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
  onApproveSection: (sectionKey: DesignDocSectionKey) => void
  onDiscussSection: (section: { key: DesignDocSectionKey; label: string; value: string }) => void
  onFieldChange: (field: 'title' | 'goal', value: string) => void
  onSectionLayout: (target: DesignDocScrollTarget, y: number) => void
  onRefresh: () => void
  onGenerate: () => void
  onListFieldChange: (field: 'coreRequirements' | 'assumptions' | 'missingInformation', value: string) => void
}) {
  const missingInformationCount = designDoc?.missingInformation.length ?? 0
  const hasMissingInformation = missingInformationCount > 0
  const generationBlocked = isSubmittingGeneration || hasMissingInformation || !approvedAt || !propertiesApprovedAt
  const modeLabel = toDisplayWorkflowMode(workflowMode)
  const generationButtonLabel = isSubmittingGeneration
    ? 'Submitting to Certora Prover...'
    : hasMissingInformation
      ? 'Resolve gate before generation'
      : !approvedAt
        ? 'Approve Design Doc first'
        : !propertiesApprovedAt
          ? 'Approve properties first'
          : 'Generate MVP'
  const sections: {
    key: DesignDocSectionKey
    label: string
    multiline?: boolean
    value: string
    onChangeText: (value: string) => void
  }[] = designDoc
    ? [
        {
          key: 'title',
          label: 'Title',
          value: designDoc.title,
          onChangeText: (value) => onFieldChange('title', value),
        },
        {
          key: 'goal',
          label: 'Goal',
          multiline: true,
          value: designDoc.goal,
          onChangeText: (value) => onFieldChange('goal', value),
        },
        {
          key: 'coreRequirements',
          label: 'Core requirements',
          multiline: true,
          value: designDoc.coreRequirements.join('\n'),
          onChangeText: (value) => onListFieldChange('coreRequirements', value),
        },
        {
          key: 'assumptions',
          label: 'Assumptions',
          multiline: true,
          value: designDoc.assumptions.join('\n'),
          onChangeText: (value) => onListFieldChange('assumptions', value),
        },
        {
          key: 'missingInformation',
          label: 'Missing information',
          multiline: true,
          value: designDoc.missingInformation.join('\n'),
          onChangeText: (value) => onListFieldChange('missingInformation', value),
        },
      ]
    : []

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

      {sections.map((section) => (
        <View key={section.key} onLayout={(event) => onSectionLayout(section.key, event.nativeEvent.layout.y)}>
          <EditableDocField
            approved={approvedSections.includes(section.key)}
            label={section.label}
            multiline={section.multiline}
            value={section.value}
            onApprove={() => onApproveSection(section.key)}
            onChangeText={section.onChangeText}
            onDiscuss={() => onDiscussSection(section)}
          />
        </View>
      ))}

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

      <View
        className="gap-3 rounded-2xl border border-[#75e6be]/20 bg-[#75e6be]/10 p-3"
        onLayout={(event) => onSectionLayout('approval', event.nativeEvent.layout.y)}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Approval</Text>
            <Text className="text-sm leading-5 text-[#dffdf4]/80">
              {approvedAt
                ? `Approved ${formatSavedAt(approvedAt)}. Editing the Design Doc will reset this approval.`
                : 'Approve this Design Doc when the plan looks right. After approval, the app can suggest the specifications for formal verification.'}
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
              Submit this MVP Design Doc to Certora Prover for formal verification.
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
            <Text className="text-xs leading-5 text-[#dffdf4]/70">
              Updated: {formatSavedAt(generationJob.updatedAt)}
            </Text>
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

function deriveSuggestedNextAction(props: {
  designDoc: MvpDesignDoc | null
  designDocApprovedAt: string | null
  verificationProperties: VerificationProperty[]
  verificationPropertiesApprovedAt: string | null
  cvlrSpec: CvlrSpec | null
  cvlrSpecApprovedAt: string | null
  generationJob: GenerationJobRecord | null
  deploymentJob: DeploymentJobRecord | null
  publishedAt: string | null
}): { eyebrow: string; title: string; body: string; target: WorkspaceCardTarget } {
  if (!props.designDoc) {
    return {
      eyebrow: 'Step 1',
      title: 'Describe your program',
      body: 'Go to Chat and describe the Solana program you want to build.',
      target: 'chat',
    }
  }
  if (!props.designDocApprovedAt) {
    return {
      eyebrow: 'Step 2',
      title: 'Approve the Design Doc',
      body: 'Review the auto-drafted Design Doc below and tap Approve when it looks right.',
      target: 'design-doc',
    }
  }
  if (props.verificationProperties.length === 0) {
    return {
      eyebrow: 'Step 3',
      title: 'Waiting on properties',
      body: 'The backend is proposing verification properties. Refresh the project to check.',
      target: 'properties',
    }
  }
  if (!props.verificationPropertiesApprovedAt) {
    return {
      eyebrow: 'Step 3',
      title: 'Approve verification properties',
      body: 'Review the proposed properties and approve them to continue toward formal verification.',
      target: 'properties',
    }
  }
  if (!props.cvlrSpec) {
    return {
      eyebrow: 'Step 4',
      title: 'Generate formal verification specs',
      body: 'Create the specifications that describe what formal verification should prove.',
      target: 'cvlr-spec',
    }
  }
  if (!props.cvlrSpecApprovedAt) {
    return {
      eyebrow: 'Step 5',
      title: 'Approve formal verification specs',
      body: 'Review the generated spec below and approve it to submit to AI Composer.',
      target: 'cvlr-spec',
    }
  }
  const job = props.generationJob
  if (!job || job.status === 'queued' || job.status === 'running') {
    return {
      eyebrow: 'Step 6',
      title: 'AI Composer is running',
      body: 'Generation is in progress. Tap Refresh to check the latest status.',
      target: 'design-doc',
    }
  }
  if (job.status !== 'succeeded') {
    return {
      eyebrow: 'Step 6',
      title: 'Review generation result',
      body: 'The generation job finished with an issue. Check the log and retry from the Design Doc card.',
      target: 'design-doc',
    }
  }
  if (PROGRAM_DEPLOYMENT_FLOW_ENABLED) {
    const deployed = props.deploymentJob?.status === 'succeeded'
    if (!deployed) {
      return {
        eyebrow: 'Step 7',
        title: 'Deploy to devnet',
        body: 'Your program is generated. Connect a wallet and deploy it to Solana devnet.',
        target: 'deployment',
      }
    }
  }
  if (!props.publishedAt) {
    return {
      eyebrow: PROGRAM_DEPLOYMENT_FLOW_ENABLED ? 'Step 8' : 'Step 7',
      title: 'Publish to Explore',
      body: 'Share your approved project and verification properties with the community by opting in below.',
      target: 'publish',
    }
  }
  return {
    eyebrow: 'Keep going',
    title: 'Add another invariant',
    body: PROGRAM_DEPLOYMENT_FLOW_ENABLED
      ? 'Your program is live and published. Strengthen its guarantees by adding one more verification property today.'
      : 'Your project is published. Strengthen its guarantees by adding one more verification property today.',
    target: 'daily-property',
  }
}

function SuggestedNextActionCard({
  cvlrSpec,
  cvlrSpecApprovedAt,
  deploymentJob,
  designDoc,
  designDocApprovedAt,
  generationJob,
  publishedAt,
  verificationProperties,
  verificationPropertiesApprovedAt,
  onGoToCard,
}: {
  cvlrSpec: CvlrSpec | null
  cvlrSpecApprovedAt: string | null
  deploymentJob: DeploymentJobRecord | null
  designDoc: MvpDesignDoc | null
  designDocApprovedAt: string | null
  generationJob: GenerationJobRecord | null
  publishedAt: string | null
  verificationProperties: VerificationProperty[]
  verificationPropertiesApprovedAt: string | null
  onGoToCard: (target: WorkspaceCardTarget) => void
}) {
  const action = deriveSuggestedNextAction({
    cvlrSpec,
    cvlrSpecApprovedAt,
    deploymentJob,
    designDoc,
    designDocApprovedAt,
    generationJob,
    publishedAt,
    verificationProperties,
    verificationPropertiesApprovedAt,
  })
  return (
    <View className="gap-3 rounded-lg border border-[#ffd978]/25 bg-[#23182c] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-black uppercase tracking-widest text-[#ffd978]">Suggested next action</Text>
          <Text className="text-xl font-black leading-6 text-[#fff4cf]">{action.title}</Text>
          <Text className="text-sm leading-5 text-[#fff4cf]/70">{action.body}</Text>
        </View>
        <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
          <Text className="text-xs font-black text-[#ffe6a3]">{action.eyebrow}</Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel={`Go to ${action.title}`}
        accessibilityRole="button"
        onPress={() => onGoToCard(action.target)}
        className="items-center rounded-full bg-[#ffd978] px-4 py-3 active:bg-[#ffe6a3]"
      >
        <Text className="text-sm font-black text-[#201626]">Go to card</Text>
      </Pressable>
    </View>
  )
}

function DailyPropertyCard({
  designDocApprovedAt,
  onSuggestProperty,
}: {
  designDocApprovedAt: string | null
  onSuggestProperty: (text: string) => void
}) {
  const [draft, setDraft] = useState('')
  if (!designDocApprovedAt) {
    return null
  }
  return (
    <View className="gap-3 rounded-lg border border-[#c8d6ff]/20 bg-[#1a1f2e] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">Today challenge</Text>
          <Text className="text-xl font-black leading-6 text-[#fff4cf]">Add one more invariant</Text>
          <Text className="text-sm leading-5 text-[#fff4cf]/70">
            Each property you add strengthens the formal guarantees of your program. Describe one in plain language and
            discuss it in Chat.
          </Text>
        </View>
        <View className="rounded-full bg-[#c8d6ff]/15 px-3 py-2">
          <Text className="text-xs font-black text-[#c8d6ff]">Daily</Text>
        </View>
      </View>
      <TextInput
        multiline
        numberOfLines={2}
        placeholder="e.g. Only the admin can update the program authority…"
        placeholderTextColor="rgba(200,214,255,0.35)"
        value={draft}
        onChangeText={setDraft}
        className="rounded-lg border border-[#c8d6ff]/20 bg-[#0d1117] px-3 py-3 text-sm leading-5 text-[#c8d6ff]"
      />
      <Pressable
        accessibilityRole="button"
        disabled={!draft.trim()}
        onPress={() => {
          onSuggestProperty(draft.trim())
          setDraft('')
        }}
        className={`items-center rounded-full px-4 py-3 ${draft.trim() ? 'bg-[#c8d6ff]/30 active:bg-[#c8d6ff]/50' : 'bg-[#c8d6ff]/10'}`}
      >
        <Text className={`text-sm font-black ${draft.trim() ? 'text-[#c8d6ff]' : 'text-[#c8d6ff]/35'}`}>
          Discuss in Chat
        </Text>
      </Pressable>
    </View>
  )
}

function ProgramDeploymentDisabledCard() {
  return (
    <View className="gap-3 rounded-lg border border-[#eef2ff]/15 bg-[#181b29] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">Program deployment</Text>
          <Text className="text-xl font-black leading-6 text-[#eef2ff]">Disabled for this build</Text>
          <Text className="text-sm leading-5 text-[#eef2ff]/65">
            Devnet deployment and wallet signing are paused until the full deployment flow has been tested.
          </Text>
        </View>
        <View className="rounded-full bg-[#eef2ff]/10 px-3 py-2">
          <Text className="text-xs font-black text-[#c8d6ff]">Deferred</Text>
        </View>
      </View>
    </View>
  )
}

function ProgramHealthCard({ deploymentJob }: { deploymentJob: DeploymentJobRecord | null }) {
  if (deploymentJob?.status !== 'succeeded') {
    return null
  }
  return (
    <View className="gap-3 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-black uppercase tracking-widest text-[#ffd978]">Program activity</Text>
          <Text className="text-xl font-black leading-6 text-[#fff4cf]">On-chain monitor</Text>
          <Text className="text-sm leading-5 text-[#fff4cf]/70">
            Live transaction counts, account changes, and error rates for your deployed program will appear here.
          </Text>
        </View>
        <View className="rounded-full bg-[#fff4cf]/10 px-3 py-2">
          <Text className="text-xs font-black text-[#fff4cf]/45">Coming soon</Text>
        </View>
      </View>
      {deploymentJob.programId ? (
        <Text
          selectable
          className="rounded-lg border border-[#fff4cf]/10 bg-[#fff4cf]/5 px-3 py-2 font-mono text-xs text-[#fff4cf]/55"
        >
          {deploymentJob.programId}
        </Text>
      ) : null}
    </View>
  )
}

function CvlrSpecCard({
  cvlrSpec,
  cvlrSpecApprovedAt,
  error,
  isApproving,
  isGenerating,
  verificationPropertiesApprovedAt,
  onApprove,
  onGenerate,
}: {
  cvlrSpec: CvlrSpec | null
  cvlrSpecApprovedAt: string | null
  error: string | null
  isApproving: boolean
  isGenerating: boolean
  verificationPropertiesApprovedAt: string | null
  onApprove: () => void
  onGenerate: () => void
}) {
  if (!verificationPropertiesApprovedAt) {
    return (
      <View className="gap-2 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-4">
        <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">Formal verification specs</Text>
        <Text className="text-lg font-black text-[#fff4cf]">Waiting on property approval</Text>
        <Text className="text-sm leading-6 text-[#fff4cf]/70">
          Approve the verification properties above before generating the specifications for formal verification.
        </Text>
      </View>
    )
  }

  const approved = Boolean(cvlrSpecApprovedAt)

  return (
    <View className="gap-4 rounded-lg border border-[#c8d6ff]/25 bg-[#1a1f2e] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-black uppercase tracking-widest text-[#c8d6ff]">Formal verification specs</Text>
          <Text className="text-2xl font-black leading-7 text-[#fff4cf]">
            {approved ? 'Spec approved' : cvlrSpec ? 'Review and approve' : 'Generate spec'}
          </Text>
          <Text className="text-sm leading-6 text-[#fff4cf]/70">
            {approved
              ? 'AI Composer will use this spec for generation. Editing properties will reset it.'
              : cvlrSpec
                ? 'Review the generated formal verification specifications. Approve to submit to AI Composer, or regenerate.'
                : 'Generate the formal verification specifications from the approved properties.'}
          </Text>
        </View>
        <View
          className={`rounded-full px-3 py-2 ${approved ? 'bg-[#75e6be]/15' : cvlrSpec ? 'bg-[#c8d6ff]/15' : 'bg-[#fff4cf]/10'}`}
        >
          <Text
            className={`text-xs font-black ${approved ? 'text-[#adf7e6]' : cvlrSpec ? 'text-[#c8d6ff]' : 'text-[#fff4cf]/55'}`}
          >
            {approved ? 'Approved' : cvlrSpec ? 'Ready' : 'Pending'}
          </Text>
        </View>
      </View>

      {cvlrSpec ? (
        <View className="gap-2 rounded-lg border border-[#c8d6ff]/15 bg-[#0d1117] p-3">
          <Text className="text-[10px] font-black uppercase tracking-widest text-[#c8d6ff]/55">checks.rs</Text>
          <Text selectable className="font-mono text-xs leading-5 text-[#c8d6ff]/85" numberOfLines={12}>
            {cvlrSpec.checksRs}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text className="rounded-lg border border-[#ff8a5c]/25 bg-[#ff8a5c]/10 px-3 py-2 text-sm text-[#ff8a5c]">
          {error}
        </Text>
      ) : null}

      {!approved ? (
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            disabled={isGenerating || isApproving}
            onPress={onGenerate}
            className={`items-center rounded-full px-4 py-3 ${isGenerating || isApproving ? 'bg-[#c8d6ff]/20' : 'bg-[#c8d6ff]/30 active:bg-[#c8d6ff]/50'}`}
          >
            <Text className="text-sm font-black text-[#c8d6ff]">
              {isGenerating
                ? 'Generating...'
                : cvlrSpec
                  ? 'Regenerate specifications'
                  : 'Generate formal verification specs'}
            </Text>
          </Pressable>

          {cvlrSpec ? (
            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={true}
                className="flex-1 items-center rounded-full bg-[#fff4cf]/10 px-4 py-3"
              >
                <Text className="text-sm font-black text-[#fff4cf]/35">Request Sec Pro review</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isApproving || isGenerating}
                onPress={onApprove}
                className={`flex-1 items-center rounded-full px-4 py-3 ${isApproving || isGenerating ? 'bg-[#75e6be]/20' : 'bg-[#75e6be] active:bg-[#adf7e6]'}`}
              >
                <Text
                  className={`text-sm font-black ${isApproving || isGenerating ? 'text-[#75e6be]/50' : 'text-[#0d3b35]'}`}
                >
                  {isApproving ? 'Approving...' : 'Approve specifications'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <Text className="rounded-xl border border-[#75e6be]/20 bg-[#75e6be]/10 px-3 py-2 text-sm leading-5 text-[#dffdf4]">
          Approved {formatSavedAt(cvlrSpecApprovedAt!)}. AI Composer generation is starting.
        </Text>
      )}
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
          Approve the Design Doc above before the app suggests the properties to prove.
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
          <Text className="text-2xl font-black leading-7 text-[#fff4cf]">Review the properties to prove</Text>
          <Text className="text-sm leading-6 text-[#fff4cf]/70">
            These proof targets come from the approved Design Doc and must be approved before the app generates formal
            verification specifications.
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
            <Text className="text-[10px] font-black uppercase tracking-widest text-[#fff4cf]/50">{property.label}</Text>
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

function DeploymentCard({
  accountAddress,
  deploymentError,
  deploymentJob,
  generationJob,
  isRefreshingDeploymentStatus,
  isSigningDeployment,
  isSubmittingDeployment,
  onRefresh,
  onSign,
  onStart,
  walletConnected,
}: {
  accountAddress?: string
  deploymentError: string | null
  deploymentJob: DeploymentJobRecord | null
  generationJob: GenerationJobRecord | null
  isRefreshingDeploymentStatus: boolean
  isSigningDeployment: boolean
  isSubmittingDeployment: boolean
  onRefresh: () => void
  onSign: () => void
  onStart: () => void
  walletConnected: boolean
}) {
  const deployableArtifact = getDeployableGenerationArtifact(generationJob)
  const deploymentStatus = deploymentJob?.status ?? ''
  const blocker = getDevnetDeploymentBlocker(
    {
      ...createInitialMvpShellState(),
      generationJob,
      deploymentJob,
    },
    walletConnected,
  )
  const hasSignatureRequest = Boolean(deploymentJob?.signatureRequest)
  const hasBlockingDeploymentJob =
    Boolean(deploymentJob) &&
    !hasSignatureRequest &&
    (isActiveDeploymentJob(deploymentStatus) || deploymentStatus === 'blocked' || deploymentStatus === 'succeeded')
  const deploymentBlocked = Boolean(blocker) || isSubmittingDeployment || hasBlockingDeploymentJob
  const startButtonLabel = isSubmittingDeployment
    ? 'Preparing deploy...'
    : deploymentStatus === 'succeeded'
      ? 'Deployed to devnet'
      : deploymentStatus === 'blocked'
        ? 'Refresh deployment'
        : blocker
          ? 'Deploy unavailable'
          : 'Deploy to devnet'

  return (
    <View className="gap-4 rounded-lg border border-[#75e6be]/25 bg-[#152f2d] p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Devnet deployment</Text>
          <Text className="text-2xl font-black leading-7 text-[#dffdf4]">Deploy generated program</Text>
          <Text className="text-sm leading-6 text-[#dffdf4]/70">
            Backend prepares the generated artifact. Your connected wallet signs the devnet deployment transaction.
          </Text>
        </View>
        <View className={`rounded-full px-3 py-2 ${getDeploymentStatusBadgeClass(deploymentJob?.status ?? 'ready')}`}>
          <Text className="text-xs font-black text-[#dffdf4]">
            {deploymentJob ? getDeploymentStatusLabel(deploymentJob.status) : deployableArtifact ? 'Ready' : 'Waiting'}
          </Text>
        </View>
      </View>

      {deployableArtifact ? (
        <View className="gap-1 rounded-lg border border-[#dffdf4]/12 bg-[#dffdf4]/6 p-3">
          <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Deployable artifact</Text>
          <Text className="text-sm font-black text-[#eef2ff]">{deployableArtifact.name}</Text>
          <Text selectable className="text-xs leading-5 text-[#dffdf4]/60">
            {deployableArtifact.artifactId}
          </Text>
        </View>
      ) : (
        <Text className="rounded-lg border border-[#eef2ff]/12 bg-[#eef2ff]/6 px-3 py-2 text-sm leading-5 text-[#eef2ff]/70">
          Generate a Solana program artifact before devnet deployment.
        </Text>
      )}

      {deploymentJob ? (
        <View className="gap-2 rounded-xl border border-[#75e6be]/20 bg-[#75e6be]/10 p-3">
          <Text className="text-xs font-black uppercase tracking-widest text-[#adf7e6]">Deployment job</Text>
          <Text className="text-sm font-semibold text-[#dffdf4]">{deploymentJob.summary}</Text>
          <Text selectable className="text-xs leading-5 text-[#dffdf4]/70">
            Job id: {deploymentJob.jobId}
          </Text>
          <Text className="text-xs leading-5 text-[#dffdf4]/70">Cluster: {deploymentJob.cluster}</Text>
          {deploymentJob.payerWallet ? (
            <Text className="text-xs leading-5 text-[#dffdf4]/70">
              Payer: {formatShortIdentifier(deploymentJob.payerWallet)}
            </Text>
          ) : null}
          {deploymentJob.authorityWallet ? (
            <Text className="text-xs leading-5 text-[#dffdf4]/70">
              Authority: {formatShortIdentifier(deploymentJob.authorityWallet)}
            </Text>
          ) : null}
          {deploymentJob.programId ? (
            <Text selectable className="text-xs leading-5 text-[#dffdf4]/70">
              Program id: {deploymentJob.programId}
            </Text>
          ) : null}
          {deploymentJob.transactionSignatures.length > 0 ? (
            <Text selectable className="text-xs leading-5 text-[#dffdf4]/70">
              Signature: {formatShortIdentifier(deploymentJob.transactionSignatures[0])}
            </Text>
          ) : null}
        </View>
      ) : null}

      {deploymentJob?.signatureRequest ? (
        <View className="gap-2 rounded-xl border border-[#ffd978]/25 bg-[#ffd978]/10 p-3">
          <Text className="text-xs font-black uppercase tracking-widest text-[#ffd978]">Before signing</Text>
          <Text className="text-sm font-black leading-5 text-[#fff4cf]">{DEVNET_DEPLOYMENT_DEMO_WARNING}</Text>
          <Text className="text-xs leading-5 text-[#fff4cf]/70">{deploymentJob.signatureRequest.summary}</Text>
          {deploymentJob.signatureRequest.simulationSummary ? (
            <Text className="text-xs leading-5 text-[#fff4cf]/70">
              Simulation: {deploymentJob.signatureRequest.simulationSummary}
            </Text>
          ) : null}
        </View>
      ) : null}

      {deploymentError ? (
        <Text className="rounded-xl border border-[#ff8a5c]/30 bg-[#ff8a5c]/10 px-3 py-2 text-sm leading-5 text-[#ffd2bd]">
          {deploymentError}
        </Text>
      ) : null}

      <View className="gap-2">
        {hasSignatureRequest ? (
          <Pressable
            accessibilityLabel="Sign devnet deployment transaction"
            accessibilityRole="button"
            disabled={isSigningDeployment}
            onPress={onSign}
            className={`items-center rounded-full px-4 py-3 ${isSigningDeployment ? 'bg-[#ffd978]/35' : 'bg-[#ffd978] active:bg-[#ffe6a3]'}`}
          >
            <Text className="text-sm font-black text-[#201626]">
              {isSigningDeployment ? 'Opening wallet...' : 'Sign devnet transaction'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="Deploy generated program to devnet"
            accessibilityRole="button"
            disabled={deploymentBlocked}
            onPress={onStart}
            className={`items-center rounded-full px-4 py-3 ${deploymentBlocked ? 'bg-[#75e6be]/25' : 'bg-[#75e6be] active:bg-[#9af2d7]'}`}
          >
            <Text className="text-sm font-black text-[#0d3b35]">{startButtonLabel}</Text>
          </Pressable>
        )}

        {deploymentJob ? (
          <Pressable
            accessibilityLabel="Refresh deployment status"
            accessibilityRole="button"
            disabled={isRefreshingDeploymentStatus}
            onPress={onRefresh}
            className={`items-center rounded-full px-4 py-2 ${isRefreshingDeploymentStatus ? 'bg-[#75e6be]/15' : 'bg-[#75e6be]/25 active:bg-[#75e6be]/35'}`}
          >
            <Text className="text-xs font-black text-[#dffdf4]">
              {isRefreshingDeploymentStatus ? 'Refreshing deployment...' : 'Refresh deployment'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {accountAddress ? (
        <Text className="text-xs leading-5 text-[#dffdf4]/55">
          Connected wallet: {formatShortIdentifier(accountAddress)}
        </Text>
      ) : null}
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
              <Text className="text-[10px] font-black uppercase tracking-widest text-[#adf7e6]">
                {artifact.typeLabel}
              </Text>
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
  approved = false,
  label,
  multiline = false,
  onApprove,
  onChangeText,
  onDiscuss,
  proposedText,
  value,
}: {
  approved?: boolean
  label: string
  multiline?: boolean
  onApprove?: () => void
  onChangeText: (value: string) => void
  onDiscuss?: () => void
  proposedText?: string | null
  value: string
}) {
  const proposedWording =
    proposedText && proposedText.trim() && proposedText.trim() !== value.trim() ? proposedText.trim() : null

  return (
    <View className="gap-2 rounded-2xl border border-[#eef2ff]/12 bg-[#eef2ff]/6 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="min-w-0 flex-1 text-xs font-black uppercase tracking-widest text-[#c8d6ff]">{label}</Text>
        <View className="flex-row items-center gap-2">
          {onDiscuss ? (
            <Pressable
              accessibilityLabel={`Discuss ${label}`}
              accessibilityRole="button"
              onPress={onDiscuss}
              className="rounded-full border border-[#c8d6ff]/20 bg-[#c8d6ff]/10 px-3 py-1.5 active:bg-[#c8d6ff]/20"
            >
              <Text className="text-[11px] font-black text-[#c8d6ff]">Change</Text>
            </Pressable>
          ) : null}
          {onApprove ? (
            <Pressable
              accessibilityLabel={`${approved ? 'Unapprove' : 'Approve'} ${label}`}
              accessibilityRole="button"
              onPress={onApprove}
              className={`h-8 w-8 items-center justify-center rounded-full ${approved ? 'bg-[#75e6be]' : 'border border-[#75e6be]/30 bg-[#75e6be]/10'}`}
            >
              <Text className={`text-base font-black ${approved ? 'text-[#0d3b35]' : 'text-[#adf7e6]'}`}>✓</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="rgba(238,242,255,0.35)"
        style={{ minHeight: multiline ? 88 : 46, textAlignVertical: multiline ? 'top' : 'center' }}
        className="rounded-xl border border-[#eef2ff]/12 bg-[#0d1117] px-4 py-3 text-sm font-semibold leading-6 text-[#eef2ff]"
        value={value}
      />
      {proposedWording ? (
        <View className="gap-2 rounded-xl border border-[#75e6be]/18 bg-[#75e6be]/8 p-3">
          <Text className="text-[10px] font-black uppercase tracking-widest text-[#adf7e6]">Proposed wording</Text>
          <Text className="text-xs leading-5 text-[#dffdf4]" style={{ textDecorationLine: 'underline' }}>
            {proposedWording}
          </Text>
        </View>
      ) : null}
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
  disabled = false,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  status,
  title,
  value,
}: {
  body: string
  disabled?: boolean
  onChangeText: (value: string) => void
  placeholder: string
  secureTextEntry?: boolean
  status: string
  title: string
  value: string
}) {
  return (
    <View className={`gap-3 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3 ${disabled ? 'opacity-60' : ''}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-black text-[#fff4cf]">{title}</Text>
          <Text className="mt-1 text-sm leading-5 text-[#fff4cf]/65">{body}</Text>
        </View>
        <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
          <Text className="text-xs font-black text-[#ffe6a3]">{status}</Text>
        </View>
      </View>

      <View
        className={`flex-row items-center gap-2 rounded-xl border border-[#fff4cf]/15 px-3 py-2 ${disabled ? 'bg-[#fff4cf]/5' : 'bg-[#fff4cf]/10'}`}
      >
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          className="min-w-0 flex-1 text-sm font-semibold text-[#fff4cf]"
          editable={!disabled}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={disabled ? 'rgba(255,244,207,0.25)' : 'rgba(255,244,207,0.45)'}
          secureTextEntry={secureTextEntry}
          value={value}
        />
        {value && !disabled ? (
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
  projectTitle,
  projectSummary,
  publishedAt,
  verificationProperties,
}: {
  exploreTab: ExploreTab
  onExploreTabChange: (tab: ExploreTab) => void
  projectTitle: string | null
  projectSummary: string | null
  publishedAt: string | null
  verificationProperties: VerificationProperty[]
}) {
  return (
    <View className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-2xl font-black leading-7 text-[#fff4cf]">Community projects</Text>
          <Text className="mt-2 text-sm leading-5 text-[#fff4cf]/70">
            Projects and properties shared by builders who opted in from their Workspace.
          </Text>
        </View>
        <View className="rounded-full bg-[#ffd978]/15 px-3 py-2">
          <Text className="text-xs font-black text-[#ffe6a3]">Opt-in</Text>
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

      {exploreTab === 'projects' ? (
        <View className="gap-3">
          <SectionTitle title="Published projects" badge={publishedAt ? '1 project' : 'None yet'} />
          {publishedAt && projectTitle ? (
            <View className="flex-row items-center gap-3 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3">
              <View className="h-14 w-11 rounded-lg border border-[#75e6be]/25 bg-[#75e6be]/20" />
              <View className="min-w-0 flex-1">
                <Text className="text-base font-black text-[#fff4cf]">{projectTitle}</Text>
                {projectSummary ? (
                  <Text className="text-sm leading-5 text-[#fff4cf]/65" numberOfLines={2}>
                    {projectSummary}
                  </Text>
                ) : null}
              </View>
              <View className="rounded-full bg-[#75e6be]/15 px-3 py-2">
                <Text className="text-xs font-black text-[#adf7e6]">Published</Text>
              </View>
            </View>
          ) : (
            <View className="gap-2 rounded-lg border border-[#fff4cf]/10 bg-[#fff4cf]/5 p-4">
              <Text className="text-base font-black text-[#fff4cf]">No published projects yet</Text>
              <Text className="text-sm leading-5 text-[#fff4cf]/55">
                Projects appear here when builders opt in from their Workspace.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {exploreTab === 'properties' ? (
        <View className="gap-3">
          <SectionTitle
            title="Published properties"
            badge={publishedAt && verificationProperties.length > 0 ? `${verificationProperties.length}` : 'None yet'}
          />
          {publishedAt && verificationProperties.length > 0 ? (
            verificationProperties.map((property) => (
              <View key={property.id} className="gap-1 rounded-lg border border-[#fff4cf]/15 bg-[#2d1e37] p-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-sm font-black text-[#fff4cf]">{property.label}</Text>
                  <View className="rounded-full bg-[#ffd978]/15 px-3 py-1">
                    <Text className="text-[10px] font-black text-[#ffe6a3]">Property</Text>
                  </View>
                </View>
                <Text className="text-sm leading-5 text-[#fff4cf]/65">{property.statement}</Text>
              </View>
            ))
          ) : (
            <View className="gap-2 rounded-lg border border-[#fff4cf]/10 bg-[#fff4cf]/5 p-4">
              <Text className="text-base font-black text-[#fff4cf]">No published properties yet</Text>
              <Text className="text-sm leading-5 text-[#fff4cf]/55">
                Verification properties appear here once a builder publishes their project.
              </Text>
            </View>
          )}
        </View>
      ) : null}
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
            accessibilityLabel={`Open ${tab.label} tab`}
            accessibilityRole="button"
            onPress={() => onChangeTab(tab.key)}
            testID={`${tab.key}-tab-button`}
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
