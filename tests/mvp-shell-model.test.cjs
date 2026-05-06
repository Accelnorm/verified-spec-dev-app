const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MVP_CAPTURE_ACK,
  createInitialMvpShellState,
  restoreMvpShellState,
  serializeMvpShellState,
  submitPrompt,
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
