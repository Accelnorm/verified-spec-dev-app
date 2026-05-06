const assert = require('node:assert/strict')
const test = require('node:test')

const { buildGenerationRequest, createInitialMvpShellState, submitPrompt } = require('../.tmp-test-dist/features/mvp-shell/model.js')
const { readGenerationJobStatus, submitGenerationJob } = require('../.tmp-test-dist/features/mvp-shell/generation.js')

test('buildGenerationRequest turns the current design doc into the backend request shape', () => {
  const state = submitPrompt(
    createInitialMvpShellState(),
    'Build a chat-first mobile MVP for hackathon judging.',
    (() => {
      const ids = ['user-1', 'app-1']
      return () => ids.shift()
    })(),
    '2026-05-06T01:05:00Z'
  )

  const request = buildGenerationRequest(state)

  assert.deepEqual(request, {
    title: 'Chat-first mobile MVP',
    workflow_mode: 'generate',
    project_type: 'solana_mobile_app',
    design_doc: [
      '# Chat-first mobile MVP',
      '',
      '## Goal',
      'Deliver chat-first mobile mvp through a hackathon-ready MVP flow before generation starts.',
      '',
      '## Core requirements',
      '- Capture the user prompt as the project seed and keep it visible during review.',
      '- Turn chat-first mobile mvp into one editable MVP Design Doc with clear requirements.',
      '- Keep the Design Doc ready for a later backend generation submission without requiring extra setup.',
      '',
      '## Assumptions',
      '- The first generated Design Doc is a concise MVP draft that the user can refine in-app.',
      '- Generation, verification, and deployment stay outside this review step until the backend contract is available.',
      '',
      '## Missing information',
      '- Success criteria or acceptance checks that define a finished MVP outcome.',
      '- Any integration, wallet, or backend constraints that must shape generation later.',
    ].join('\n'),
  })
})

test('submitGenerationJob posts the request to the backend and returns the stable queued job response', async () => {
  const request = {
    title: 'Marketplace MVP',
    workflow_mode: 'generate',
    project_type: 'solana_mobile_app',
    design_doc: '# Marketplace MVP\n\nBuild a local hackathon demo.',
  }

  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 201,
      async json() {
        return {
          job_id: 'gen_626153431ac5aa23a5fafb40',
          stage: 'generation',
          status: 'queued',
          attempt: 1,
          retry_eligible: false,
          timeout_seconds: 900,
          status_url: '/jobs/gen_626153431ac5aa23a5fafb40',
          created_at: '2026-05-06T01:02:03Z',
          updated_at: '2026-05-06T01:02:03Z',
          summary: 'Generation job queued for AI Composer.',
          artifact_refs: [],
          artifacts: [],
          error: null,
        }
      },
    }
  }

  const response = await submitGenerationJob({
    backendBaseUrl: 'http://127.0.0.1:8000',
    request,
  })

  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/jobs/generation')
  assert.equal(fetchCalls[0].options.method, 'POST')
  assert.equal(fetchCalls[0].options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), request)
  assert.equal(response.jobId, 'gen_626153431ac5aa23a5fafb40')
  assert.equal(response.status, 'queued')
  assert.equal(response.summary, 'Generation job queued for AI Composer.')
  assert.equal(response.statusUrl, '/jobs/gen_626153431ac5aa23a5fafb40')
  assert.deepEqual(response.artifactRefs, [])
  assert.deepEqual(response.artifacts, [])
})

test('readGenerationJobStatus fetches the latest backend job state by job id', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          job_id: 'gen_live_status',
          stage: 'generation',
          status: 'running',
          attempt: 1,
          retry_eligible: false,
          timeout_seconds: 900,
          status_url: '/jobs/gen_live_status',
          created_at: '2026-05-06T01:10:00Z',
          updated_at: '2026-05-06T01:11:00Z',
          summary: 'AI Composer generation is running.',
          artifact_refs: [],
          artifacts: [],
          provider: 'zai',
          model: 'glm-5.1',
          error: null,
        }
      },
    }
  }

  const response = await readGenerationJobStatus({
    backendBaseUrl: 'http://127.0.0.1:8000',
    job: {
      jobId: 'gen_live_status',
      status: 'queued',
      summary: 'Generation job queued for AI Composer.',
      statusUrl: '/jobs/gen_live_status',
      createdAt: '2026-05-06T01:10:00Z',
      updatedAt: '2026-05-06T01:10:00Z',
    },
    nowIso: '2026-05-06T01:11:30Z',
  })

  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/jobs/gen_live_status')
  assert.equal(fetchCalls[0].options.method, 'GET')
  assert.equal(response.status, 'running')
  assert.equal(response.summary, 'AI Composer generation is running.')
  assert.equal(response.updatedAt, '2026-05-06T01:11:00Z')
  assert.equal(response.providerLabel, 'zai')
  assert.equal(response.modelLabel, 'glm-5.1')
})

