import type { GenerationJobRequest, GenerationJobRecord } from './model'

type BackendGenerationResponse = {
  job_id: string
  status: string
  summary: string
  status_url: string
  created_at: string
  updated_at: string
}

type BackendErrorResponse = {
  detail?: string | {
    code?: string
    message?: string
  }
}

type ReadGenerationJobParams = {
  backendBaseUrl: string
  job: GenerationJobRecord
  nowIso?: string
  timeoutMs?: number
}

export async function readGenerationJobStatus({
  backendBaseUrl,
  job,
  nowIso = new Date().toISOString(),
  timeoutMs = 4000,
}: ReadGenerationJobParams): Promise<GenerationJobRecord> {
  try {
    const response = (await Promise.race([
      fetch(`${backendBaseUrl.replace(/\/$/, '')}/jobs/${job.jobId}`, {
        method: 'GET',
      }),
      createRefreshTimeout(timeoutMs),
    ])) as Response

    const payload = (await response.json()) as BackendGenerationResponse | BackendErrorResponse

    if (!response.ok) {
      return buildUnavailableJob(job, nowIso)
    }

    const successPayload = payload as BackendGenerationResponse
    return {
      jobId: successPayload.job_id,
      status: successPayload.status,
      summary: successPayload.summary,
      statusUrl: successPayload.status_url,
      createdAt: successPayload.created_at,
      updatedAt: successPayload.updated_at,
    }
  } catch {
    return buildUnavailableJob(job, nowIso)
  }
}

export async function submitGenerationJob({
  backendBaseUrl,
  request,
}: {
  backendBaseUrl: string
  request: GenerationJobRequest
}): Promise<GenerationJobRecord> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/jobs/generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  const payload = (await response.json()) as BackendGenerationResponse | BackendErrorResponse

  if (!response.ok) {
    throw new Error(readBackendErrorMessage(payload))
  }

  const successPayload = payload as BackendGenerationResponse
  return {
    jobId: successPayload.job_id,
    status: successPayload.status,
    summary: successPayload.summary,
    statusUrl: successPayload.status_url,
    createdAt: successPayload.created_at,
    updatedAt: successPayload.updated_at,
  }
}

function readBackendErrorMessage(payload: BackendGenerationResponse | BackendErrorResponse) {
  if ('detail' in payload) {
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail
    }

    if (payload.detail && typeof payload.detail === 'object' && payload.detail.message) {
      return payload.detail.message
    }
  }

  return 'Generation request failed. Try again when the backend is available.'
}

function buildUnavailableJob(job: GenerationJobRecord, nowIso: string): GenerationJobRecord {
  return {
    ...job,
    status: 'unavailable',
    summary: 'Generation status is unavailable right now. Try again when the backend is reachable.',
    updatedAt: nowIso,
  }
}

function createRefreshTimeout(timeoutMs: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('generation status refresh timed out')), timeoutMs)
  })
}
