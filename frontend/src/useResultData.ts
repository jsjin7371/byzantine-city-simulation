/* eslint-disable react/set-state-in-effect -- Reset async resource state when its experiment key changes; abort guards prevent stale responses. */
import { useEffect, useRef, useState } from 'react'
import { getTurn, listTurns } from './experimentsApi'
import type { Experiment, TurnDetail, TurnSummary } from './experimentsApi'

const message = (error: unknown) => error instanceof Error ? error.message : '결과를 불러오지 못했습니다.'
export function useResultData(experiment: Experiment | null, all: boolean) {
  const id = experiment?.id, completed = experiment?.status === 'completed'
  const [summary, setSummary] = useState<{ id: number; turns: TurnSummary[] } | null>(null)
  const [cache, setCache] = useState<Record<number, TurnDetail>>({})
  // 완료된 턴 결과를 재사용해 턴 왕복 이동과 전체 표 열기에서 불필요한 요청을 줄인다.
  const cacheRef = useRef(cache)
  useEffect(() => { cacheRef.current = cache }, [cache])
  const [turn, setTurn] = useState(1)
  const [summaryError, setSummaryError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [allError, setAllError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setSummary(null); setCache({}); setTurn(1); setSummaryError(''); setDetailError(''); setAllError('')
    if (id !== undefined && completed) listTurns(id, controller.signal).then(data => {
      if (!controller.signal.aborted) { setSummary({ id, turns: [...data.turns].sort((a, b) => a.turn - b.turn) }); setTurn(data.turns[0]?.turn ?? 1) }
    }).catch(error => { if (!controller.signal.aborted) setSummaryError(message(error)) })
    // 실험 변경·재조회·페이지 이탈 시 요청을 정리한다. 서버의 실험 실행을 취소하는 동작은 아니다.
    return () => controller.abort()
  }, [id, completed, revision])
  // 실험 ID・턴 번호가 일치하는 캐시만 사용한다. 전환 전 요청은 취소해 오래된 결과가 섞이지 않게 한다.
  const turns = completed && summary && summary.id === id ? summary.turns : []
  useEffect(() => {
    const controller = new AbortController()
    setDetailError('')
    if (id !== undefined && completed && summary?.id === id && summary.turns.some(t => t.turn === turn) && cacheRef.current[turn]?.experiment_id !== id) {
      getTurn(id, turn, controller.signal).then(data => { if (!controller.signal.aborted) setCache(prev => ({ ...prev, [turn]: data })) }).catch(error => { if (!controller.signal.aborted) setDetailError(message(error)) })
    }
    return () => controller.abort()
  }, [id, completed, summary, turn])
  useEffect(() => {
    const controller = new AbortController()
    setAllError('')
    // 전체 결과는 표를 열 때만 조회한다. 기존 턴 상세 API를 최대 3개씩 호출하고 이미 받은 결과를 재사용한다.
    if (all && completed && id !== undefined && summary?.id === id) {
      const pending = summary.turns.filter(row => cacheRef.current[row.turn]?.experiment_id !== id)
      let next = 0
      const worker = async () => { while (next < pending.length && !controller.signal.aborted) { const row = pending[next++]; const data = await getTurn(id, row.turn, controller.signal); if (!controller.signal.aborted) setCache(prev => ({ ...prev, [row.turn]: data })) } }
      void Promise.all([worker(), worker(), worker()]).catch(error => { if (!controller.signal.aborted) { setAllError(message(error)); controller.abort() } })
    }
    return () => controller.abort()
  }, [all, completed, id, summary])
  const detail = completed && cache[turn]?.experiment_id === id ? cache[turn] : null
  // 응답 도착 순서가 달라도 표는 서버 요약의 턴 순서를 따른다. 실패한 턴을 가짜 행으로 채우지 않는다.
  const rows = turns.flatMap(row => cache[row.turn]?.experiment_id === id ? [cache[row.turn]] : [])
  return { turns, turn, setTurn, detail, rows, summaryError, detailError, allError, loading: completed && summary?.id !== id && !summaryError, reload: () => setRevision(n => n + 1) }
}