test('readGenerationJobStatus keeps artifact metadata when the backend reports a succeeded job', async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        job_id: 'gen_succeeded',
        stage: 'generation',
        status: 'succeeded',
        attempt: 1,
        retry_eligible: false,
        timeout_seconds: 900,
        status_url: '/jobs/gen_succeeded',
        created_at: '2026-05-06T01:10:00Z',
        updated_at: '2026-05-06T01:15:00Z',
        summary: 'AI Composer generation completed.',
        artifact_refs: ['artifact_1'],
        artifacts: [
          {
            artifact_id: 'artifact_1',
            name: 'program.so',
            type_label: 'program_binary',
            path: 'artifacts/program.so',
            summary: 'Generated program binary.',
          },
        ],
        provider: 'zai',
        model: 'glm-5.1',
        error: null,
      }
    },
  })

  const response = await readGenerationJobStatus({
    backendBaseUrl: 'http://127.0.0.1:8000',
    job: {
      jobId: 'gen_succeeded',
      status: 'running',
      summary: 'AI Composer generation is running.',
      statusUrl: '/jobs/gen_succeeded',
      createdAt: '2026-05-06T01:10:00Z',
      updatedAt: '2026-05-06T01:10:00Z',
      artifactRefs: [],
      artifacts: [],
      providerLabel: null,
      modelLabel: null,
    },
    nowIso: '2026-05-06T01:15:10Z',
  })

  assert.equal(response.status, 'succeeded')
  assert.equal(response.artifactRefs[0], 'artifact_1')
  assert.equal(response.artifacts[0].name, 'program.so')
  assert.equal(response.providerLabel, 'zai')
  assert.equal(response.modelLabel, 'glm-5.1')
})

test('readGenerationJobStatus falls back to an unavailable state when the backend cannot return the job', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 404,
    async json() {
      return { detail: 'generation job not found' }
    },
  })

  const response = await readGenerationJobStatus({
    backendBaseUrl: 'http://127.0.0.1:8000',
    job: {
      jobId: 'gen_missing',
      status: 'queued',
      summary: 'Generation job queued for AI Composer.',
      statusUrl: '/jobs/gen_missing',
      createdAt: '2026-05-06T01:10:00Z',
      updatedAt: '2026-05-06T01:10:00Z',
    },
    nowIso: '2026-05-06T01:12:00Z',
  })

  assert.equal(response.jobId, 'gen_missing')
  assert.equal(response.status, 'unavailable')
  assert.equal(response.summary, 'Generation status is unavailable right now. Try again when the backend is reachable.')
  assert.equal(response.updatedAt, '2026-05-06T01:12:00Z')
})

test('readGenerationJobStatus falls back to unavailable when the backend never responds before the refresh timeout', async () => {
  global.fetch = async () => await new Promise(() => {})

  const response = await readGenerationJobStatus({
    backendBaseUrl: 'http://127.0.0.1:8000',
    job: {
      jobId: 'gen_hung',
      status: 'running',
      summary: 'AI Composer generation is running.',
      statusUrl: '/jobs/gen_hung',
      createdAt: '2026-05-06T01:10:00Z',
      updatedAt: '2026-05-06T01:10:00Z',
    },
    nowIso: '2026-05-06T01:13:00Z',
    timeoutMs: 1,
  })

  assert.equal(response.status, 'unavailable')
  assert.equal(response.summary, 'Generation status is unavailable right now. Try again when the backend is reachable.')
  assert.equal(response.updatedAt, '2026-05-06T01:13:00Z')
})
