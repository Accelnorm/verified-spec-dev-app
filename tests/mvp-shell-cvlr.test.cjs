const assert = require('node:assert/strict')
const test = require('node:test')

const { generateCvlrSpec } = require('../.tmp-test-dist/features/mvp-shell/cvlr.js')
const { approveProjectCvlrSpec } = require('../.tmp-test-dist/features/mvp-shell/backend.js')
const {
  approveDesignDoc,
  approveCvlrSpec,
  approveVerificationProperties,
  buildGenerationRequest,
  createInitialMvpShellState,
  getCvlrApprovalBlocker,
  getCvlrSpecBlocker,
  getGenerationBlocker,
  saveCvlrSpec,
  submitPrompt,
} = require('../.tmp-test-dist/features/mvp-shell/model.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerificationProperties() {
  return [
    {
      id: 'prop_1',
      label: 'Property 01',
      statement: 'Total supply never exceeds cap.',
      rationale: 'Prevents unlimited minting.',
    },
    {
      id: 'prop_2',
      label: 'Property 02',
      statement: 'Only the authority may mint.',
      rationale: 'Enforces access control.',
    },
  ]
}

function makeDesignDoc() {
  return {
    title: 'Token MVP',
    goal: 'Issue a capped SPL token on Solana.',
    coreRequirements: ['Fixed supply cap', 'Authority-gated minting'],
    assumptions: ['Single mint authority for the demo'],
    missingInformation: [],
    updatedAt: '2026-05-06T10:00:00Z',
  }
}

function cvlrSpecResponse() {
  return {
    checks_rs: '#[rule]\npub fn rule_mint_cap() { cvlr_assert!(true); }',
    system_doc_txt: 'Token MVP\n\nOverview\n- Issues a capped SPL token.',
    generated_at: '2026-05-06T10:05:00Z',
  }
}

// ---------------------------------------------------------------------------
// generateCvlrSpec
// ---------------------------------------------------------------------------

test('generateCvlrSpec posts verification properties and design doc markdown to the project cvlr-specs endpoint', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 201,
      async json() {
        return cvlrSpecResponse()
      },
    }
  }

  const spec = await generateCvlrSpec({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_token',
    verificationProperties: makeVerificationProperties(),
    designDoc: makeDesignDoc(),
  })

  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/projects/proj_token/cvlr-specs')
  assert.equal(fetchCalls[0].options.method, 'POST')

  const body = JSON.parse(fetchCalls[0].options.body)
  assert.equal(body.verification_properties.length, 2)
  assert.equal(body.verification_properties[0].label, 'Property 01')
  assert.equal(body.verification_properties[0].statement, 'Total supply never exceeds cap.')
  assert.equal(body.verification_properties[0].rationale, 'Prevents unlimited minting.')
  assert.ok(body.design_doc_markdown.includes('# Token MVP'))
  assert.ok(body.design_doc_markdown.includes('## Goal'))
  assert.ok(body.design_doc_markdown.includes('Issue a capped SPL token on Solana.'))

  // id is not sent — only label/statement/rationale belong in the spec request
  assert.equal(body.verification_properties[0].id, undefined)
})

test('generateCvlrSpec normalizes the backend response into a CvlrSpec', async () => {
  global.fetch = async () => ({
    ok: true,
    status: 201,
    async json() {
      return cvlrSpecResponse()
    },
  })

  const spec = await generateCvlrSpec({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_token',
    verificationProperties: makeVerificationProperties(),
    designDoc: makeDesignDoc(),
  })

  assert.equal(spec.checksRs, '#[rule]\npub fn rule_mint_cap() { cvlr_assert!(true); }')
  assert.equal(spec.systemDocTxt, 'Token MVP\n\nOverview\n- Issues a capped SPL token.')
  assert.equal(spec.generatedAt, '2026-05-06T10:05:00Z')
})

test('generateCvlrSpec strips trailing slash from backendBaseUrl', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return { ok: true, status: 201, async json() { return cvlrSpecResponse() } }
  }

  await generateCvlrSpec({
    backendBaseUrl: 'http://127.0.0.1:8000/',
    projectId: 'proj_token',
    verificationProperties: makeVerificationProperties(),
    designDoc: makeDesignDoc(),
  })

  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/projects/proj_token/cvlr-specs')
})

test('generateCvlrSpec throws with backend error message on non-ok response', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 422,
    async json() {
      return { detail: 'Verification properties must be non-empty.' }
    },
  })

  await assert.rejects(
    () =>
      generateCvlrSpec({
        backendBaseUrl: 'http://127.0.0.1:8000',
        projectId: 'proj_token',
        verificationProperties: makeVerificationProperties(),
        designDoc: makeDesignDoc(),
      }),
    (err) => {
      assert.ok(err.message.includes('Verification properties must be non-empty.'))
      return true
    },
  )
})

