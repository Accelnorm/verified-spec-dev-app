const assert = require('node:assert/strict')
const test = require('node:test')

const {
  bytesToBase64,
  readDeploymentJobStatus,
  recoverDeploymentPayment,
  submitDeploymentPayment,
  submitDevnetDeploymentJob,
} = require('../.tmp-test-dist/features/mvp-shell/deployment.js')

test('submitDevnetDeploymentJob posts artifact and Squads authority to the backend', async () => {
  const fetchCalls = []
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return {
      ok: true,
      status: 201,
      async json() {
        return {
          job_id: 'dep_123',
          status: 'payment_required',
          summary: 'Prepayment required.',
          status_url: '/jobs/dep_123',
          created_at: '2026-05-06T02:00:00Z',
          updated_at: '2026-05-06T02:00:00Z',
          cluster: 'devnet',
          source_artifact_id: 'artifact_1',
          payer_wallet: 'wallet_abc',
          authority_wallet: 'squads_authority_abc',
          authority_mode: 'squads_upgrade_authority',
          program_id: null,
          transaction_signatures: [],
          deployment_refs: [],
          verification_status_at_deploy: 'succeeded',
          upgrade_authority_verified: false,
          squads_authority_validation_status: 'not_implemented',
          deployment_estimate: {
            program_size_bytes: 18504,
            rent_lamports: 128000000,
            estimated_network_fee_lamports: 25000,
            service_fee_lamports: 1280250,
            total_lamports: 129305250,
            estimate_expires_at: '2026-05-06T02:15:00Z',
            payment_recipient: 'backend_fee_recipient',
          },
          payment_request: {
            request_id: 'payreq_1',
            transaction_base64: 'AQID',
            min_context_slot: 42,
            summary: 'Prepay artifact_1 deployment.',
            simulation_summary: 'Total prepay: 129305250 lamports.',
          },
          payment_signature: null,
          refund_signature: null,
          signature_request: null,
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
    authorityWallet: 'squads_authority_abc',
    backendBaseUrl: 'http://127.0.0.1:8000/',
    payerWallet: 'wallet_abc',
    projectId: 'proj_1',
    verificationStatusAcknowledged: 'succeeded',
  })

  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8000/projects/proj_1/jobs/deployment/devnet')
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    artifact_id: 'artifact_1',
    authority_mode: 'squads_upgrade_authority',
    authority_wallet: 'squads_authority_abc',
    cluster: 'devnet',
    payer_wallet: 'wallet_abc',
    verification_status_acknowledged: 'succeeded',
  })
  assert.equal(response.jobId, 'dep_123')
  assert.equal(response.cluster, 'devnet')
  assert.equal(response.authorityMode, 'squads_upgrade_authority')
  assert.equal(response.authorityWallet, 'squads_authority_abc')
  assert.equal(response.squadsAuthorityValidationStatus, 'not_implemented')
  assert.equal(response.deploymentEstimate.totalLamports, 129305250)
  assert.equal(response.paymentRequest.requestId, 'payreq_1')
  assert.equal(response.paymentRequest.minContextSlot, '42')
})

test('submitDeploymentPayment returns updated deployment status', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/jobs/dep_123/deployment-payment')
    assert.deepEqual(JSON.parse(options.body), {
      payment_request_id: 'payreq_1',
      payment_signature_base64: 'BAUG',
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
          upgrade_authority_verified: false,
          squads_authority_validation_status: 'not_applicable',
          deployment_estimate: null,
          payment_request: null,
          payment_signature: 'txsig_1',
          refund_signature: null,
          signature_request: null,
        }
      },
    }
  }

  const response = await submitDeploymentPayment({
    backendBaseUrl: 'http://127.0.0.1:8000',
    job: {
      jobId: 'dep_123',
      status: 'payment_required',
      summary: 'Wallet payment required.',
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
      upgradeAuthorityVerified: false,
      squadsAuthorityValidationStatus: 'not_applicable',
      deploymentEstimate: null,
      paymentRequest: {
        requestId: 'payreq_1',
        transactionBase64: 'AQID',
        minContextSlot: '42',
        summary: 'Prepay artifact_1 deployment.',
        simulationSummary: 'Total prepay: 129305250 lamports.',
      },
      paymentSignature: null,
      refundSignature: null,
      signatureRequest: null,
    },
    paymentSignatureBase64: 'BAUG',
  })

  assert.equal(response.status, 'running')
  assert.deepEqual(response.transactionSignatures, ['txsig_1'])
  assert.equal(response.paymentSignature, 'txsig_1')
  assert.equal(response.paymentRequest, null)
})

