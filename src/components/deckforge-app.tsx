import { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

type PrimaryTab = 'explore' | 'chat' | 'workspace'
type WorkflowMode = 'Vibe' | 'Pro'
type ExploreTab = 'projects' | 'properties'
type Message = {
  id: string
  side: 'user' | 'app'
  text: string
}
type AppSettings = {
  certoraApiKey: string
  easAuth: string
  expoAccount: string
}
type Suggestion = {
  id: string
  label: string
  title: string
  body: string
  detail: string
  impact: string
}

const suggestions: Suggestion[] = [
  {
    id: 'buyer-pause',
    label: 'Suggestion 01',
    title: 'Buyer pauses alone',
    body: 'Resolve the blocker quickly, then review dispute abuse risk.',
    detail:
      'This keeps the happy path fast but needs a bounded pause window and a penalty rule before generation should proceed.',
    impact: 'Fastest unblock',
  },
  {
    id: 'mutual-pause',
    label: 'Suggestion 02',
    title: 'Mutual pause lock',
    body: 'Require both parties before funded milestones can stop.',
    detail: 'This is stronger for neutrality, but the program spec needs an escape hatch when one party disappears.',
    impact: 'Safer default',
  },
  {
    id: 'arbiter-pause',
    label: 'Suggestion 03',
    title: 'Arbiter can pause',
    body: 'Route disputes through a recognized reviewer wallet.',
    detail:
      'This supports a service-work marketplace model, but the trust model must be named before verification properties can be inferred.',
    impact: 'Best for review',
  },
  {
    id: 'timed-release',
    label: 'Suggestion 04',
    title: 'Timed release rule',
    body: 'Let funds release after a deadline unless a dispute exists.',
    detail:
      'This adds liveness to the escrow flow and creates a clean property target for deadline and dispute invariants.',
    impact: 'Good property target',
  },
]

const initialMessages: Message[] = [
  {
    id: 'm1',
    side: 'user',
    text: 'Build milestone escrow with dispute windows and release approvals.',
  },
  {
    id: 'm2',
    side: 'app',
    text: 'Generation is blocked on one rule: who can pause after funding. Pick a suggested next action or ask a new question.',
  },
]

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

function getWalletErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/websocket|connection|associate|authorize|wallet/i.test(message)) {
    return 'Wallet connection failed. Unlock your wallet and try again.'
  }

  return 'Wallet action failed. Try again from your wallet.'
}

