const assert = require('node:assert/strict')
const test = require('node:test')

const {
  approveProjectDesignDoc,
  approveProjectVerificationProperties,
  applyVibeDefaultsToProject,
  capturePromptToProject,
  listProjectSummaries,
  sendProjectChatMessage,
  updateProjectWorkflowMode,
} = require('../.tmp-test-dist/features/mvp-shell/backend.js')

function projectSnapshotPayload() {
  return {
    project: {
      project_id: 'proj_chat',
      title: 'Marketplace MVP',
      workflow_mode: 'vibe_coding',
      created_at: '2026-05-06T01:00:00Z',
      updated_at: '2026-05-06T01:10:00Z',
    },
    messages: [
      {
        message_id: 'msg_user',
        project_id: 'proj_chat',
        side: 'user',
        text: 'Build a marketplace MVP.',
        created_at: '2026-05-06T01:00:00Z',
        source: 'prompt_seed',
      },
      {
        message_id: 'msg_followup',
        project_id: 'proj_chat',
        side: 'user',
        text: 'Use a mutual pause rule.',
        created_at: '2026-05-06T01:09:00Z',
        source: 'suggestion',
      },
      {
        message_id: 'msg_app',
        project_id: 'proj_chat',
        side: 'app',
        text: 'I drafted the MVP Design Doc and highlighted the missing decisions.',
        created_at: '2026-05-06T01:10:00Z',
        source: 'main',
      },
    ],
    design_doc: {
      project_id: 'proj_chat',
      title: 'Marketplace MVP',
      goal: 'Clarify the marketplace MVP before generation.',
      core_requirements: ['Persist project chat messages.'],
      assumptions: ['Backend owns provider credentials.'],
      missing_information: ['Which acceptance checks prove the MVP is ready?'],
      updated_at: '2026-05-06T01:10:00Z',
    },
    design_doc_approved_at: null,
    verification_properties: [],
    verification_properties_approved_at: null,
    suggestions: [
      {
        suggestion_id: 'sug_define_acceptance',
        project_id: 'proj_chat',
        label: 'Suggestion 01',
        title: 'Define acceptance checks',
        body: 'Name the checks that prove the MVP is ready.',
        detail: 'Use this to lock the test bar before generation starts.',
        impact: 'Clearer readiness',
        created_at: '2026-05-06T01:10:00Z',
      },
    ],
    latest_job: null,
  }
}

test('sendProjectChatMessage posts project-scoped follow-up context and returns normalized state', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 201,
      async json() {
        return projectSnapshotPayload()
      },
    }
  }

  const snapshot = await sendProjectChatMessage({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_chat',
    message: 'Use a mutual pause rule.',
    context: {
      source: 'suggestion',
      suggestionId: 'mutual-pause',
      suggestionTitle: 'Mutual pause lock',
    },
  })

  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/projects/proj_chat/chat/messages')
  assert.equal(fetchCalls[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    message: 'Use a mutual pause rule.',
    context: {
      source: 'suggestion',
      suggestion_id: 'mutual-pause',
      suggestion_title: 'Mutual pause lock',
    },
  })
  assert.equal(snapshot.projectId, 'proj_chat')
  assert.equal(snapshot.workflowMode, 'vibe_coding')
  assert.equal(snapshot.state.workflowMode, 'vibe_coding')
  assert.equal(snapshot.state.messages.at(-1).text, 'I drafted the MVP Design Doc and highlighted the missing decisions.')
  assert.equal(snapshot.state.designDoc.title, 'Marketplace MVP')
  assert.equal(snapshot.state.latestPromptSeed.prompt, 'Build a marketplace MVP.')
  assert.equal(snapshot.state.suggestions[0].id, 'sug_define_acceptance')
  assert.equal(snapshot.state.suggestions[0].title, 'Define acceptance checks')
})

test('capturePromptToProject sends selected workflow mode', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 201,
      async json() {
        return projectSnapshotPayload()
      },
    }
  }

  await capturePromptToProject({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: null,
    prompt: 'Build a marketplace MVP.',
    workflowMode: 'vibe_coding',
  })

  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    project_id: null,
    prompt: 'Build a marketplace MVP.',
    workflow_mode: 'vibe_coding',
  })
})

test('listProjectSummaries returns route-ready project titles and ids', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/projects')
    assert.equal(options.method, 'GET')
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          projects: [
            {
              project_id: 'proj_chat',
              title: 'Marketplace MVP',
              workflow_mode: 'vibe_coding',
              created_at: '2026-05-06T01:00:00Z',
              updated_at: '2026-05-06T01:10:00Z',
            },
          ],
        }
      },
    }
  }

  const projects = await listProjectSummaries('http://127.0.0.1:8000')

  assert.deepEqual(projects, [
    {
      projectId: 'proj_chat',
      title: 'Marketplace MVP',
      workflowMode: 'vibe_coding',
      updatedAt: '2026-05-06T01:10:00Z',
    },
  ])
})

test('updateProjectWorkflowMode persists explicit mode changes through backend API', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 200,
      async json() {
        return projectSnapshotPayload()
      },
    }
  }

  const snapshot = await updateProjectWorkflowMode({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_chat',
    workflowMode: 'vibe_coding',
  })

  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/projects/proj_chat/workflow-mode')
  assert.equal(fetchCalls[0].options.method, 'PUT')
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), { workflow_mode: 'vibe_coding' })
  assert.equal(snapshot.state.workflowMode, 'vibe_coding')
})

