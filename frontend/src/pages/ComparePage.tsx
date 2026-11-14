import { useEffect, useRef, useState } from 'react'
import { compareExperiments, listExperiments } from '../experimentsApi'
import type { ComparisonExperiment, Experiment } from '../experimentsApi'
import { CompareTimeline, CompareTurnControls } from '../components/compare/CompareTimeline'
import { useComparisonTurn } from '../components/compare/useComparisonTurn'
import { Button } from '../components/ui/button'
import { CompareNetworks, CompareCityDetails, CompareCityTable } from '../components/compare/CompareCities'
import { CompareConditions } from '../components/compare/CompareConditions'
import './ComparePage.css'

const message = (cause: unknown) => cause instanceof Error ? cause.message : '비교 결과를 불러오지 못했습니다.'
export function ComparePage() {
  const detailRef = useRef<HTMLDivElement>(null)
  const [detailNavigation, setDetailNavigation] = useState(0)
  // scrollIntoView는 바깥 컨테이너까지 움직여 공통 헤더를 숨길 수 있으므로 비교 영역만 스크롤한다.
  useEffect(() => {
    if (!detailNavigation) return
    const detail = detailRef.current
    if (!detail) return
    const workspace = detail.closest<HTMLElement>('.cp-workspace')
    if (!workspace) return
    const controls = workspace.querySelector('.cp-turn-nav')
    const offset = (controls?.getBoundingClientRect().height ?? 56) + 24
    workspace.scrollTo({
      top: workspace.scrollTop + detail.getBoundingClientRect().top - workspace.getBoundingClientRect().top - offset,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
    detail.focus({ preventScroll: true })
  }, [detailNavigation])
  const [turn, setTurn] = useState(1)
  const [city, setCity] = useState<number | null>(null)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [offset, setOffset] = useState(0)
  const [listVersion, setListVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [listError, setListError] = useState('')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [result, setResult] = useState<ComparisonExperiment[] | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    // 목록 API에는 완료 상태 필터가 없어서 프론트에서 걸러낸다.
    // 최신 50개가 모두 미완료여도 '더 불러오기'로 이전의 완료 실험에 접근할 수 있다.
    listExperiments(offset, controller.signal).then((rows) => {
      if (controller.signal.aborted) return
      const completed = rows.filter((row) => row.status === 'completed')
      setExperiments((previous) => offset === 0 ? completed : [...previous, ...completed.filter((row) => !previous.some((item) => item.id === row.id))])
      setHasMore(rows.length === 50)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setListError(message(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [offset, listVersion])

  useEffect(() => {
    if (!first || !second || first === second) return
    const controller = new AbortController()
    compareExperiments(Number(first), Number(second), controller.signal).then((rows) => {
      if (!controller.signal.aborted) setResult(rows)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(message(cause)) })
    // 선택을 바꾸거나 화면을 떠나면 이전 요청을 취소해 늦은 응답이 새 선택을 덮어쓰지 않게 한다.
    return () => controller.abort()
  }, [first, second, retry])

  function select(label: 'A' | 'B', id: string) {
    setTurn(1); setCity(null)
    setResult(null)
    setError('')
    if (label === 'A') setFirst(id)
    else setSecond(id)
  }
  function refreshList() {
    setLoading(true)
    setListError('')
    setOffset(0)
    setExperiments([])
    setHasMore(false)
    setFirst('')
    setSecond('')
    setTurn(1); setCity(null)
    setResult(null)
    setError('')
    setListVersion((value) => value + 1)
  }
  const ready = Boolean(first && second && first !== second)
  const visible = ready && result?.[0]?.id === Number(first) && result?.[1]?.id === Number(second) ? result : null
  const a = useComparisonTurn(visible?.[0], turn), b = useComparisonTurn(visible?.[1], turn)
  const sides = [a, b]



  return <div className="cp-workspace">
    <header className="cp-header"><div><h1>실험 비교</h1><p>같은 턴에서, 다른 조건의 결과를 비교하세요.</p></div><div className="cp-list-tools"><span>완료 실험 {experiments.length}개</span><Button variant="outline" disabled={loading} onClick={refreshList}>목록 새로고침</Button>{hasMore && !listError && <button disabled={loading} onClick={()=>{setLoading(true);setOffset(offset+50)}}>이전 실험 더 불러오기</button>}</div></header>
    {loading && <p role="status">실험 목록을 불러오는 중…</p>}
    {listError && <p className="cp-error" role="alert">{listError} <button onClick={()=>{setLoading(true);setListError('');setListVersion(n=>n+1)}}>목록 다시 조회</button></p>}
    {!loading&&!listError&&experiments.length<2&&<p className="cp-notice">완료된 실험이 두 개 이상 필요합니다. {hasMore?'이전 실험을 더 불러오세요.':<a href="#/setup">실험 설정에서 실행한 뒤 목록을 새로고침하세요.</a>}</p>}
    <CompareTurnControls rows={visible} turn={turn} onTurn={setTurn}/>
    <CompareNetworks experiments={experiments} first={first} second={second} loading={loading} visible={visible} sides={sides} city={city} onSelect={select} onCity={setCity}/>

    {/* 도시 선택 상세는 네트워크 바로 아래에서 A·B를 같은 번호로 비교한다. */}
    <CompareCityDetails city={city} sides={sides} detailRef={detailRef} onClose={()=>setCity(null)}/>

    <CompareConditions visible={visible}/>

    {ready&&!visible&&!error&&<p role="status">비교 결과를 불러오는 중…</p>}{error&&<p role="alert" className="cp-error">{error} <button onClick={()=>{setError('');setResult(null);setRetry(n=>n+1)}}>비교 다시 조회</button></p>}
    <CompareTimeline rows={visible} turn={turn} onTurn={setTurn}/>
    <CompareCityTable turn={turn} city={city} sides={sides} ready={Boolean(visible)} onDetail={n=>{setCity(n);setDetailNavigation(value=>value+1)}}/>
  </div>
}
