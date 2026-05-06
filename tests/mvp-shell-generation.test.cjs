const assert = require('node:assert/strict')
const test = require('node:test')

const { buildGenerationRequest, createInitialMvpShellState, submitPrompt } = require('../.tmp-test-dist/features/mvp-shell/model.js')
const { submitGenerationJob } = require('../.tmp-test-dist/features/mvp-shell/generation.js')

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
})
