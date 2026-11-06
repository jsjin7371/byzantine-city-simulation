import { useEffect, useState } from 'react'
import { AccuracyPlaceholder } from '../components/AccuracyPlaceholder'
import { PageHeading } from '../components/PageHeading'
import { Panel } from '../components/Panel'
import { compareExperiments, listExperiments } from '../experimentsApi'
import type { ComparisonExperiment, Experiment, TurnSummary } from '../experimentsApi'

const configLabels = ['턴 수', '센서 오류율', '메시지 누락률', '메시지 조작률', '비잔틴 도시 수 (5개 중)', 'Seed']
const percent = (value: number) => `${Number((value * 100).toFixed(2))}%`
const message = (cause: unknown) => cause instanceof Error ? cause.message : '비교 결과를 불러오지 못했습니다.'

function ComparisonChart({ turns, maxTurn }: { turns: TurnSummary[]; maxTurn: number }) {
  // 두 그래프의 축을 똑같이 맞춘다. 짧은 실험이 끝난 뒤의 구간을 0으로 채우거나 늘리지 않는다.
  // 둘 다 한 턴이면 0으로 나누지 않고 점을 중앙에 표시한다.
  const x = (turn: number) => maxTurn === 1 ? 310 : 50 + (turn - 1) / (maxTurn - 1) * 520
  return <svg className="accuracy-chart" viewBox="0 0 600 210" role="img" aria-label={`턴별 정확도: ${turns.map((row) => `${row.turn}턴 ${percent(row.accuracy)}`).join(', ')}`}>
    {[0, 50, 100].map((value) => <g key={value}><text x="0" y={174 - value * 1.5}>{value}%</text><line x1="45" x2="580" y1={170 - value * 1.5} y2={170 - value * 1.5} /></g>)}
    <polyline points={turns.map((row) => `${x(row.turn)},${170 - row.accuracy * 150}`).join(' ')} />
    {turns.map((row) => <circle key={row.turn} cx={x(row.turn)} cy={170 - row.accuracy * 150} r="4" />)}
    <text x={maxTurn === 1 ? 300 : 45} y="202">1턴</text>{maxTurn > 1 && <text x="540" y="202">{maxTurn}턴</text>}
  </svg>
}

function ComparisonSlot({ label, selected, other, experiments, result, maxTurn, disabled, onSelect }: {
  label: 'A' | 'B'; selected: string; other: string; experiments: Experiment[]; result?: ComparisonExperiment
  maxTurn: number; disabled: boolean; onSelect: (id: string) => void
}) {
  const config = result?.config
  const values = config ? [String(config.turns), percent(config.sensor_error), percent(config.drop_rate), percent(config.flip_rate), String(config.byzantine_count), config.seed === null ? '랜덤' : String(config.seed)] : []
  return <Panel title={`실험 ${label}`} aside={<span className="badge">{result ? `#${result.id}` : selected ? '선택됨' : '선택 전'}</span>}>
    <label className="field" htmlFor={`compare-${label}`}>
      <span className="sr-only">실험 {label} 선택</span>
      <select id={`compare-${label}`} value={selected} onChange={(event) => onSelect(event.target.value)} disabled={disabled} aria-describedby="compare-help">
        <option value="">완료된 실험을 선택하세요</option>
        {/* 반대편에서 선택한 실험을 비활성화해 같은 실험끼리 비교하는 것을 막는다. */}
        {experiments.map((experiment) => <option key={experiment.id} value={experiment.id} disabled={String(experiment.id) === other}>#{experiment.id} · {experiment.name || '이름 없는 실험'} · {experiment.config.turns}턴</option>)}
      </select>
    </label>
    <div className="comparison-accuracy"><span>전체 턴 평균 정확도</span><strong>{result?.mean_accuracy != null ? percent(result.mean_accuracy) : '—'}</strong></div>
    {result?.accuracy.length ? <ComparisonChart turns={result.accuracy} maxTurn={maxTurn} /> : <AccuracyPlaceholder />}
    {result && result.accuracy.length === 0 && <p className="quiet-note">저장된 턴 결과가 없습니다.</p>}
    <h3 className="comparison-config-heading">실험 설정</h3>
    <dl className="config-values">{configLabels.map((name, index) => <div key={name}><dt>{name}</dt><dd>{values[index] ?? '—'}</dd></div>)}</dl>
  </Panel>
}

export function ComparePage() {
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
    setResult(null)
    setError('')
    setListVersion((value) => value + 1)
  }
  const ready = Boolean(first && second && first !== second)
  const visible = ready && result?.[0]?.id === Number(first) && result?.[1]?.id === Number(second) ? result : null
  const maxTurn = Math.max(1, ...(visible?.map((row) => row.config.turns) ?? []))

  return <>
    <PageHeading eyebrow="COMPARISON" title="두 실험 비교" description="설정의 차이가 도시의 판단 정확도에 어떤 영향을 주는지 비교하세요." />
    <div className="comparison-intro" id="compare-help"><span className="badge">완료 실험 {experiments.length}개</span><p>완료된 서로 다른 두 실험을 선택하면 비교 결과를 불러옵니다.</p><button className="result-refresh" disabled={loading} onClick={refreshList}>목록 새로고침</button></div>
    {loading && <p className="quiet-note" role="status">실험 목록을 불러오는 중…</p>}
    {listError && <div role="alert"><p className="execution-error">{listError}</p><button className="button" onClick={() => { setLoading(true); setListError(''); setListVersion((value) => value + 1) }}>목록 다시 조회</button></div>}
    {!loading && !listError && experiments.length < 2 && <p className="quiet-note">비교하려면 완료된 실험이 두 개 이상 필요합니다.{hasMore ? ' 이전 실험을 더 불러오거나 새 실험을 실행해 주세요.' : ' 실험 설정에서 실험을 실행한 뒤 목록을 새로고침해 주세요.'}</p>}
    {hasMore && !listError && <button className="button compare-load-more" disabled={loading} onClick={() => { setLoading(true); setOffset(offset + 50) }}>이전 실험 더 불러오기</button>}
    {ready && !visible && !error && <p className="quiet-note" role="status">비교 결과를 불러오는 중…</p>}
    {error && <div role="alert"><p className="execution-error">{error}</p><button className="button" onClick={() => { setError(''); setResult(null); setRetry((value) => value + 1) }}>비교 다시 조회</button></div>}
    <div className="comparison-layout">
      <ComparisonSlot label="A" selected={first} other={second} experiments={experiments} result={visible?.[0]} maxTurn={maxTurn} disabled={loading && !experiments.length} onSelect={(id) => select('A', id)} />
      <ComparisonSlot label="B" selected={second} other={first} experiments={experiments} result={visible?.[1]} maxTurn={maxTurn} disabled={loading && !experiments.length} onSelect={(id) => select('B', id)} />
    </div>
    <p className="quiet-note comparison-note">두 그래프는 같은 턴·정확도 축을 사용합니다. 짧은 실험은 마지막 턴에서 끝나며, 평균 정확도는 각 실험의 전체 턴을 기준으로 표시합니다.</p>
  </>
}
