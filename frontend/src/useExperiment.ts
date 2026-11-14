import { useEffect, useRef, useState } from 'react'
import { createExperiment, getExperiment, HttpError, experimentPayload } from './experimentsApi'
import type { Experiment } from './experimentsApi'
import type { ExperimentDraft, FormErrors } from './experimentForm'

export function useExperiment() {
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // 생성 응답이 유실되면 서버에 이미 저장됐을 수 있어 새 요청을 잠근다.
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState<ReturnType<typeof experimentPayload> | null>(null)
  const [querying, setQuerying] = useState(false)
  const [retry, setRetry] = useState(0)
  const submission = useRef<AbortController | null>(null)
  const query = useRef<AbortController | null>(null)
  const busy = submitting || uncertain || experiment?.status === 'pending' || experiment?.status === 'running'
  // HTTP 요청 정리는 서버에서 실행 중인 실험의 취소를 의미하지 않는다.
  useEffect(() => () => { submission.current?.abort(); query.current?.abort() }, [])
  // 응답 후 다음 조회를 예약한다. 완료·실패에서는 종료하고 조회 오류 시 수동 재조회를 기다린다.
  useEffect(() => {
    if (!experiment || !['pending', 'running'].includes(experiment.status)) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      query.current = controller; setQuerying(true)
      try {
        const result = await getExperiment(experiment.id, controller.signal)
        if (!controller.signal.aborted) { setExperiment(result); setError('') }
      } catch (cause) {
        // 통신 오류로 실험 자체를 failed로 바꾸지 않고 마지막 상태와 ID를 유지한다.
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '상태 조회에 실패했습니다.')
      } finally {
        if (query.current === controller) query.current = null
        if (!controller.signal.aborted) setQuerying(false)
      }
    }, 1000)
    return () => { clearTimeout(timer); controller.abort() }
  }, [experiment, retry])
  async function start(draft: ExperimentDraft) {
    // React가 버튼 상태를 갱신하기 전의 빠른 연속 클릭도 ref로 차단한다.
    if (busy || submission.current) return
    const controller = new AbortController()
    submission.current = controller
    setSubmitting(true); setError(''); setFieldErrors({}); setExperiment(null); setSubmitted(experimentPayload(draft))
    try {
      const result = await createExperiment(draft, controller.signal)
      if (!controller.signal.aborted) setExperiment(result)
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : '실행 요청에 실패했습니다.')
      // 409·422는 생성 전 거절이다. 나머지는 생성 여부를 확정하지 않고 자동 재전송하지 않는다.
      if (cause instanceof HttpError && [409, 422].includes(cause.status)) {
        if (cause.status === 422 && Array.isArray(cause.detail)) {
          const fields: FormErrors = {}
          // FastAPI의 loc 마지막 항목을 실제 폼 필드와 연결하고 서버 설명을 보존한다.
          for (const item of cause.detail) {
            const key = item?.loc?.at(-1)
            if (key in draft && typeof item.msg === 'string') fields[key as keyof ExperimentDraft] = item.msg
          }
          setFieldErrors(fields)
        }
      } else setUncertain(true)
    } finally {
      submission.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }
  function refreshStatus() { if (!query.current) { setError(''); setRetry(value => value + 1) } }
  // 실패 실험을 재개하지 않는다. 응답 유실 시에는 목록 확인을 거쳐 새 설정으로 돌아간다.
  function edit(acknowledged = false) {
    if (submitting || experiment?.status === 'pending' || experiment?.status === 'running' || (uncertain && !acknowledged)) return
    setExperiment(null); setUncertain(false); setError(''); setFieldErrors({}); setSubmitted(null)
  }
  function clearInputError() { setError(''); setFieldErrors({}) }
  return { experiment, submitting, uncertain, submitted, querying, fieldErrors, busy: Boolean(busy), error, start, refreshStatus, edit, clearInputError }
}
