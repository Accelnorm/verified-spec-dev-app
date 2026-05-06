const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MVP_CAPTURE_ACK,
  approveDesignDoc,
  approveVerificationProperties,
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
  updateDesignDocField,
  updateDesignDocListField,
  updateWorkflowMode,
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
  assert.equal(nextState.workflowMode, 'professional_development')
  assert.deepEqual(
    nextState.messages.slice(-2),
    [
      {
        id: 'user-1',
        side: 'user',
        text: 'Build a Solana mobile app that turns chat into one MVP design doc.',
        source: 'prompt_seed',
      },
      {
        id: 'app-1',
        side: 'app',
        text: MVP_CAPTURE_ACK,
      },
    ]
  )
})

test('workflow mode is preserved across prompt submission and serialization', () => {
  const initialState = updateWorkflowMode(createInitialMvpShellState(), 'vibe_coding')
  const savedState = submitPrompt(
    initialState,
    'Build a marketplace MVP.',
    (() => {
      const ids = ['user-1', 'app-1']
      return () => ids.shift()
    })(),
    '2026-05-06T01:05:00Z'
  )

  const restoredState = restoreMvpShellState(serializeMvpShellState(savedState))

  assert.equal(savedState.workflowMode, 'vibe_coding')
  assert.equal(restoredState?.workflowMode, 'vibe_coding')
})

test('generation blocker reflects strict Vibe and Pro gates', () => {
  const promptState = submitPrompt(
    createInitialMvpShellState(),
    'Build a marketplace MVP.',
    (() => {
      const ids = ['user-1', 'app-1']
      return () => ids.shift()
    })(),
    '2026-05-06T01:05:00Z'
  )
  const vibeState = updateWorkflowMode(promptState, 'vibe_coding')
  const readyState = approveVerificationProperties(
    approveDesignDoc(updateDesignDocListField(vibeState, 'missingInformation', ''), '2026-05-06T01:06:00Z'),
    '2026-05-06T01:07:00Z'
  )

  assert.match(getGenerationBlocker(promptState), /Answer or clear/)
  assert.match(getGenerationBlocker(vibeState), /Use AI defaults/)
  assert.equal(getGenerationBlocker(readyState), null)
})

test('approving the Design Doc proposes properties before generation can run', () => {
  const promptState = updateDesignDocListField(
    submitPrompt(
      createInitialMvpShellState(),
      'Build a marketplace MVP.',
      (() => {
        const ids = ['user-1', 'app-1']
        return () => ids.shift()
      })(),
      '2026-05-06T01:05:00Z'
    ),
    'missingInformation',
    ''
  )

  assert.equal(getGenerationBlocker(promptState), 'Approve the Design Doc in Workspace before generation.')

  const designApprovedState = approveDesignDoc(promptState, '2026-05-06T01:06:00Z')

  assert.equal(designApprovedState.designDocApprovedAt, '2026-05-06T01:06:00Z')
  assert.equal(designApprovedState.verificationProperties.length, 3)
  assert.equal(getGenerationBlocker(designApprovedState), 'Review and approve the properties to prove before generation.')

  const propertiesApprovedState = approveVerificationProperties(designApprovedState, '2026-05-06T01:07:00Z')

  assert.equal(propertiesApprovedState.verificationPropertiesApprovedAt, '2026-05-06T01:07:00Z')
  assert.equal(getGenerationBlocker(propertiesApprovedState), null)
})

test('editing an approved Design Doc resets Design Doc and property approvals', () => {
  const approvedState = approveVerificationProperties(
    approveDesignDoc(
      updateDesignDocListField(
        submitPrompt(
          createInitialMvpShellState(),
          'Build a marketplace MVP.',
          (() => {
            const ids = ['user-1', 'app-1']
            return () => ids.shift()
          })(),
          '2026-05-06T01:05:00Z'
        ),
        'missingInformation',
        ''
      ),
      '2026-05-06T01:06:00Z'
    ),
    '2026-05-06T01:07:00Z'
  )

  const editedState = updateDesignDocField(approvedState, 'goal', 'Refined approved goal.')

  assert.equal(editedState.designDocApprovedAt, null)
  assert.deepEqual(editedState.verificationProperties, [])
  assert.equal(editedState.verificationPropertiesApprovedAt, null)
})