test('recoverDeploymentPayment asks backend to find a matching finalized prepayment', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/jobs/dep_123/deployment-payment/recover')
    assert.deepEqual(JSON.parse(options.body), {
      payment_request_id: 'payreq_1',
    })
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          job_id: 'dep_123',
          status: 'succeeded',
          summary: 'Devnet deployment succeeded.',
          status_url: '/jobs/dep_123',
          created_at: '2026-05-06T02:00:00Z',
          updated_at: '2026-05-06T02:01:00Z',
          cluster: 'devnet',
          source_artifact_id: 'artifact_1',
          payer_wallet: 'wallet_abc',
          authority_wallet: 'wallet_abc',
          authority_mode: 'user_wallet_demo_authority',
          program_id: 'program_abc',
          transaction_signatures: ['pay_sig', 'deploy_sig'],
          deployment_refs: ['devnet-payment:pay_sig', 'devnet:deploy_sig'],
          verification_status_at_deploy: 'succeeded',
          upgrade_authority_verified: false,
          squads_authority_validation_status: 'not_applicable',
          deployment_estimate: null,
          payment_request: null,
          payment_signature: 'pay_sig',
          refund_signature: null,
          signature_request: null,
        }
      },
    }
  }

  const response = await recoverDeploymentPayment({
    backendBaseUrl: 'http://127.0.0.1:8000',
    job: {
      jobId: 'dep_123',
      status: 'payment_required',
      summary: 'Wallet payment required.',
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
      upgradeAuthorityVerified: false,
      squadsAuthorityValidationStatus: 'not_applicable',
      deploymentEstimate: null,
      paymentRequest: {
        requestId: 'payreq_1',
        transactionBase64: 'AQID',
        minContextSlot: '42',
        summary: 'Prepay artifact_1 deployment.',
        simulationSummary: 'Total prepay: 129305250 lamports.',
      },
      paymentSignature: null,
      refundSignature: null,
      signatureRequest: null,
    },
  })

  assert.equal(response.status, 'succeeded')
  assert.equal(response.programId, 'program_abc')
  assert.equal(response.paymentRequest, null)
  assert.equal(response.paymentSignature, 'pay_sig')
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
      upgradeAuthorityVerified: false,
      squadsAuthorityValidationStatus: 'not_applicable',
      deploymentEstimate: null,
      paymentRequest: null,
      paymentSignature: null,
      refundSignature: null,
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

test('submitDevnetDeploymentJob surfaces a friendly error when backend response is not JSON', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 500,
    async text() {
      return 'service temporary outage'
    },
    async json() {
      return { detail: 'service temporary outage' }
    },
  })

  const error = await submitDevnetDeploymentJob({
    artifact: {
      artifactId: 'artifact_1',
      name: 'program.so',
      typeLabel: 'program_binary',
      path: 'artifacts/program.so',
      summary: 'Generated program binary.',
    },
    authorityWallet: 'squads_authority_abc',
    backendBaseUrl: 'http://127.0.0.1:8000',
    payerWallet: 'wallet_abc',
    projectId: 'proj_1',
    verificationStatusAcknowledged: 'succeeded',
  }).then(
    () => 'unexpected success',
    (err) => err,
  )

  assert.ok(error instanceof Error)
  assert.ok(!String(error.message).includes('Unexpected token'))
})