export function SpecDrivenApp() {
  const { account, connect, disconnect } = useMobileWallet()
  const [activeTab, setActiveTab] = useState<PrimaryTab>('chat')
  const [mode, setMode] = useState<WorkflowMode>('Pro')
  const [suggestionPage, setSuggestionPage] = useState(0)
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [followUpDraft, setFollowUpDraft] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [exploreTab, setExploreTab] = useState<ExploreTab>('projects')
  const [walletError, setWalletError] = useState<string | null>(null)
  const [appSettings, setAppSettings] = useState<AppSettings>({
    certoraApiKey: '',
    easAuth: '',
    expoAccount: '',
  })

  const accountAddress = account?.address.toString()
  const visibleSuggestions = suggestions.slice(suggestionPage * 2, suggestionPage * 2 + 2)
  const screenKey = `${activeTab}-${selectedSuggestion ? selectedSuggestion.id : 'main'}-${exploreTab}`

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

  function handleSendMessage() {
    const cleanDraft = draft.trim()

    if (!cleanDraft) {
      return
    }

    const now = Date.now()
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: `user-${now}`, side: 'user', text: cleanDraft },
      {
        id: `app-${now}`,
        side: 'app',
        text: 'Captured locally. Backend chat and AI Composer job execution are not connected in this template yet.',
      },
    ])
    setDraft('')
  }

  function handleSuggestionPress(suggestion: Suggestion) {
    setSelectedSuggestion(suggestion)
    setFollowUpDraft('')
    setFollowUpNote('')
  }

  function handleFollowUpSend() {
    if (!followUpDraft.trim()) {
      return
    }

    setFollowUpNote('Follow-up note captured locally. A backend proposal context is still required.')
    setFollowUpDraft('')
  }

  function updateAppSetting(key: keyof AppSettings, value: string) {
    setAppSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value,
    }))
  }

  function showPreviousSuggestions() {
    setSuggestionPage((currentPage) => (currentPage === 0 ? 1 : 0))
  }

  function showNextSuggestions() {
    setSuggestionPage((currentPage) => (currentPage === 1 ? 0 : 1))
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
                messages={messages}
                selectedSuggestion={selectedSuggestion}
                suggestionPage={suggestionPage}
                visibleSuggestions={visibleSuggestions}
                onBackFromSuggestion={() => setSelectedSuggestion(null)}
                onChangeDraft={setDraft}
                onChangeFollowUpDraft={setFollowUpDraft}
                onFollowUpSend={handleFollowUpSend}
                onNextSuggestions={showNextSuggestions}
                onPreviousSuggestions={showPreviousSuggestions}
                onSendMessage={handleSendMessage}
                onSuggestionPress={handleSuggestionPress}
              />
            ) : null}

            {activeTab === 'workspace' ? (
              <WorkspaceView
                accountAddress={accountAddress}
                appSettings={appSettings}
                mode={mode}
                walletConnected={Boolean(account)}
                onAppSettingChange={updateAppSetting}
                onModeChange={setMode}
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
  messages,
  selectedSuggestion,
  suggestionPage,
  visibleSuggestions,
  onBackFromSuggestion,
  onChangeDraft,
  onChangeFollowUpDraft,
  onFollowUpSend,
  onNextSuggestions,
  onPreviousSuggestions,
  onSendMessage,
  onSuggestionPress,
}: {
  draft: string
  followUpDraft: string
  followUpNote: string
  messages: Message[]
  selectedSuggestion: Suggestion | null
  suggestionPage: number
  visibleSuggestions: Suggestion[]
  onBackFromSuggestion: () => void
  onChangeDraft: (value: string) => void
  onChangeFollowUpDraft: (value: string) => void
  onFollowUpSend: () => void
  onNextSuggestions: () => void
  onPreviousSuggestions: () => void
  onSendMessage: () => void
  onSuggestionPress: (suggestion: Suggestion) => void
}) {
  if (selectedSuggestion) {
    return (
      <SuggestionFollowUpView
        draft={followUpDraft}
        note={followUpNote}
        suggestion={selectedSuggestion}
        onBack={onBackFromSuggestion}
        onChangeDraft={onChangeFollowUpDraft}
        onSend={onFollowUpSend}
      />
    )
  }

  return (
    <View className="flex-1 justify-between gap-3">
      <View className="gap-3">
        <View className="gap-2">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </View>

        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-[#ffd978]">
              Suggestions
            </Text>
            <Text className="text-xs font-bold text-[#fff4cf]/55">{suggestionPage === 0 ? '1-2' : '3-4'} of 4</Text>
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
      </View>

      <Composer
        draft={draft}
        placeholder="Ask about dispute lock..."
        onChangeDraft={onChangeDraft}
        onSend={onSendMessage}
      />
    </View>
  )
}

function SuggestionFollowUpView({
  draft,
  note,
  suggestion,
  onBack,
  onChangeDraft,
  onSend,
}: {
  draft: string
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
        placeholder="Discuss only this suggestion..."
        onChangeDraft={onChangeDraft}
        onSend={onSend}
      />
    </View>
  )
}

function ModeSwitch({ mode, onModeChange }: { mode: WorkflowMode; onModeChange: (value: WorkflowMode) => void }) {
  return (
    <View className="flex-row rounded-full border border-[#fff4cf]/10 bg-[#fff4cf]/10 p-1">
      {(['Vibe', 'Pro'] as WorkflowMode[]).map((option) => {
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

function MessageBubble({ message }: { message: Message }) {
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
  placeholder,
  onChangeDraft,
  onSend,
}: {
  draft: string
  placeholder: string
  onChangeDraft: (value: string) => void
  onSend: () => void
}) {
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
        multiline
        onChangeText={onChangeDraft}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,244,207,0.45)"
        style={{ maxHeight: 112, textAlignVertical: 'top' }}
        value={draft}
      />
      <Pressable
        accessibilityLabel="Send message"
        accessibilityRole="button"
        onPress={onSend}
        className="h-9 w-9 items-center justify-center rounded-full bg-[#ffd978] active:bg-[#ffe6a3]"
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
  mode,
  onAppSettingChange,
  onModeChange,
  onWalletPress,
  walletConnected,
}: {
  accountAddress?: string
  appSettings: AppSettings
  mode: WorkflowMode
  onAppSettingChange: (key: keyof AppSettings, value: string) => void
  onModeChange: (value: WorkflowMode) => void
  onWalletPress: () => void
  walletConnected: boolean
}) {
  return (
    <View className="gap-4">
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
