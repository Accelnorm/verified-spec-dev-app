import { getTransactionDecoder, type Transaction } from '@solana/kit'

import { normalizeDeploymentJob, type BackendDeploymentJob } from './backend'
import type { DeploymentJobRecord, GenerationArtifactRecord } from './model'

type BackendErrorResponse = {
  detail?:
    | string
    | {
        code?: string
        message?: string
      }
}

export type SubmitDevnetDeploymentJobParams = {
  backendBaseUrl: string
  projectId?: string | null
  artifact: GenerationArtifactRecord
  payerWallet: string
  authorityWallet: string
  verificationStatusAcknowledged: string
}

export async function submitDevnetDeploymentJob({
  artifact,
  authorityWallet,
  backendBaseUrl,
  payerWallet,
  projectId,
  verificationStatusAcknowledged,
}: SubmitDevnetDeploymentJobParams): Promise<DeploymentJobRecord> {
  const baseUrl = backendBaseUrl.replace(/\/$/, '')
  const endpoint = projectId
    ? `${baseUrl}/projects/${projectId}/jobs/deployment/devnet`
    : `${baseUrl}/jobs/deployment/devnet`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      artifact_id: artifact.artifactId,
      authority_mode: 'user_wallet_demo_authority',
      authority_wallet: authorityWallet,
      cluster: 'devnet',
      payer_wallet: payerWallet,
      verification_status_acknowledged: verificationStatusAcknowledged,
    }),
  })

  const payload = (await response.json()) as BackendDeploymentJob | BackendErrorResponse

  if (!response.ok) {
    throw new Error(
      readBackendErrorMessage(payload, 'Devnet deployment request failed. Try again when the backend is available.'),
    )
  }

  return normalizeDeploymentJob(payload as BackendDeploymentJob)
}

export async function readDeploymentJobStatus({
  backendBaseUrl,
  job,
  nowIso = new Date().toISOString(),
  timeoutMs = 4000,
}: {
  backendBaseUrl: string
  job: DeploymentJobRecord
  nowIso?: string
  timeoutMs?: number
}): Promise<DeploymentJobRecord> {
  try {
    const response = (await Promise.race([
      fetch(`${backendBaseUrl.replace(/\/$/, '')}/jobs/${job.jobId}`, {
        method: 'GET',
      }),
      createRefreshTimeout(timeoutMs),
    ])) as Response

    const payload = (await response.json()) as BackendDeploymentJob | BackendErrorResponse

    if (!response.ok) {
      return buildUnavailableJob(job, nowIso)
    }

    return normalizeDeploymentJob(payload as BackendDeploymentJob)
  } catch {
    return buildUnavailableJob(job, nowIso)
  }
}

export async function submitDeploymentSignature({
  backendBaseUrl,
  job,
  signatureBase64,
}: {
  backendBaseUrl: string
  job: DeploymentJobRecord
  signatureBase64: string
}): Promise<DeploymentJobRecord> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/jobs/${job.jobId}/deployment-signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      signature_base64: signatureBase64,
      signature_request_id: job.signatureRequest?.requestId ?? null,
    }),
  })

  const payload = (await response.json()) as BackendDeploymentJob | BackendErrorResponse

  if (!response.ok) {
    throw new Error(
      readBackendErrorMessage(payload, 'Deployment signature submission failed. Try again after refreshing status.'),
    )
  }

  return normalizeDeploymentJob(payload as BackendDeploymentJob)
}

export function decodeBase64Transaction(transactionBase64: string): Transaction {
  return getTransactionDecoder().decode(decodeBase64Bytes(transactionBase64))
}

export function bytesToBase64(bytes: ArrayLike<number>): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  const encoder = (globalThis as { btoa?: (value: string) => string }).btoa

  if (encoder) {
    return encoder(binary)
  }

  const buffer = (
    globalThis as { Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } } }
  ).Buffer
  if (buffer) {
    return buffer.from(binary, 'binary').toString('base64')
  }

  throw new Error('Base64 encoding is unavailable in this runtime.')
}

function decodeBase64Bytes(value: string): Uint8Array {
  const decoder = (globalThis as { atob?: (value: string) => string }).atob

  if (decoder) {
    return Uint8Array.from(decoder(value), (character) => character.charCodeAt(0))
  }

  const buffer = (globalThis as { Buffer?: { from(value: string, encoding: string): Uint8Array } }).Buffer
  if (buffer) {
    return Uint8Array.from(buffer.from(value, 'base64'))
  }

  throw new Error('Base64 decoding is unavailable in this runtime.')
}

function readBackendErrorMessage(payload: BackendDeploymentJob | BackendErrorResponse, fallback: string) {
  if ('detail' in payload) {
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail
    }

    if (payload.detail && typeof payload.detail === 'object' && payload.detail.message) {
      return payload.detail.message
    }
  }

  return fallback
}

function buildUnavailableJob(job: DeploymentJobRecord, nowIso: string): DeploymentJobRecord {
  return {
    ...job,
    status: 'unavailable',
    summary: 'Deployment status is unavailable right now. Try again when the backend is reachable.',
    updatedAt: nowIso,
  }
}

function createRefreshTimeout(timeoutMs: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('deployment status refresh timed out')), timeoutMs)
  })
}
