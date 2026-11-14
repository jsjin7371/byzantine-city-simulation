import { useEffect, useRef, useState } from 'react'
import { getTurn } from '../../experimentsApi'
import type { ComparisonExperiment, TurnDetail } from '../../experimentsApi'

export function useComparisonTurn(experiment: ComparisonExperiment | undefined, turn: number) {
  const cache = useRef(new Map<string, TurnDetail>())
  const [result, setResult] = useState<{ key: string; data?: TurnDetail; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const exists = experiment?.accuracy.some(row => row.turn === turn)
  const id = exists ? experiment?.id : undefined, key = `${id}:${turn}`
  useEffect(() => {
    if (id === undefined) return
    const controller = new AbortController()
    const saved = cache.current.get(key)
    // 실험 ID와 턴을 함께 키로 사용한다. A·B 각각의 요청·오류·재시도는 독립적이다.
    void (saved ? Promise.resolve(saved) : getTurn(id, turn, controller.signal)).then(data => {
      if (!controller.signal.aborted) { cache.current.set(key, data); setResult({ key, data }) }
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : '도시 결과를 불러오지 못했습니다.' }) })
    return () => controller.abort()
  }, [id, key, turn, retry])
  const current = result?.key === key ? result : null
  return { data: exists ? current?.data ?? null : null, error: exists ? current?.error : undefined, missing: Boolean(experiment && !exists), retry: () => { setResult(null); setRetry(n => n + 1) } }
}

