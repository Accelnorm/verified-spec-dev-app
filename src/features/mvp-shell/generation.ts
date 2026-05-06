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
  detail?: {
    message?: string
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
  if ('detail' in payload && payload.detail?.message) {
    return payload.detail.message
  }

  return 'Generation request failed. Try again when the backend is available.'
}
