/* eslint-disable react/set-state-in-effect -- Reset async resource state when its experiment key changes; abort guards prevent stale responses. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getTurn, listTurns } from './experimentsApi'
import type { Experiment, TurnDetail, TurnSummary } from './experimentsApi'
import { errorMessage } from './lib/errors'

const message = (error: unknown) => errorMessage(error, '결과를 불러오지 못했습니다.')
export function useResultData(experiment: Experiment | null, all: boolean) {
  const id = experiment?.id,
    completed = experiment?.status === 'completed'
  const [summary, setSummary] = useState<{ id: number; turns: TurnSummary[] } | null>(null)
  const [cache, setCache] = useState<Record<number, TurnDetail>>({})
  // 완료된 턴 결과를 재사용해 턴 왕복 이동과 전체 표 열기에서 불필요한 요청을 줄인다.
  const cacheRef = useRef(cache)
  const requests = useRef(
    new Map<
      string,
      {
        controller: AbortController
        promise: Promise<TurnDetail>
        consumers: Set<AbortSignal>
      }
    >(),
  )
  const loadTurn = useCallback((experimentId: number, turn: number, signal: AbortSignal) => {
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
    const saved = cacheRef.current[turn]
    if (saved?.experiment_id === experimentId) return Promise.resolve(saved)
    const key = `${experimentId}:${turn}`
    let request = requests.current.get(key)
    if (!request) {
      const controller = new AbortController()
      const promise = getTurn(experimentId, turn, controller.signal).then((data) => {
        if (!controller.signal.aborted) {
          cacheRef.current = { ...cacheRef.current, [turn]: data }
          setCache(cacheRef.current)
        }
        return data
      })
      request = { controller, promise, consumers: new Set() }
      requests.current.set(key, request)
    }
    const shared = request
    shared.consumers.add(signal)
    // 선택 턴과 전체 표가 같은 요청을 공유한다. 한쪽이 닫혀도 다른 쪽이 기다리면 취소하지 않는다.
    const release = () => {
      signal.removeEventListener('abort', release)
      shared.consumers.delete(signal)
      if (!shared.consumers.size) {
        shared.controller.abort()
        if (requests.current.get(key) === shared) requests.current.delete(key)
      }
    }
    signal.addEventListener('abort', release, { once: true })
    // 성공·실패 모두 대기 요청에서 제거해 실패 후 재조회가 새 요청을 만들도록 한다.
    return shared.promise.then(
      (data) => {
        release()
        return data
      },
      (error) => {
        release()
        throw error
      },
    )
  }, [])
  const [turn, setTurn] = useState(1)
  const [summaryError, setSummaryError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [allError, setAllError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setSummary(null)
    cacheRef.current = {}
    setCache({})
    setTurn(1)
    setSummaryError('')
    setDetailError('')
    setAllError('')
    if (id !== undefined && completed)
      listTurns(id, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setSummary({ id, turns: [...data.turns].sort((a, b) => a.turn - b.turn) })
            setTurn(data.turns.length ? Math.min(...data.turns.map((row) => row.turn)) : 1)
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) setSummaryError(message(error))
        })
    // 실험 변경·재조회·페이지 이탈 시 요청을 정리한다. 서버의 실험 실행을 취소하는 동작은 아니다.
    const activeRequests = requests.current
    return () => {
      controller.abort()
      for (const request of activeRequests.values()) request.controller.abort()
      activeRequests.clear()
    }
  }, [id, completed, revision])
  // 실험 ID・턴 번호가 일치하는 캐시만 사용한다. 전환 전 요청은 취소해 오래된 결과가 섞이지 않게 한다.
  const turns = completed && summary && summary.id === id ? summary.turns : []
  useEffect(() => {
    const controller = new AbortController()
    setDetailError('')
    if (
      id !== undefined &&
      completed &&
      summary?.id === id &&
      summary.turns.some((t) => t.turn === turn) &&
      cacheRef.current[turn]?.experiment_id !== id
    ) {
      loadTurn(id, turn, controller.signal).catch((error) => {
        if (!controller.signal.aborted) setDetailError(message(error))
      })
    }
    return () => controller.abort()
  }, [id, completed, summary, turn, loadTurn])
  useEffect(() => {
    const controller = new AbortController()
    setAllError('')
    // 전체 결과는 표를 열 때만 조회한다. 기존 턴 상세 API를 최대 3개씩 호출하고 이미 받은 결과를 재사용한다.
    if (all && completed && id !== undefined && summary?.id === id) {
      const pending = summary.turns.filter(
        (row) => cacheRef.current[row.turn]?.experiment_id !== id,
      )
      let next = 0
      const worker = async () => {
        while (next < pending.length && !controller.signal.aborted) {
          const row = pending[next++]
          await loadTurn(id, row.turn, controller.signal)
        }
      }
      void Promise.all([worker(), worker(), worker()]).catch((error) => {
        if (!controller.signal.aborted) {
          setAllError(message(error))
          controller.abort()
        }
      })
    }
    return () => controller.abort()
  }, [all, completed, id, summary, loadTurn])
  const detail = completed && cache[turn]?.experiment_id === id ? cache[turn] : null
  // 응답 도착 순서가 달라도 표는 서버 요약의 턴 순서를 따른다. 실패한 턴을 가짜 행으로 채우지 않는다.
  const rows = turns.flatMap((row) =>
    cache[row.turn]?.experiment_id === id ? [cache[row.turn]] : [],
  )
  return {
    turns,
    turn,
    setTurn,
    detail,
    rows,
    summaryError,
    detailError,
    allError,
    loading: completed && summary?.id !== id && !summaryError,
    reload: () => setRevision((n) => n + 1),
  }
}