test('generateCvlrSpec throws with fallback message when backend returns no detail', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 500,
    async json() {
      return {}
    },
  })

  await assert.rejects(
    () =>
      generateCvlrSpec({
        backendBaseUrl: 'http://127.0.0.1:8000',
        projectId: 'proj_token',
        verificationProperties: makeVerificationProperties(),
        designDoc: makeDesignDoc(),
      }),
    (err) => {
      assert.ok(err.message.includes('CVLR spec generation failed'))
      return true
    },
  )
})

// ---------------------------------------------------------------------------
// getCvlrSpecBlocker
// ---------------------------------------------------------------------------

test('getCvlrSpecBlocker blocks when there are no verification properties', () => {
  const state = createInitialMvpShellState()
  assert.ok(getCvlrSpecBlocker(state) !== null)
  assert.ok(getCvlrSpecBlocker(state).includes('Verification properties'))
})

test('getCvlrSpecBlocker blocks when properties exist but are not approved', () => {
  const baseState = submitPrompt(
    createInitialMvpShellState(),
    'Build a token MVP.',
    (() => { const ids = ['u1', 'a1']; return () => ids.shift() })(),
    '2026-05-06T10:00:00Z',
  )
  const state = {
    ...baseState,
    verificationProperties: makeVerificationProperties(),
    verificationPropertiesApprovedAt: null,
  }
  assert.ok(getCvlrSpecBlocker(state) !== null)
  assert.ok(getCvlrSpecBlocker(state).includes('Approve'))
})

test('getCvlrSpecBlocker returns null when properties are approved', () => {
  const baseState = submitPrompt(
    createInitialMvpShellState(),
    'Build a token MVP.',
    (() => { const ids = ['u1', 'a1']; return () => ids.shift() })(),
    '2026-05-06T10:00:00Z',
  )
  const afterDesignDoc = approveDesignDoc(baseState, '2026-05-06T10:01:00Z')
  const withProps = { ...afterDesignDoc, verificationProperties: makeVerificationProperties() }
  const approved = approveVerificationProperties(withProps, '2026-05-06T10:02:00Z')
  assert.equal(getCvlrSpecBlocker(approved), null)
})

// ---------------------------------------------------------------------------
// getGenerationBlocker — cvlrSpec gate
// ---------------------------------------------------------------------------

test('getGenerationBlocker blocks when cvlrSpec is null even after properties are approved', () => {
  const baseState = submitPrompt(
    { ...createInitialMvpShellState() },
    'Build a token MVP.',
    (() => { const ids = ['u1', 'a1']; return () => ids.shift() })(),
    '2026-05-06T10:00:00Z',
  )
  const afterDesignDoc = approveDesignDoc(
    { ...baseState, designDoc: { ...baseState.designDoc, missingInformation: [] } },
    '2026-05-06T10:01:00Z',
  )
  const withProps = { ...afterDesignDoc, verificationProperties: makeVerificationProperties() }
  const approved = approveVerificationProperties(withProps, '2026-05-06T10:02:00Z')

  assert.ok(approved.cvlrSpec === null)
  const blocker = getGenerationBlocker(approved)
  assert.ok(blocker !== null)
  assert.ok(blocker.includes('CVLR'))
})

test('getGenerationBlocker blocks on missing CVLR approval even when spec exists', () => {
  const baseState = submitPrompt(
    createInitialMvpShellState(),
    'Build a token MVP.',
    (() => { const ids = ['u1', 'a1']; return () => ids.shift() })(),
    '2026-05-06T10:00:00Z',
  )
  const afterDesignDoc = approveDesignDoc(
    { ...baseState, designDoc: { ...baseState.designDoc, missingInformation: [] } },
    '2026-05-06T10:01:00Z',
  )
  const withProps = { ...afterDesignDoc, verificationProperties: makeVerificationProperties() }
  const approved = approveVerificationProperties(withProps, '2026-05-06T10:02:00Z')
  const withSpec = saveCvlrSpec(approved, {
    checksRs: '#[rule] pub fn rule_cap() {}',
    systemDocTxt: 'Token MVP',
    generatedAt: '2026-05-06T10:05:00Z',
  })

  assert.equal(getGenerationBlocker(withSpec), 'Approve the CVLR specs before generation.')
})

