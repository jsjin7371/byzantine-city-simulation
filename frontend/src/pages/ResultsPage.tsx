/* eslint-disable react/set-state-in-effect -- Loading belongs to the abortable list request, including page changes and refresh. */
import { useEffect, useState } from 'react'
import { RefreshCw, Table2, ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { listExperiments } from '../experimentsApi'
import type { Experiment } from '../experimentsApi'
import { useResultData } from '../useResultData'
import { ExperimentConfigValues } from '../components/ExperimentConfigValues'
import { AccuracyTimeline } from '../components/results/AccuracyTimeline'
import { ResultNetwork } from '../components/results/ResultNetwork'
import { CityOverview, CityDetail, AllResultsTable } from '../components/results/CityResults'
import { percent, statuses } from '../components/results/resultLabels'
import './ResultsPage.css'

export function ResultsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [selected, setSelected] = useState<Experiment | null>(null)
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [city, setCity] = useState<number | null>(null)
  const [tab, setTab] = useState<'all' | 'detail'>('all')
  const [all, setAll] = useState(false)
  // 그래프·슬라이더·네트워크·도시 표가 같은 turn을 참조한다. 각 영역에서 턴 상태를 따로 만들지 않는다.
  const result = useResultData(selected, all)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setListError('')
    listExperiments(offset, controller.signal).then(rows => {
      if (!controller.signal.aborted) {
        setExperiments(rows)
        setSelected(previous => rows.find(row => row.id === previous?.id) ?? null)
      }
    }).catch(error => { if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : '실험 목록을 불러오지 못했습니다.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [offset, revision])
  // 실험 변경 시 도시 선택과 전체 표 모드를 초기화한다. 이전 실험의 상세 화면을 재사용하지 않는다.
  function choose(experiment: Experiment) { if (experiment.id !== selected?.id) { setSelected(experiment); setCity(null); setTab('all'); setAll(false) } }
  function chooseCity(n: number | null) { setCity(n); setTab('detail') }
  function page(next: number) { setSelected(null); setExperiments([]); setAll(false); setOffset(next) }
  const completed = selected?.status === 'completed'
  // 백엔드 결과 API는 완료된 실험만 허용한다. 준비·진행·실패 상태에는 결과 조회를 유도하지 않는다.
  const notice = !selected ? '왼쪽에서 실험을 선택하세요.' : !completed ? selected.status === 'failed' ? selected.error || '실험이 실패했습니다.' : '완료된 실험의 결과만 조회할 수 있습니다. 목록을 새로고침해 주세요.' : result.loading ? '턴별 결과를 불러오는 중…' : result.summaryError || (!result.turns.length ? '저장된 턴 결과가 없습니다.' : '')
  return <div className="rs-workspace">
    <aside className="rs-list" aria-label="실험 목록">
      <div className="rs-list-heading"><h1>결과 탐색</h1><button onClick={() => { setRevision(n => n + 1); result.reload() }} disabled={loading} aria-label="실험 목록 새로고침"><RefreshCw size={16} /></button></div>
      <p className="rs-muted">실험 목록 <span>최신순 · 50개씩</span></p>
      <div className="rs-list-scroll" aria-busy={loading}>
        {loading ? <p className="rs-message-block" role="status">목록을 불러오는 중…</p> : listError ? <div className="rs-message-block rs-error" role="alert"><p>{listError}</p><button onClick={() => setRevision(n => n + 1)}>목록 다시 조회</button></div> : !experiments.length ? <div className="rs-message-block"><p>표시할 실험이 없습니다.</p><a href="#/setup">실험 설정으로 이동</a></div> : <ul>{experiments.map(experiment => <li key={experiment.id}><button className="rs-experiment" aria-pressed={selected?.id === experiment.id} onClick={() => choose(experiment)}><span className="rs-list-meta"><span>#{experiment.id}</span><span data-status={experiment.status}>{statuses[experiment.status]}</span></span><strong>{experiment.name || '이름 없는 실험'}</strong><span className="rs-list-meta"><span>{experiment.config.turns}턴 · 비잔틴 {experiment.config.byzantine_count}</span><span>{experiment.mean_accuracy == null ? '—' : percent(experiment.mean_accuracy)}</span></span></button></li>)}</ul>}
      </div>
      <div className="rs-pagination"><button aria-label="이전 목록 페이지" disabled={offset === 0 || loading} onClick={() => page(Math.max(0, offset - 50))}><ChevronLeft size={16} /></button><span>{offset / 50 + 1} 페이지</span><button aria-label="다음 목록 페이지" disabled={loading || experiments.length < 50} onClick={() => page(offset + 50)}><ChevronRight size={16} /></button></div>
    </aside>
    <div className="rs-content">
      <header className="rs-summary">
        <div className="rs-summary-title"><div><span className="rs-muted">{selected ? `실험 #${selected.id}` : '실험 결과'}</span><span className="rs-status" data-status={selected?.status}>{selected ? statuses[selected.status] : '선택 전'}</span></div><h2 title={selected?.name || undefined}>{selected?.name || (selected ? '이름 없는 실험' : '도시의 판단을 살펴보세요')}</h2></div>
        <div className="rs-average"><span>전체 평균 정확도</span><strong data-testid="mean-accuracy">{selected?.mean_accuracy == null ? '—' : percent(selected.mean_accuracy)}</strong></div>
        <div className="rs-summary-config"><span>{selected ? `${selected.config.turns}턴 / 비잔틴 ${selected.config.byzantine_count}개` : '실험 조건'}</span><details key={selected?.id}><summary>상세 설정</summary><div className="rs-config-popover"><ExperimentConfigValues config={selected?.config} /></div></details></div>
        {/* 삭제 API는 아직 없다. UI만 준비한 버튼이며 실제 요청이나 로컬 목록 삭제를 수행하지 않는다. */}
        <button type="button" className="rs-delete-button" disabled><Trash2 size={15} aria-hidden="true" />실험 삭제</button>
      </header>
      <div className="rs-body">
        {all ? <section className="rs-full-results"><div className="rs-full-heading"><button onClick={() => setAll(false)}><ArrowLeft size={16} /> 네트워크로 돌아가기</button><h2>전체 턴 결과</h2><span>{result.rows.length} / {result.turns.length}턴</span></div><p className="rs-muted">수신은 이전 턴, 발신은 현재 턴 기준입니다. 도시를 누르면 해당 턴의 상세 결과로 이동합니다.</p>{(result.allError || result.summaryError) && <div role="alert" className="rs-error">{result.allError || result.summaryError}<button onClick={result.reload}>전체 결과 다시 조회</button></div>}{(result.loading || result.rows.length < result.turns.length) && !result.allError && !result.summaryError && <p role="status">전체 결과를 불러오는 중…</p>}<div className="rs-table-scroll" tabIndex={0} aria-label="전체 턴 결과 표 스크롤"><AllResultsTable rows={result.rows} onSelect={(turn, n) => { result.setTurn(turn); chooseCity(n); setAll(false) }} /></div></section> : <>
          <div className="rs-center">
            <div className="rs-network-wrap"><ResultNetwork data={result.detail} city={city} onCity={chooseCity} />{notice && <div className="rs-network-notice" role={result.summaryError ? 'alert' : 'status'}><p>{notice}</p>{result.summaryError && <button onClick={result.reload}>결과 다시 조회</button>}</div>}</div>
            <AccuracyTimeline turns={result.turns} turn={result.turn} onTurn={result.setTurn} />
          </div>
          <aside className="rs-inspector" aria-label="도시 결과">
            <div className="rs-section-heading"><h2>{result.turns.length ? `${result.turn}턴 도시 결과` : '도시 결과'}</h2><button className="rs-table-button" disabled={!result.turns.length} onClick={() => setAll(true)}><Table2 size={15} />전체 턴 표</button></div>
            <div className="rs-tabs" role="group" aria-label="도시 결과 표시 방식"><button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>전체 5개 도시</button><button aria-pressed={tab === 'detail'} onClick={() => setTab('detail')}>{city ? `도시 ${city} 상세` : '선택 상세'}</button></div>
            <div className="rs-inspector-scroll" aria-busy={Boolean(result.turns.length && !result.detail && !result.detailError)}>
              {result.detailError ? <div className="rs-message-block rs-error" role="alert"><p>{result.detailError}</p><button onClick={result.reload}>도시 결과 다시 조회</button></div> : result.detail ? tab === 'all' ? <CityOverview data={result.detail} onCity={chooseCity} /> : <CityDetail data={result.detail} city={city} /> : <p className="rs-message-block" role="status">{result.turns.length ? '도시 결과를 불러오는 중…' : '완료된 실험을 선택하면 도시별 판단과 통신 결과를 볼 수 있습니다.'}</p>}
            </div>
            <p className="rs-inspector-note">실제 상태는 모든 도시의 공통 정답입니다.<br />발신 ‘정상’은 메시지가 진실이라는 뜻이 아닙니다.</p>
          </aside>
        </>}
      </div>
    </div>
  </div>
}
