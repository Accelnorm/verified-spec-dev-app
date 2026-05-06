import type { GenerationArtifactRecord, GenerationJobRequest, GenerationJobRecord } from './model'

type BackendGenerationResponse = {
  job_id: string
  status: string
  summary: string
  status_url: string
  created_at: string
  updated_at: string
  current_phase?: string | null
  progress_summary?: string | null
  started_at?: string | null
  finished_at?: string | null
  last_heartbeat_at?: string | null
  ai_composer_thread_id?: string | null
  last_checkpoint_id?: string | null
  latest_log_excerpt?: string | null
  last_materialized_snapshot_at?: string | null
  artifact_refs?: string[]
  artifacts?: {
    artifact_id: string
    name: string
    type_label: string
    path: string
    summary: string
  }[]
  provider?: string | null
  model?: string | null
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
      currentPhase: successPayload.current_phase ?? null,
      progressSummary: successPayload.progress_summary ?? null,
      startedAt: successPayload.started_at ?? null,
      finishedAt: successPayload.finished_at ?? null,
      lastHeartbeatAt: successPayload.last_heartbeat_at ?? null,
      aiComposerThreadId: successPayload.ai_composer_thread_id ?? null,
      lastCheckpointId: successPayload.last_checkpoint_id ?? null,
      latestLogExcerpt: successPayload.latest_log_excerpt ?? null,
      lastMaterializedSnapshotAt: successPayload.last_materialized_snapshot_at ?? null,
      artifactRefs: successPayload.artifact_refs ?? [],
      artifacts: normalizeArtifacts(successPayload.artifacts),
      providerLabel: successPayload.provider ?? null,
      modelLabel: successPayload.model ?? null,
    }
  } catch {
    return buildUnavailableJob(job, nowIso)
  }
}

export async function submitGenerationJob({
  backendBaseUrl,
  projectId,
  request,
}: {
  backendBaseUrl: string
  projectId?: string | null
  request: GenerationJobRequest
}): Promise<GenerationJobRecord> {
  const baseUrl = backendBaseUrl.replace(/\/$/, '')
  const endpoint = projectId ? `${baseUrl}/projects/${projectId}/jobs/generation` : `${baseUrl}/jobs/generation`
  const response = await fetch(endpoint, {
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
    currentPhase: successPayload.current_phase ?? null,
    progressSummary: successPayload.progress_summary ?? null,
    startedAt: successPayload.started_at ?? null,
    finishedAt: successPayload.finished_at ?? null,
    lastHeartbeatAt: successPayload.last_heartbeat_at ?? null,
    aiComposerThreadId: successPayload.ai_composer_thread_id ?? null,
    lastCheckpointId: successPayload.last_checkpoint_id ?? null,
    latestLogExcerpt: successPayload.latest_log_excerpt ?? null,
    lastMaterializedSnapshotAt: successPayload.last_materialized_snapshot_at ?? null,
    artifactRefs: successPayload.artifact_refs ?? [],
    artifacts: normalizeArtifacts(successPayload.artifacts),
    providerLabel: successPayload.provider ?? null,
    modelLabel: successPayload.model ?? null,
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

function normalizeArtifacts(artifacts: BackendGenerationResponse['artifacts']): GenerationArtifactRecord[] {
  return (artifacts ?? []).map((artifact) => ({
    artifactId: artifact.artifact_id,
    name: artifact.name,
    typeLabel: artifact.type_label,
    path: artifact.path,
    summary: artifact.summary,
  }))
}