test('getGenerationBlocker returns null when cvlrSpec is present and approved', () => {
  const baseState = submitPrompt(
    createInitialMvpShellState(),
    'Build a token MVP.',
    (() => { const ids = ['u1', 'a1']; return () => ids.shift() })(),
    '2026-05-06T10:00:00Z',
  )
  const afterDesignDoc = approveDesignDoc(
    { ...baseState, designDoc: { ...baseState.designDoc, missingInformation: [] } },
    '2026-05-06T10:01:00Z',
  )
  const withProps = { ...afterDesignDoc, verificationProperties: makeVerificationProperties() }
  const approved = approveVerificationProperties(withProps, '2026-05-06T10:02:00Z')
  const withSpec = saveCvlrSpec(approved, {
    checksRs: '#[rule] pub fn rule_cap() {}',
    systemDocTxt: 'Token MVP',
    generatedAt: '2026-05-06T10:05:00Z',
  })
  const withApprovedSpec = approveCvlrSpec(withSpec, '2026-05-06T10:06:00Z')

  assert.equal(getGenerationBlocker(withApprovedSpec), null)
})

// ---------------------------------------------------------------------------
// buildGenerationRequest — cvlr_specs_ready flag
// ---------------------------------------------------------------------------

test('buildGenerationRequest sets cvlr_specs_ready true when a cvlrSpec is present', () => {
  const baseState = submitPrompt(
    createInitialMvpShellState(),
    'Build a token MVP.',
    (() => { const ids = ['u1', 'a1']; return () => ids.shift() })(),
    '2026-05-06T10:00:00Z',
  )
  const withSpec = saveCvlrSpec(baseState, {
    checksRs: '#[rule] pub fn rule_cap() {}',
    systemDocTxt: 'Token MVP',
    generatedAt: '2026-05-06T10:05:00Z',
  })

  const request = buildGenerationRequest(withSpec)
  assert.equal(request.cvlr_specs_ready, true)
})

test('buildGenerationRequest omits cvlr_specs_ready when no cvlrSpec', () => {
  const state = submitPrompt(
    createInitialMvpShellState(),
    'Build a token MVP.',
    (() => { const ids = ['u1', 'a1']; return () => ids.shift() })(),
    '2026-05-06T10:00:00Z',
  )

  const request = buildGenerationRequest(state)
  assert.equal(request.cvlr_specs_ready, undefined)
})

// ---------------------------------------------------------------------------
// approveVerificationProperties clears cvlrSpec
// ---------------------------------------------------------------------------

test('approveVerificationProperties clears an existing cvlrSpec so stale specs cannot be used for generation', () => {
  const baseState = submitPrompt(
    createInitialMvpShellState(),
    'Build a token MVP.',
    (() => { const ids = ['u1', 'a1']; return () => ids.shift() })(),
    '2026-05-06T10:00:00Z',
  )
  const afterDesignDoc = approveDesignDoc(
    { ...baseState, designDoc: { ...baseState.designDoc, missingInformation: [] } },
    '2026-05-06T10:01:00Z',
  )
  const withProps = { ...afterDesignDoc, verificationProperties: makeVerificationProperties() }
  const withSpec = saveCvlrSpec(withProps, {
    checksRs: '#[rule] pub fn rule_old() {}',
    systemDocTxt: 'old',
    generatedAt: '2026-05-06T09:00:00Z',
  })

  // Re-approving properties (e.g. after editing them) must clear the old spec and its approval
  const reApproved = approveVerificationProperties(withSpec, '2026-05-06T10:10:00Z')
  assert.equal(reApproved.cvlrSpec, null)
  assert.equal(reApproved.cvlrSpecApprovedAt, null)
})

// ---------------------------------------------------------------------------
// approveCvlrSpec
// ---------------------------------------------------------------------------

test('approveCvlrSpec records the approval timestamp', () => {
  const base = { ...createInitialMvpShellState(), cvlrSpec: {
    checksRs: '#[rule] pub fn rule_cap() {}',
    systemDocTxt: 'Token MVP',
    generatedAt: '2026-05-06T10:05:00Z',
  } }
  const approved = approveCvlrSpec(base, '2026-05-06T10:06:00Z')
  assert.equal(approved.cvlrSpecApprovedAt, '2026-05-06T10:06:00Z')
  assert.ok(approved.cvlrSpec !== null)
})

test('approveCvlrSpec is a no-op when no spec exists', () => {
  const base = createInitialMvpShellState()
  assert.equal(base.cvlrSpec, null)
  const result = approveCvlrSpec(base, '2026-05-06T10:06:00Z')
  assert.equal(result.cvlrSpecApprovedAt, null)
})

