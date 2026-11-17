import { useEffect, useState } from 'react'
import { AccuracyPlaceholder } from '../components/AccuracyPlaceholder'
import { EmptyState } from '../components/EmptyState'
import { ExperimentConfigValues } from '../components/ExperimentConfigValues'
import { PageHeading } from '../components/PageHeading'
import { Panel } from '../components/Panel'
import { getTurn, listExperiments, listTurns } from '../experimentsApi'
import type { Experiment, TurnDetail, TurnList } from '../experimentsApi'

const statusLabels = { pending: '실행 준비', running: '실행 중', completed: '완료', failed: '실패' }
const decisions = { evacuate: '대피', stay: '잔류' }
const truths = { danger: '위험', safe: '안전' }
const sends = { normal: '정상', dropped: '누락', flipped: '조작' }
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '결과를 불러오지 못했습니다.'

export function ResultsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [selected, setSelected] = useState<Experiment | null>(null)
  const [summary, setSummary] = useState<TurnList | null>(null)
  const [summaryError, setSummaryError] = useState('')
  const [turn, setTurn] = useState(1)
  const [detail, setDetail] = useState<TurnDetail | null>(null)
  const [detailError, setDetailError] = useState('')

  // 목록은 화면 진입·페이지 이동·수동 새로고침 때 조회한다. 실행 상태 폴링과는 별개다.
  useEffect(() => {
    const controller = new AbortController()
    listExperiments(offset, controller.signal).then((rows) => {
      if (controller.signal.aborted) return
      setExperiments(rows)
      // 새 목록에 같은 실험이 있으면 선택을 유지하면서 최신 상태도 반영한다.
      setSelected((previous) => rows.find((row) => row.id === previous?.id) ?? null)
    }).catch((error: unknown) => { if (!controller.signal.aborted) setListError(errorMessage(error)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [offset, refresh])

  const id = selected?.id
  const completed = selected?.status === 'completed'
  // 결과 API는 미완료 실험에 409를 반환하므로 completed일 때만 턴 요약을 요청한다.
  useEffect(() => {
    const controller = new AbortController()
    if (id !== undefined && completed) {
      listTurns(id, controller.signal).then((result) => {
        if (!controller.signal.aborted) { setSummary(result); setTurn(result.turns[0]?.turn ?? 1) }
      }).catch((error: unknown) => { if (!controller.signal.aborted) setSummaryError(errorMessage(error)) })
    }
    return () => controller.abort()
  }, [id, completed, refresh])

  // 그래프용 요약과 도시 상세를 분리해 선택한 턴의 상세만 가져온다.
  // 선택이 바뀌면 이전 요청을 취소하고, 늦게 도착한 응답도 상태에 반영하지 않는다.
  useEffect(() => {
    const controller = new AbortController()
    if (id !== undefined && completed && summary?.experiment_id === id && summary.turns.some((row) => row.turn === turn)) {
      getTurn(id, turn, controller.signal).then((result) => {
        if (!controller.signal.aborted) setDetail(result)
      }).catch((error: unknown) => { if (!controller.signal.aborted) setDetailError(errorMessage(error)) })
    }
    return () => controller.abort()
  }, [id, completed, summary, turn])

  // 선택한 실험·턴과 일치하는 결과만 보여준다.
  const turns = completed && summary && summary.experiment_id === id ? summary.turns : []
  const current = turns.find((row) => row.turn === turn)
  const cityData = completed && detail && detail.experiment_id === id && detail.turn === turn ? detail : null
  // 재조회 중 이전 결과를 새 결과로 오해하지 않도록 표시값과 오류를 함께 비운다.
  function resetResults() {
    setSummary(null)
    setSummaryError('')
    setDetail(null)
    setDetailError('')
    setTurn(1)
  }
  function retry() {
    resetResults()
    setLoading(true)
    setListError('')
    setRefresh((value) => value + 1)
  }
  function changePage(nextOffset: number) {
    resetResults()
    setLoading(true)
    setListError('')
    setSelected(null)
    setOffset(nextOffset)
  }
  function choose(experiment: Experiment) {
    if (selected?.id === experiment.id) return
    setSelected(experiment)
    setTurn(1)
    setDetail(null)
    setSummary(null)
    setSummaryError('')
    setDetailError('')
  }
  // 한 턴짜리 실험은 0으로 나누지 않고 중앙에 점 하나를 표시한다.
  // SVG의 y축은 아래로 증가하므로 아래 렌더링에서 accuracy 0~1을 위쪽 좌표로 변환한다.
  const pointX = (index: number) => turns.length === 1 ? 310 : 50 + index / (turns.length - 1) * 520

  return (
    <>
      <PageHeading eyebrow="RESULTS" title="저장된 결과 탐색" description="실험을 선택하고, 각 턴에서 도시가 내린 판단을 살펴보세요." />
      <div className="results-layout">
        <Panel title="실험 목록" description="최신순 · 한 페이지에 50개" className="experiment-list-panel" aside={<button className="result-refresh" onClick={retry} disabled={loading}>새로고침</button>}>
          {loading ? <p role="status">목록을 불러오는 중…</p> : listError ? <p role="alert" className="execution-error">{listError}</p> : experiments.length === 0 ? <EmptyState compact title="표시할 실험이 없습니다" description="실험을 실행한 뒤 목록을 새로고침해 주세요."><a className="text-link" href="#/setup">실험 설정으로 이동 →</a></EmptyState> :
            <ul className="experiment-list">{experiments.map((experiment) => <li key={experiment.id}><button className="experiment-choice" aria-pressed={selected?.id === experiment.id} onClick={() => choose(experiment)}><strong>{experiment.name || `실험 #${experiment.id}`}</strong><span>#{experiment.id} · {statusLabels[experiment.status]} · {experiment.completed_turns}/{experiment.config.turns}턴</span></button></li>)}</ul>}
          {listError && <button className="button" onClick={retry}>목록 다시 조회</button>}
          <div className="list-pagination"><button disabled={loading || offset === 0} onClick={() => changePage(offset - 50)}>이전</button><span>{offset / 50 + 1}페이지</span><button disabled={loading || Boolean(listError) || experiments.length < 50} onClick={() => changePage(offset + 50)}>다음</button></div>
        </Panel>
        <div className="result-panels">
          {/* 목록 응답에 설정이 포함돼 있어 추가 조회 없이 표시한다.
              실행 중이거나 실패한 실험도 설정을 볼 수 있도록 선택 여부만 확인한다. */}
          {selected && (
            <Panel title="실험 설정" description={selected.name || undefined} className="experiment-settings" aside={<span className="badge">실험 #{selected.id}</span>}>
              <ExperimentConfigValues config={selected.config} />
            </Panel>
          )}
          {selected && !completed && <Panel title={`실험 #${selected.id} · ${statusLabels[selected.status]}`}><p role="status" className="quiet-note">{selected.status === 'failed' ? selected.error || '실험이 실패하여 결과를 조회할 수 없습니다.' : '실험 완료 후 결과를 조회할 수 있습니다. 잠시 후 목록을 새로고침해 주세요.'}</p></Panel>}
          <Panel title="턴별 정확도" description="비잔틴 도시를 포함한 전체 5개 도시의 정답 비율입니다." aside={<span className="badge">{selected ? `실험 #${selected.id}` : '실험 선택 전'}</span>}>
            {summaryError ? <div role="alert"><p className="execution-error">{summaryError}</p><button className="button" onClick={retry}>결과 다시 조회</button></div> : completed && !summary ? <p role="status">턴별 결과를 불러오는 중…</p> : turns.length ?
              <svg className="accuracy-chart" viewBox="0 0 600 210" role="img" aria-label={`턴별 정확도: ${turns.map((row) => `${row.turn}턴 ${(row.accuracy * 100).toFixed(1)}%`).join(', ')}`}>
                {[0, 50, 100].map((value) => <g key={value}><text x="0" y={174 - value * 1.5}>{value}%</text><line x1="45" x2="580" y1={170 - value * 1.5} y2={170 - value * 1.5} /></g>)}
                <polyline points={turns.map((row, index) => `${pointX(index)},${170 - row.accuracy * 150}`).join(' ')} />
                {turns.map((row, index) => <circle key={row.turn} cx={pointX(index)} cy={170 - row.accuracy * 150} r={row.turn === turn ? 6 : 3} />)}
                <text x="45" y="202">{turns[0].turn}턴</text>{turns.length > 1 && <text x="540" y="202">{turns[turns.length - 1].turn}턴</text>}
              </svg> : <AccuracyPlaceholder />}
            {completed && summary && !turns.length && <p>저장된 턴 결과가 없습니다.</p>}
            <div className="turn-controls">
              <div className="turn-labels"><label htmlFor="selected-turn">선택 턴 <span>{current ? `${turn} / ${turns.length}` : '— / —'}</span></label><span>정답 <strong>{current ? truths[current.truth] : '—'}</strong></span><span>정확도 {current ? `${(current.accuracy * 100).toFixed(1)}%` : '—'}</span></div>
              <input id="selected-turn" type="range" min={turns[0]?.turn ?? 1} max={turns[turns.length - 1]?.turn ?? 1} value={turn} onChange={(event) => { setDetail(null); setDetailError(''); setTurn(Number(event.target.value)) }} disabled={!turns.length} aria-describedby="turn-help" />
              <p id="turn-help">슬라이더 또는 방향키로 턴을 이동하면 도시별 결과가 바뀝니다.</p>
            </div>
          </Panel>
          <Panel title="도시별 상태" description="센서값·수신 메시지·결정·발신 상태를 확인합니다.">
            {detailError ? <div role="alert"><p className="execution-error">{detailError}</p><button className="button" onClick={retry}>결과 다시 조회</button></div> : current && !cityData ? <p role="status">도시별 결과를 불러오는 중…</p> : cityData ?
              <div className="city-results">{cityData.cities.map((city) => <article className="city-result" key={city.city}><h3>도시 {city.city} · {city.is_byzantine ? '비잔틴' : '정상 도시'}</h3><dl><div><dt>센서값</dt><dd>{truths[city.hint]}</dd></div><div><dt>왼쪽 수신</dt><dd>{city.from_left === null ? '없음' : decisions[city.from_left]}</dd></div><div><dt>오른쪽 수신</dt><dd>{city.from_right === null ? '없음' : decisions[city.from_right]}</dd></div><div><dt>결정</dt><dd>{decisions[city.decision]} · {city.correct ? '정답' : '오답'}</dd></div><div><dt>왼쪽 발신</dt><dd>{sends[city.to_left]}</dd></div><div><dt>오른쪽 발신</dt><dd>{sends[city.to_right]}</dd></div></dl></article>)}</div>
                : <EmptyState compact title="아직 선택된 턴이 없습니다" description="목록에서 완료된 실험을 선택해 주세요." />}
            <p className="quiet-note panel-note">첫 턴과 누락된 메시지는 수신값이 없습니다. 전송 상태의 ‘정상’은 메시지가 진실이라는 의미와는 다릅니다.</p>
          </Panel>
        </div>
      </div>
    </>
  )
}
