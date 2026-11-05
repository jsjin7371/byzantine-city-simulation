import { AccuracyPlaceholder } from '../components/AccuracyPlaceholder'
import { EmptyState } from '../components/EmptyState'
import { PageHeading } from '../components/PageHeading'
import { Panel } from '../components/Panel'

export function ResultsPage() {
  return (
    <>
      <PageHeading eyebrow="RESULTS" title="저장된 결과 탐색" description="실험을 선택하고, 각 턴에서 도시가 내린 판단을 살펴보세요." />
      <div className="results-layout">
        <Panel title="실험 목록" description="실험 조회 기능 준비 중" className="experiment-list-panel">
          <EmptyState compact title="표시할 실험이 없습니다" description="실험 목록을 불러오면 여기에서 선택할 수 있습니다.">
            <a className="text-link" href="#/setup">실험 설정으로 이동 <span aria-hidden="true">→</span></a>
          </EmptyState>
        </Panel>
        <div className="result-panels">
          <Panel title="턴별 정확도" description="비잔틴 도시를 포함한 전체 5개 도시의 정답 비율입니다." aside={<span className="badge">실험 선택 전</span>}>
            <AccuracyPlaceholder />
            <div className="turn-controls">
              <div className="turn-labels"><label htmlFor="selected-turn">선택 턴 <span>— / —</span></label><span>정답 <strong>—</strong></span></div>
              <input id="selected-turn" type="range" min="1" max="20" defaultValue="1" disabled aria-describedby="turn-help" />
              <p id="turn-help">완료된 실험을 선택하면 턴을 이동할 수 있습니다.</p>
            </div>
          </Panel>
          <Panel title="도시별 상태" description="센서값·수신 메시지·결정·발신 상태를 확인합니다.">
            <div className="city-placeholders" aria-label="도시 5개, 결과 대기 중">
              {[1, 2, 3, 4, 5].map((city) => (
                <div className="city-placeholder" key={city}>
                  <span className="city-placeholder-number">{String(city).padStart(2, '0')}</span><h3>도시 {city}</h3><span>결과 대기</span>
                </div>
              ))}
            </div>
            <EmptyState compact title="아직 선택된 턴이 없습니다" description="턴을 선택하면 도시별 판단과 메시지 상세가 표시됩니다." />
            <p className="quiet-note panel-note">첫 턴에는 수신 메시지가 없습니다. 전송 상태의 ‘정상’은 메시지가 진실이라는 의미와는 다릅니다.</p>
          </Panel>
        </div>
      </div>
    </>
  )
}
