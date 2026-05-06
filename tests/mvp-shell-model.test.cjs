const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MVP_CAPTURE_ACK,
  saveGenerationJob,
  createInitialMvpShellState,
  getGenerationStatusLabel,
  restoreMvpShellState,
  serializeMvpShellState,
  submitPrompt,
  updateDesignDocField,
} = require('../.tmp-test-dist/features/mvp-shell/model.js')

test('submitPrompt stores the latest prompt seed and appends a visible confirmation', () => {
  const initialState = createInitialMvpShellState()

  const nextState = submitPrompt(
    initialState,
    '  Build a Solana mobile app that turns chat into one MVP design doc.  ',
    (() => {
      const ids = ['user-1', 'app-1']
      return () => ids.shift()
    })(),
    '2026-05-05T23:59:00Z'
  )

  assert.equal(nextState.latestPromptSeed?.prompt, 'Build a Solana mobile app that turns chat into one MVP design doc.')
  assert.equal(nextState.latestPromptSeed?.updatedAt, '2026-05-05T23:59:00Z')
  assert.deepEqual(
    nextState.messages.slice(-2),
    [
      {
        id: 'user-1',
        side: 'user',
        text: 'Build a Solana mobile app that turns chat into one MVP design doc.',
      },
      {
        id: 'app-1',
        side: 'app',
        text: MVP_CAPTURE_ACK,
      },
    ]
  )
})

test('blank prompt does not mutate state', () => {
  const initialState = createInitialMvpShellState()
  const nextState = submitPrompt(initialState, '   ', () => 'unused', '2026-05-05T23:59:00Z')

  assert.equal(nextState, initialState)
})

test('a later prompt replaces the seed so it survives navigation as the current project prompt', () => {
  const firstState = submitPrompt(
    createInitialMvpShellState(),
    'First prompt',
    (() => {
      const ids = ['user-1', 'app-1']
      return () => ids.shift()
    })(),
    '2026-05-05T23:59:00Z'
  )

  const secondState = submitPrompt(
    firstState,
    'Second prompt for the actual MVP',
    (() => {
      const ids = ['user-2', 'app-2']
      return () => ids.shift()
    })(),
    '2026-05-06T00:01:00Z'
  )

  assert.equal(secondState.latestPromptSeed?.prompt, 'Second prompt for the actual MVP')
  assert.equal(secondState.latestPromptSeed?.updatedAt, '2026-05-06T00:01:00Z')
  assert.equal(secondState.messages.at(-2)?.text, 'Second prompt for the actual MVP')
})

test('submitPrompt provisions one editable MVP design doc from the latest prompt seed', () => {
  const nextState = submitPrompt(
    createInitialMvpShellState(),
    'Build a mobile escrow app that turns chat prompts into hackathon-ready design docs with clear generation steps.',
    (() => {
      const ids = ['user-1', 'app-1']
      return () => ids.shift()
    })(),
    '2026-05-06T00:30:00Z'
  )

  assert.equal(nextState.designDoc?.title, 'Mobile escrow app MVP')
  assert.match(nextState.designDoc?.goal ?? '', /hackathon/i)
  assert.equal(nextState.designDoc?.coreRequirements.length, 3)
  assert.equal(nextState.designDoc?.assumptions.length, 2)
  assert.equal(nextState.designDoc?.missingInformation.length, 2)
})

test('updateDesignDocField keeps user edits across serialization and restore', () => {
  const savedState = updateDesignDocField(
    submitPrompt(
      createInitialMvpShellState(),
      'Build a mobile escrow app that turns chat prompts into hackathon-ready design docs.',
      (() => {
        const ids = ['user-1', 'app-1']
        return () => ids.shift()
      })(),
      '2026-05-06T00:30:00Z'
    ),
    'goal',
    'Deliver one editable MVP design doc before generation starts.'
  )

  const restoredState = restoreMvpShellState(serializeMvpShellState(savedState))

  assert.equal(restoredState?.designDoc?.goal, 'Deliver one editable MVP design doc before generation starts.')
  assert.equal(restoredState?.designDoc?.title, 'Mobile escrow app MVP')
})

test('restoreMvpShellState backfills one MVP design doc for legacy saved prompt-only state', () => {
  const restoredState = restoreMvpShellState(
    JSON.stringify({
      messages: [
        { id: 'welcome-1', side: 'app', text: 'Describe the app or program you want to build.' },
        { id: 'user-1', side: 'user', text: 'Build a mobile escrow app for a hackathon demo.' },
      ],
      latestPromptSeed: {
        prompt: 'Build a mobile escrow app for a hackathon demo.',
        updatedAt: '2026-05-06T00:40:00Z',
      },
    })
  )

  assert.equal(restoredState?.designDoc?.title, 'Mobile escrow app MVP')
  assert.match(restoredState?.designDoc?.goal ?? '', /hackathon-ready/i)
})

test('serialized shell state can be restored after a relaunch without losing the latest prompt seed', () => {
  const savedState = submitPrompt(
    createInitialMvpShellState(),
    'Persist this prompt across a cold start',
    (() => {
      const ids = ['user-1', 'app-1']
      return () => ids.shift()
    })(),
    '2026-05-06T00:10:00Z'
  )

  const restoredState = restoreMvpShellState(serializeMvpShellState(savedState))

  assert.deepEqual(restoredState, savedState)
})

test('restoreMvpShellState rejects malformed stored payloads', () => {
  const restoredState = restoreMvpShellState(
    JSON.stringify({
      messages: [{ id: 'bad-1', side: 'system', text: 'nope' }],
      latestPromptSeed: { prompt: 'Broken', updatedAt: 123 },
    })
  )

  assert.equal(restoredState, null)
})

test('saveGenerationJob preserves the stable backend job id across serialization and restore', () => {
  const stateWithPrompt = submitPrompt(
    createInitialMvpShellState(),
    'Build a local hackathon app',
    (() => {
      const ids = ['user-1', 'app-1']
      return () => ids.shift()
    })(),
    '2026-05-06T01:10:00Z'
  )

  const savedState = saveGenerationJob(stateWithPrompt, {
    jobId: 'gen_626153431ac5aa23a5fafb40',
    status: 'queued',
    summary: 'Generation job queued for AI Composer.',
    statusUrl: '/jobs/gen_626153431ac5aa23a5fafb40',
    createdAt: '2026-05-06T01:02:03Z',
    updatedAt: '2026-05-06T01:02:03Z',
  })

  const restoredState = restoreMvpShellState(serializeMvpShellState(savedState))

  assert.equal(restoredState?.generationJob?.jobId, 'gen_626153431ac5aa23a5fafb40')
  assert.equal(restoredState?.generationJob?.status, 'queued')
})

test('getGenerationStatusLabel collapses backend-specific failures into the truthful minimal mobile states', () => {
  assert.equal(getGenerationStatusLabel('queued'), 'Queued')
  assert.equal(getGenerationStatusLabel('running'), 'Running')
  assert.equal(getGenerationStatusLabel('succeeded'), 'Succeeded')
  assert.equal(getGenerationStatusLabel('failed'), 'Failed')
  assert.equal(getGenerationStatusLabel('timed_out'), 'Failed')
  assert.equal(getGenerationStatusLabel('canceled'), 'Failed')
  assert.equal(getGenerationStatusLabel('unavailable'), 'Unavailable')
  assert.equal(getGenerationStatusLabel('anything-else'), 'Unavailable')
})
