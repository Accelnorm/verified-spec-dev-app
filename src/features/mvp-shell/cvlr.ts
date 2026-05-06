import type { CvlrSpec, MvpDesignDoc, VerificationProperty } from './model'
import { renderDesignDocMarkdown } from './model'

type BackendCvlrSpecResponse = {
  checks_rs: string
  system_doc_txt: string
  generated_at: string
}

type BackendErrorResponse = {
  detail?:
    | string
    | {
        message?: string
      }
}

type GenerateCvlrSpecParams = {
  backendBaseUrl: string
  projectId: string
  verificationProperties: VerificationProperty[]
  designDoc: MvpDesignDoc
}

export async function generateCvlrSpec({
  backendBaseUrl,
  projectId,
  verificationProperties,
  designDoc,
}: GenerateCvlrSpecParams): Promise<CvlrSpec> {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/projects/${projectId}/cvlr-specs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      verification_properties: verificationProperties.map((p) => ({
        label: p.label,
        statement: p.statement,
        rationale: p.rationale,
      })),
      design_doc_markdown: renderDesignDocMarkdown(designDoc),
    }),
  })

  const payload = (await response.json()) as BackendCvlrSpecResponse | BackendErrorResponse

  if (!response.ok) {
    throw new Error(readBackendErrorMessage(payload))
  }

  const success = payload as BackendCvlrSpecResponse
  return {
    checksRs: success.checks_rs,
    systemDocTxt: success.system_doc_txt,
    generatedAt: success.generated_at,
  }
}

function readBackendErrorMessage(payload: BackendCvlrSpecResponse | BackendErrorResponse): string {
  if ('detail' in payload) {
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail
    }
    if (payload.detail && typeof payload.detail === 'object' && payload.detail.message) {
      return payload.detail.message
    }
  }
  return 'CVLR spec generation failed. Try again when the backend is available.'
}