test('applyVibeDefaultsToProject returns normalized refreshed project state', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/projects/proj_chat/design-doc/apply-vibe-defaults')
    assert.equal(options.method, 'POST')
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ...projectSnapshotPayload(),
          design_doc: {
            ...projectSnapshotPayload().design_doc,
            assumptions: ['Backend owns provider credentials.', 'AI default: use generated tests as acceptance checks.'],
            missing_information: [],
          },
        }
      },
    }
  }

  const snapshot = await applyVibeDefaultsToProject({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_chat',
  })

  assert.deepEqual(snapshot.state.designDoc.missingInformation, [])
  assert.equal(snapshot.state.designDoc.assumptions.at(-1), 'AI default: use generated tests as acceptance checks.')
})

test('approveProjectDesignDoc posts approval endpoint and normalizes proposed properties', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/projects/proj_chat/design-doc/approve')
    assert.equal(options.method, 'POST')
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ...projectSnapshotPayload(),
          design_doc_approved_at: '2026-05-06T02:00:00Z',
          verification_properties: [
            {
              property_id: 'prop_preserve_goal',
              label: 'Property 01',
              statement: 'Generation preserves the approved goal.',
              rationale: 'Backend proposal keeps the proof target explicit.',
            },
          ],
          verification_properties_approved_at: null,
        }
      },
    }
  }

  const snapshot = await approveProjectDesignDoc({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_chat',
  })

  assert.equal(snapshot.state.designDocApprovedAt, '2026-05-06T02:00:00Z')
  assert.equal(snapshot.state.verificationProperties[0].id, 'prop_preserve_goal')
  assert.equal(snapshot.state.verificationProperties[0].statement, 'Generation preserves the approved goal.')
  assert.equal(snapshot.state.verificationPropertiesApprovedAt, null)
})

test('approveProjectVerificationProperties posts approval endpoint and normalizes approval timestamp', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/projects/proj_chat/verification-properties/approve')
    assert.equal(options.method, 'POST')
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ...projectSnapshotPayload(),
          design_doc_approved_at: '2026-05-06T02:00:00Z',
          verification_properties: [
            {
              id: 'prop_backend_id',
              label: 'Property 01',
              statement: 'Generation preserves the approved goal.',
              rationale: 'Backend proposal keeps the proof target explicit.',
            },
          ],
          verification_properties_approved_at: '2026-05-06T02:05:00Z',
        }
      },
    }
  }

  const snapshot = await approveProjectVerificationProperties({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_chat',
  })

  assert.equal(snapshot.state.designDocApprovedAt, '2026-05-06T02:00:00Z')
  assert.equal(snapshot.state.verificationProperties[0].id, 'prop_backend_id')
  assert.equal(snapshot.state.verificationPropertiesApprovedAt, '2026-05-06T02:05:00Z')
})

test('prompt seed normalization ignores later main follow-up messages', async () => {
  global.fetch = async () => ({
    ok: true,
    status: 201,
    async json() {
      return {
        ...projectSnapshotPayload(),
        messages: [
          {
            message_id: 'msg_seed',
            project_id: 'proj_chat',
            side: 'user',
            text: 'Build a marketplace MVP.',
            created_at: '2026-05-06T01:00:00Z',
            source: 'prompt_seed',
          },
          {
            message_id: 'msg_seed_reply',
            project_id: 'proj_chat',
            side: 'app',
            text: 'I drafted the MVP Design Doc.',
            created_at: '2026-05-06T01:01:00Z',
            source: 'main',
          },
          {
            message_id: 'msg_followup',
            project_id: 'proj_chat',
            side: 'user',
            text: 'Ask one missing-information question.',
            created_at: '2026-05-06T01:02:00Z',
            source: 'main',
          },
          {
            message_id: 'msg_followup_reply',
            project_id: 'proj_chat',
            side: 'app',
            text: 'Which acceptance checks should define success?',
            created_at: '2026-05-06T01:03:00Z',
            source: 'main',
          },
        ],
      }
    },
  })

  const snapshot = await sendProjectChatMessage({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_chat',
    message: 'Ask one missing-information question.',
    context: { source: 'main' },
  })

  assert.equal(snapshot.state.latestPromptSeed.prompt, 'Build a marketplace MVP.')
  assert.equal(snapshot.state.suggestions.length, 1)
})

test('project snapshot normalization treats missing backend suggestions as empty', async () => {
  global.fetch = async () => ({
    ok: true,
    status: 201,
    async json() {
      const payload = projectSnapshotPayload()
      delete payload.suggestions
      return payload
    },
  })

  const snapshot = await sendProjectChatMessage({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_chat',
    message: 'Ask one missing-information question.',
    context: { source: 'main' },
  })

  assert.deepEqual(snapshot.state.suggestions, [])
})

test('sendProjectChatMessage hides backend details behind a stable mobile error', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 503,
    async json() {
      return { detail: { code: 'provider_failure', message: 'provider key failed at /home/user/secret' } }
    },
  })

  await assert.rejects(
    sendProjectChatMessage({
      backendBaseUrl: 'http://127.0.0.1:8000',
      projectId: 'proj_chat',
      message: 'Use a mutual pause rule.',
      context: { source: 'suggestion' },
    }),
    /Backend clarification is unavailable right now/
  )
})
