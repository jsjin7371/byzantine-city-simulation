import { useEffect, useRef, useState } from 'react'
import { createExperiment, getExperiment } from './experimentsApi'
import type { Experiment } from './experimentsApi'
import type { ExperimentDraft } from './experimentForm'

export function useExperiment() {
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const submission = useRef<AbortController | null>(null)
  const busy = submitting || experiment?.status === 'pending' || experiment?.status === 'running'

  useEffect(() => () => { submission.current?.abort() }, [])

  // 다음 상태 조회는 이전 요청이 끝난 뒤 예약해 요청이 겹치지 않게 한다.
  useEffect(() => {
    if (!experiment || !['pending', 'running'].includes(experiment.status)) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const result = await getExperiment(experiment.id, controller.signal)
        if (!controller.signal.aborted) { setExperiment(result); setError('') }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '상태 조회에 실패했습니다.')
      }
    }, 1000)
    return () => { clearTimeout(timer); controller.abort() }
  }, [experiment, retry])

  async function start(draft: ExperimentDraft) {
    if (busy || submission.current) return
    const controller = new AbortController()
    submission.current = controller
    setSubmitting(true)
    setError('')
    setExperiment(null)
    try {
      const result = await createExperiment(draft, controller.signal)
      if (!controller.signal.aborted) setExperiment(result)
    } catch (cause) {
      if (!controller.signal.aborted) setError((cause instanceof Error ? cause.message : '실행 요청에 실패했습니다.') + ' 응답이 끊겨도 실험이 생성되었을 수 있으므로 중복 실행에 주의해 주세요.')
    } finally {
      submission.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  function refreshStatus() { setError(''); setRetry((value) => value + 1) }
  return { experiment, submitting, busy: Boolean(busy), error, start, refreshStatus }
}