test('saveCvlrSpec clears a prior approval so a regenerated spec requires re-approval', () => {
  const withApproval = {
    ...createInitialMvpShellState(),
    cvlrSpec: { checksRs: 'old', systemDocTxt: 'old', generatedAt: '2026-05-06T09:00:00Z' },
    cvlrSpecApprovedAt: '2026-05-06T09:01:00Z',
  }
  const updated = saveCvlrSpec(withApproval, {
    checksRs: 'new',
    systemDocTxt: 'new',
    generatedAt: '2026-05-06T10:05:00Z',
  })
  assert.equal(updated.cvlrSpec.checksRs, 'new')
  assert.equal(updated.cvlrSpecApprovedAt, null)
})

// ---------------------------------------------------------------------------
// getCvlrApprovalBlocker
// ---------------------------------------------------------------------------

test('getCvlrApprovalBlocker blocks when no spec has been generated', () => {
  const state = createInitialMvpShellState()
  const blocker = getCvlrApprovalBlocker(state)
  assert.ok(blocker !== null)
  assert.ok(blocker.includes('Generate'))
})

test('getCvlrApprovalBlocker returns null when spec exists', () => {
  const state = {
    ...createInitialMvpShellState(),
    cvlrSpec: { checksRs: '#[rule]', systemDocTxt: 'doc', generatedAt: '2026-05-06T10:05:00Z' },
  }
  assert.equal(getCvlrApprovalBlocker(state), null)
})

// ---------------------------------------------------------------------------
// approveProjectCvlrSpec (backend)
// ---------------------------------------------------------------------------

function projectSnapshotWithJob() {
  return {
    project: {
      project_id: 'proj_token',
      title: 'Token MVP',
      workflow_mode: 'professional_development',
      cvlr_spec_approved_at: '2026-05-06T10:06:00Z',
      created_at: '2026-05-06T10:00:00Z',
      updated_at: '2026-05-06T10:06:00Z',
    },
    messages: [],
    design_doc: null,
    cvlr_spec_approved_at: '2026-05-06T10:06:00Z',
    latest_job: {
      job_id: 'job_composer_1',
      status: 'running',
      summary: 'AI Composer generating Solana program.',
      status_url: 'http://backend/jobs/job_composer_1',
      created_at: '2026-05-06T10:06:01Z',
      updated_at: '2026-05-06T10:06:01Z',
      artifact_refs: [],
      artifacts: [],
    },
  }
}

test('approveProjectCvlrSpec posts to the cvlr-specs/approve endpoint and returns a snapshot with a running generation job', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 200,
      async json() {
        return projectSnapshotWithJob()
      },
    }
  }

  const snapshot = await approveProjectCvlrSpec({
    backendBaseUrl: 'http://127.0.0.1:8000',
    projectId: 'proj_token',
  })

  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/projects/proj_token/cvlr-specs/approve')
  assert.equal(fetchCalls[0].options.method, 'POST')

  assert.equal(snapshot.projectId, 'proj_token')
  assert.equal(snapshot.state.cvlrSpecApprovedAt, '2026-05-06T10:06:00Z')
  assert.ok(snapshot.state.generationJob !== null)
  assert.equal(snapshot.state.generationJob.jobId, 'job_composer_1')
  assert.equal(snapshot.state.generationJob.status, 'running')
})

test('approveProjectCvlrSpec throws on non-ok response', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 400,
    async json() { return {} },
  })

  await assert.rejects(
    () => approveProjectCvlrSpec({ backendBaseUrl: 'http://127.0.0.1:8000', projectId: 'proj_token' }),
    (err) => {
      assert.ok(err.message.includes('CVLR spec approval failed'))
      return true
    },
  )
})

// ---------------------------------------------------------------------------
// secProReviewRequestedAt — placeholder for the disabled Sec Pro review button
// ---------------------------------------------------------------------------

test('initial state has secProReviewRequestedAt as null', () => {
  const state = createInitialMvpShellState()
  assert.equal(state.secProReviewRequestedAt, null)
})

test('secProReviewRequestedAt survives serialization and restoration', () => {
  const { serializeMvpShellState, restoreMvpShellState } = require('../.tmp-test-dist/features/mvp-shell/model.js')
  const state = { ...createInitialMvpShellState(), secProReviewRequestedAt: '2026-05-06T10:07:00Z' }
  const restored = restoreMvpShellState(serializeMvpShellState(state))
  assert.equal(restored.secProReviewRequestedAt, '2026-05-06T10:07:00Z')
})
