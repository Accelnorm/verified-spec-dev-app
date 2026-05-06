const assert = require('node:assert/strict')
const test = require('node:test')

const {
  bytesToBase64,
  readDeploymentJobStatus,
  submitDeploymentSignature,
  submitDevnetDeploymentJob,
} = require('../.tmp-test-dist/features/mvp-shell/deployment.js')

test('submitDevnetDeploymentJob posts artifact and wallet authority to the backend', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 201,
      async json() {
        return {
          job_id: 'dep_123',
          status: 'blocked',
          summary: 'Wallet signature required.',
          status_url: '/jobs/dep_123',
          created_at: '2026-05-06T02:00:00Z',
          updated_at: '2026-05-06T02:00:00Z',
          cluster: 'devnet',
          source_artifact_id: 'artifact_1',
          payer_wallet: 'wallet_abc',
          authority_wallet: 'wallet_abc',
          authority_mode: 'user_wallet_demo_authority',
          program_id: null,
          transaction_signatures: [],
          deployment_refs: [],
          verification_status_at_deploy: 'succeeded',
          signature_request: {
            request_id: 'sigreq_1',
            transaction_base64: 'AQID',
            min_context_slot: 42,
            summary: 'Deploy artifact_1 to devnet.',
            simulation_summary: 'Simulation passed.',
          },
        }
      },
    }
  }

  const response = await submitDevnetDeploymentJob({
    artifact: {
      artifactId: 'artifact_1',
      name: 'program.so',
      typeLabel: 'program_binary',
      path: 'artifacts/program.so',
      summary: 'Generated program binary.',
    },
    authorityWallet: 'wallet_abc',
    backendBaseUrl: 'http://127.0.0.1:8000/',
    payerWallet: 'wallet_abc',
    projectId: 'proj_1',
    verificationStatusAcknowledged: 'succeeded',
  })

  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/projects/proj_1/jobs/deployment/devnet')
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    artifact_id: 'artifact_1',
    authority_mode: 'user_wallet_demo_authority',
    authority_wallet: 'wallet_abc',
    cluster: 'devnet',
    payer_wallet: 'wallet_abc',
    verification_status_acknowledged: 'succeeded',
  })
  assert.equal(response.jobId, 'dep_123')
  assert.equal(response.cluster, 'devnet')
  assert.equal(response.signatureRequest.requestId, 'sigreq_1')
  assert.equal(response.signatureRequest.minContextSlot, '42')
})

test('submitDeploymentSignature returns updated deployment status', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/jobs/dep_123/deployment-signature')
    assert.deepEqual(JSON.parse(options.body), {
      signature_base64: 'BAUG',
      signature_request_id: 'sigreq_1',
    })
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          job_id: 'dep_123',
          status: 'running',
          summary: 'Deployment transaction submitted.',
          status_url: '/jobs/dep_123',
          created_at: '2026-05-06T02:00:00Z',
          updated_at: '2026-05-06T02:01:00Z',
          cluster: 'devnet',
          source_artifact_id: 'artifact_1',
          payer_wallet: 'wallet_abc',
          authority_wallet: 'wallet_abc',
          authority_mode: 'user_wallet_demo_authority',
          program_id: null,
          transaction_signatures: ['txsig_1'],
          deployment_refs: [],
          verification_status_at_deploy: 'succeeded',
          signature_request: null,
        }
      },
    }
  }

  const response = await submitDeploymentSignature({
    backendBaseUrl: 'http://127.0.0.1:8000',
    job: {
      jobId: 'dep_123',
      status: 'blocked',
      summary: 'Wallet signature required.',
      statusUrl: '/jobs/dep_123',
      createdAt: '2026-05-06T02:00:00Z',
      updatedAt: '2026-05-06T02:00:00Z',
      cluster: 'devnet',
      sourceArtifactId: 'artifact_1',
      payerWallet: 'wallet_abc',
      authorityWallet: 'wallet_abc',
      authorityMode: 'user_wallet_demo_authority',
      programId: null,
      transactionSignatures: [],
      deploymentRefs: [],
      verificationStatusAtDeploy: 'succeeded',
      signatureRequest: {
        requestId: 'sigreq_1',
        transactionBase64: 'AQID',
        minContextSlot: '42',
        summary: 'Deploy artifact_1 to devnet.',
        simulationSummary: 'Simulation passed.',
      },
    },
    signatureBase64: 'BAUG',
  })

  assert.equal(response.status, 'running')
  assert.deepEqual(response.transactionSignatures, ['txsig_1'])
  assert.equal(response.signatureRequest, null)
})

test('readDeploymentJobStatus falls back to unavailable when the backend cannot return the job', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 404,
    async json() {
      return { detail: 'deployment job not found' }
    },
  })

  const response = await readDeploymentJobStatus({
    backendBaseUrl: 'http://127.0.0.1:8000',
    job: {
      jobId: 'dep_missing',
      status: 'queued',
      summary: 'Deployment queued.',
      statusUrl: '/jobs/dep_missing',
      createdAt: '2026-05-06T02:00:00Z',
      updatedAt: '2026-05-06T02:00:00Z',
      cluster: 'devnet',
      sourceArtifactId: 'artifact_1',
      payerWallet: 'wallet_abc',
      authorityWallet: 'wallet_abc',
      authorityMode: 'user_wallet_demo_authority',
      programId: null,
      transactionSignatures: [],
      deploymentRefs: [],
      verificationStatusAtDeploy: 'succeeded',
      signatureRequest: null,
    },
    nowIso: '2026-05-06T02:02:00Z',
  })

  assert.equal(response.status, 'unavailable')
  assert.equal(response.summary, 'Deployment status is unavailable right now. Try again when the backend is reachable.')
  assert.equal(response.updatedAt, '2026-05-06T02:02:00Z')
})

test('bytesToBase64 serializes wallet signature bytes for backend reconciliation', () => {
  assert.equal(bytesToBase64(Uint8Array.from([4, 5, 6])), 'BAUG')
})
