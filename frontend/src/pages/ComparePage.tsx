import { useEffect, useRef, useState } from 'react'
import { compareExperiments, listExperiments } from '../experimentsApi'
import type { ComparisonExperiment, Experiment, ExperimentConfig } from '../experimentsApi'
import { ResultNetwork } from '../components/results/ResultNetwork'
import { CityDetail } from '../components/results/CityResults'
import { percent, truths, decisions } from '../components/results/resultLabels'
import { CompareTimeline, CompareTurnControls } from '../components/compare/CompareTimeline'
import { useComparisonTurn } from '../components/compare/useComparisonTurn'
import { Button } from '../components/ui/button'
import './ComparePage.css'

const message = (cause: unknown) => cause instanceof Error ? cause.message : '비교 결과를 불러오지 못했습니다.'
const configFields: [keyof ExperimentConfig, string][] = [['turns','턴 수'],['byzantine_count','비잔틴 도시 수'],['sensor_error','센서 오류율'],['drop_rate','메시지 누락률'],['flip_rate','메시지 조작률'],['seed','Seed']]
const configValue = (config: ExperimentConfig, key: keyof ExperimentConfig) => ['sensor_error','drop_rate','flip_rate'].includes(key) ? percent(config[key]!) : config[key] === null ? '무작위' : String(config[key])
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
  const delta = visible?.every(row => row.mean_accuracy != null) ? Number(((visible[1].mean_accuracy! - visible[0].mean_accuracy!) * 100).toFixed(2)) : null
  const differences = visible ? configFields.filter(([key]) => visible[0].config[key] !== visible[1].config[key]) : []


  return <div className="cp-workspace">
    <header className="cp-header"><div><h1>실험 비교</h1><p>같은 턴에서, 다른 조건의 결과를 비교하세요.</p></div><div className="cp-list-tools"><span>완료 실험 {experiments.length}개</span><Button variant="outline" disabled={loading} onClick={refreshList}>목록 새로고침</Button>{hasMore && !listError && <button disabled={loading} onClick={()=>{setLoading(true);setOffset(offset+50)}}>이전 실험 더 불러오기</button>}</div></header>
    {loading && <p role="status">실험 목록을 불러오는 중…</p>}
    {listError && <p className="cp-error" role="alert">{listError} <button onClick={()=>{setLoading(true);setListError('');setListVersion(n=>n+1)}}>목록 다시 조회</button></p>}
    {!loading&&!listError&&experiments.length<2&&<p className="cp-notice">완료된 실험이 두 개 이상 필요합니다. {hasMore?'이전 실험을 더 불러오세요.':<a href="#/setup">실험 설정에서 실행한 뒤 목록을 새로고침하세요.</a>}</p>}
    <CompareTurnControls rows={visible} turn={turn} onTurn={setTurn}/>
    <div className="cp-selectors">{(['A','B'] as const).map((label,i)=><div className="cp-slot" key={label}><label className={i?'cp-b':'cp-a'} htmlFor={`compare-${label}`}><strong>실험 {label}</strong><select id={`compare-${label}`} value={i?second:first} disabled={loading&&!experiments.length} onChange={e=>select(label,e.target.value)}><option value="">완료된 실험 선택</option>{experiments.map(e=><option key={e.id} value={e.id} disabled={String(e.id)===(i?first:second)}>#{e.id} · {e.name||'이름 없는 실험'} · {e.config.turns}턴</option>)}</select><span>전체 평균 <b data-testid={`mean-${label}`}>{visible?.[i]?.mean_accuracy==null?'—':percent(visible[i].mean_accuracy!)}</b></span></label><div className="cp-slot-network" aria-label={`실험 ${label} 네트워크`}><ResultNetwork data={sides[i].data} city={city} onCity={setCity}/>{!sides[i].data&&<p className="cp-network-empty">{sides[i].error?'도시 결과 조회 실패':sides[i].missing?'해당 턴 없음':visible?'도시 결과를 불러오는 중…':'실험을 선택하세요.'}</p>}</div></div>)}</div>
    {/* 도시 선택 상세는 네트워크 바로 아래에서 A·B를 같은 번호로 비교한다. */}
    {city!==null&&<div className="cp-details" ref={detailRef} tabIndex={-1} aria-label={`도시 ${city} 상세 비교`}><div className="cp-detail-heading"><h3>도시 {city} 상세 비교</h3><button onClick={()=>setCity(null)}>상세 닫기</button></div>{sides.map((side,i)=><section key={i} aria-label={`실험 ${i?'B':'A'} 도시 상세`}><strong className={i?'cp-b':'cp-a'}>실험 {i?'B':'A'}</strong>{side.data?<CityDetail data={side.data} city={city}/>:<p>{side.missing?'해당 턴 없음':side.error?'조회 실패':'결과 없음'}</p>}</section>)}</div>}
    <div className="cp-summary-row"><div className="cp-delta"><span>평균 차이 · B − A</span><strong data-testid="mean-delta">{delta===null?'—':`${delta>0?'+':''}${delta}%p`}</strong></div></div>
    <div className="cp-conditions"><span>{visible ? differences.length ? `다른 조건 ${differences.length}개: ${differences.map(([,label])=>label).join(', ')}`:'모든 설정값이 같습니다.':'실험 조건을 비교할 수 있습니다.'}</span><details><summary>설정 나란히 보기</summary><div className="cp-config"><table><thead><tr><th>설정</th><th>실험 A</th><th>실험 B</th><th>차이</th></tr></thead><tbody>{configFields.map(([key,label])=><tr key={key} data-different={visible?visible[0].config[key]!==visible[1].config[key]:false}><th>{label}</th>{[0,1].map(i=><td key={i}>{visible?configValue(visible[i].config,key):'—'}</td>)}<td>{visible?visible[0].config[key]!==visible[1].config[key]?'다름':'같음':'—'}</td></tr>)}</tbody></table><p>같은 Seed도 조건에 따라 난수 사용 과정이 달라질 수 있습니다.</p></div></details></div>
    <p className="cp-caution">정확도 차이는 관측된 결과입니다. 조건·Seed가 다르면 특정 설정의 효과로 단정할 수 없습니다.</p>
    {ready&&!visible&&!error&&<p role="status">비교 결과를 불러오는 중…</p>}{error&&<p role="alert" className="cp-error">{error} <button onClick={()=>{setError('');setResult(null);setRetry(n=>n+1)}}>비교 다시 조회</button></p>}
    <CompareTimeline rows={visible} turn={turn} onTurn={setTurn}/>
    <section className="cp-lower"><div className="cp-section-title"><h2>{turn}턴 도시 비교</h2><span className="cp-muted">같은 도시 번호를 나란히 비교합니다.</span></div>
      <div className="cp-side-status">{sides.map((side,i)=><div key={i} className={i?'cp-b':'cp-a'}><strong>실험 {i?'B':'A'}</strong> {side.error?<span className="cp-error" role="alert">{side.error} <button onClick={side.retry}>{i?'B':'A'} 다시 조회</button></span>:!visible?'실험을 선택하세요.':side.missing?'해당 턴 없음':!side.data?<span role="status">도시 결과를 불러오는 중…</span>:<span>실제 상태 {truths[side.data.truth]} · 정확도 {percent(side.data.accuracy)}</span>}</div>)}</div>
      <div className="cp-lower-scroll">
      <table className="cp-city-table"><caption className="sr-only">선택 턴의 같은 도시를 A와 B로 비교</caption><thead><tr><th>도시</th>{['판단','정답 여부','센서값','실제 상태','비잔틴 여부'].map(label=><th key={label}>{label}<small><span className="cp-a">A</span> / <span className="cp-b">B</span></small></th>)}<th>통신 상세</th></tr></thead><tbody>{[1,2,3,4,5].map(n=><tr key={n} data-city={n} data-selected={city===n}><th>도시 {n}</th>{[0,1,2,3,4].map(field=><td key={field}>{sides.map((side,i)=>{const c=side.data?.cities.find(c=>c.city===n);const vals=c&&side.data?[decisions[c.decision],c.correct?'정답':'오답',truths[c.hint],truths[side.data.truth],c.is_byzantine?'비잔틴':'정상']:null;// 판단은 정답 여부, 센서·실제 상태는 안전/위험을 기준으로 표시한다. A·B 식별과 상태 색을 분리한다.
        const tone = !c || !side.data ? 'muted' : field <= 1 ? c.correct ? 'success' : 'error' : field === 2 ? c.hint === 'safe' ? 'success' : 'error' : field === 3 ? side.data.truth === 'safe' ? 'success' : 'error' : c.is_byzantine ? 'error' : 'neutral';
        return <span key={i} className="cp-cell-value" data-tone={tone}><small className="cp-cell-side">{i?'B':'A'}</small>{vals?vals[field]:'—'}</span>})}</td>)}<td><button aria-expanded={city===n} onClick={()=>{setCity(n);setDetailNavigation(value=>value+1)}}>도시 {n} 상세</button></td></tr>)}</tbody></table>

      </div><p className="cp-footnote">실제 상태는 턴의 공통 값입니다. 수신 ‘없음’은 null이며, 발신 ‘정상’은 내용이 진실임을 뜻하지 않습니다.</p>
    </section>
  </div>
}