test('backend refresh preserves local approvals when the Design Doc has not changed', () => {
  const baseState = updateDesignDocListField(
    submitPrompt(
      createInitialMvpShellState(),
      'Build a marketplace MVP.',
      (() => {
        const ids = ['user-1', 'app-1']
        return () => ids.shift()
      })(),
      '2026-05-06T01:05:00Z'
    ),
    'missingInformation',
    ''
  )
  const localState = approveVerificationProperties(
    approveDesignDoc(baseState, '2026-05-06T01:06:00Z'),
    '2026-05-06T01:07:00Z'
  )
  const backendState = {
    ...baseState,
    messages: [...baseState.messages, { id: 'app-2', side: 'app', text: 'Backend reply.' }],
    designDocApprovedAt: null,
    verificationProperties: [],
    verificationPropertiesApprovedAt: null,
  }

  const mergedState = mergeBackendProjectState(backendState, localState)

  assert.equal(mergedState.messages.at(-1)?.text, 'Backend reply.')
  assert.equal(mergedState.designDocApprovedAt, '2026-05-06T01:06:00Z')
  assert.equal(mergedState.verificationProperties.length, 3)
  assert.equal(mergedState.verificationPropertiesApprovedAt, '2026-05-06T01:07:00Z')
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
  assert.deepEqual(restoredState?.suggestions, [])
  assert.equal(restoredState?.workflowMode, 'professional_development')
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

test('serialized shell state preserves generated suggestions', () => {
  const savedState = {
    ...submitPrompt(
      createInitialMvpShellState(),
      'Build a marketplace MVP',
      (() => {
        const ids = ['user-1', 'app-1']
        return () => ids.shift()
      })(),
      '2026-05-06T00:10:00Z'
    ),
    suggestions: [
      {
        id: 'sug_define_acceptance',
        label: 'Suggestion 01',
        title: 'Define acceptance checks',
        body: 'Name the checks that prove the MVP is ready.',
        detail: 'Use this to lock the test bar before generation starts.',
        impact: 'Clearer readiness',
        createdAt: '2026-05-06T01:10:00Z',
      },
    ],
  }

  const restoredState = restoreMvpShellState(serializeMvpShellState(savedState))

  assert.equal(restoredState?.suggestions[0].id, 'sug_define_acceptance')
  assert.equal(restoredState?.suggestions[0].title, 'Define acceptance checks')
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
    artifactRefs: [],
    artifacts: [],
    providerLabel: null,
    modelLabel: null,
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

test('hasRenderableGenerationResult only returns true for succeeded jobs with artifacts', () => {
  assert.equal(
    hasRenderableGenerationResult({
      jobId: 'gen_result',
      status: 'succeeded',
      summary: 'AI Composer generation completed.',
      statusUrl: '/jobs/gen_result',
      createdAt: '2026-05-06T01:10:00Z',
      updatedAt: '2026-05-06T01:10:00Z',
      artifactRefs: ['artifact_1'],
      artifacts: [
        {
          artifactId: 'artifact_1',
          name: 'program.so',
          typeLabel: 'program_binary',
          path: 'artifacts/program.so',
          summary: 'Generated program binary.',
        },
      ],
      providerLabel: 'zai',
      modelLabel: 'glm-5.1',
    }),
    true
  )

  assert.equal(
    hasRenderableGenerationResult({
      jobId: 'gen_missing_artifacts',
      status: 'succeeded',
      summary: 'AI Composer generation completed.',
      statusUrl: '/jobs/gen_missing_artifacts',
      createdAt: '2026-05-06T01:10:00Z',
      updatedAt: '2026-05-06T01:10:00Z',
      artifactRefs: [],
      artifacts: [],
      providerLabel: null,
      modelLabel: null,
    }),
    false
  )
})

test('getGenerationResultIssue surfaces a backend-result issue when success arrives without artifacts', () => {
  assert.equal(
    getGenerationResultIssue({
      jobId: 'gen_missing_artifacts',
      status: 'succeeded',
      summary: 'AI Composer generation completed.',
      statusUrl: '/jobs/gen_missing_artifacts',
      createdAt: '2026-05-06T01:10:00Z',
      updatedAt: '2026-05-06T01:10:00Z',
      artifactRefs: [],
      artifacts: [],
      providerLabel: null,
      modelLabel: null,
    }),
    'Backend returned a succeeded generation without generated artifacts.'
  )
})
