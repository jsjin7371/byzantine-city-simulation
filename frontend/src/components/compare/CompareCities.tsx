import type { Ref } from 'react'
import type {
  CityResult,
  ComparisonExperiment,
  Experiment,
  TurnDetail,
} from '../../experimentsApi'
import type { useComparisonTurn } from './useComparisonTurn'
import { ResultNetwork } from '../results/ResultNetwork'
import { CityDetail } from '../results/CityResults'
import {
  UNNAMED_EXPERIMENT,
  meanPercent,
  percent,
  truths,
  decisions,
} from '../results/resultLabels'
import { cityIds } from '../networkGeometry'

type Side = ReturnType<typeof useComparisonTurn>
type CitiesProps = { sides: Side[]; city: number | null }
// 화면의 왼쪽이 A, 오른쪽이 B다. sides 배열과 같은 순서다.
const sideLabels = ['A', 'B'] as const
const sideClasses = ['cp-a', 'cp-b'] as const
// 상태와 요청은 페이지/훅에서 관리하고, 이 컴포넌트는 동일한 A·B 데이터를 표시한다.
export function CompareNetworks({
  experiments,
  first,
  second,
  loading,
  visible,
  sides,
  city,
  onSelect,
  onCity,
}: CitiesProps & {
  experiments: Experiment[]
  first: string
  second: string
  loading: boolean
  visible: ComparisonExperiment[] | null
  onSelect: (label: 'A' | 'B', id: string) => void
  onCity: (city: number | null) => void
}) {
  return (
    <div className="cp-selectors">
      {sideLabels.map((label, i) => (
        <div className="cp-slot" key={label}>
          <label className={sideClasses[i]} htmlFor={`compare-${label}`}>
            <strong>실험 {label}</strong>
            <select
              id={`compare-${label}`}
              value={i ? second : first}
              disabled={loading && !experiments.length}
              onChange={(e) => onSelect(label, e.target.value)}
            >
              <option value="">완료된 실험 선택</option>
              {experiments.map((e) => (
                <option key={e.id} value={e.id} disabled={String(e.id) === (i ? first : second)}>
                  #{e.id} · {e.name || UNNAMED_EXPERIMENT} · {e.config.turns}턴
                </option>
              ))}
            </select>
            <span>
              전체 평균{' '}
              <b data-testid={`mean-${label}`}>
                {meanPercent(visible?.[i]?.mean_accuracy)}
              </b>
            </span>
          </label>
          <div className="cp-slot-network" aria-label={`실험 ${label} 네트워크`}>
            <ResultNetwork data={sides[i].data} city={city} onCity={onCity} />
            {!sides[i].data && (
              <p className="cp-network-empty">
                {sides[i].error
                  ? '도시 결과 조회 실패'
                  : sides[i].missing
                    ? '해당 턴 없음'
                    : visible
                      ? '도시 결과를 불러오는 중…'
                      : '실험을 선택하세요.'}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
export function CompareCityDetails({
  city,
  sides,
  detailRef,
  onClose,
}: CitiesProps & { detailRef: Ref<HTMLDivElement>; onClose: () => void }) {
  return (
    <>
      {city !== null && (
        <div
          className="cp-details"
          ref={detailRef}
          tabIndex={-1}
          aria-label={`도시 ${city} 상세 비교`}
        >
          <div className="cp-detail-heading">
            <h3>도시 {city} 상세 비교</h3>
            <button onClick={onClose}>상세 닫기</button>
          </div>
          {sides.map((side, i) => (
            <section key={i} aria-label={`실험 ${sideLabels[i]} 도시 상세`}>
              <strong className={sideClasses[i]}>실험 {sideLabels[i]}</strong>
              {side.data ? (
                <CityDetail data={side.data} city={city} />
              ) : (
                <p>{side.missing ? '해당 턴 없음' : side.error ? '조회 실패' : '결과 없음'}</p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
// 비교 표의 열. 판단의 색은 정답 여부, 센서와 실제 상태의 색은 안전/위험을 의미한다.
const goodTone = (good: boolean) => (good ? 'success' : 'error')
const compareFields: {
  label: string
  value: (row: CityResult, data: TurnDetail) => { text: string; tone: string }
}[] = [
  {
    label: '판단',
    value: (row) => ({ text: decisions[row.decision], tone: goodTone(row.correct) }),
  },
  {
    label: '정답 여부',
    value: (row) => ({ text: row.correct ? '정답' : '오답', tone: goodTone(row.correct) }),
  },
  {
    label: '센서값',
    value: (row) => ({ text: truths[row.hint], tone: goodTone(row.hint === 'safe') }),
  },
  {
    label: '실제 상태',
    value: (_, data) => ({ text: truths[data.truth], tone: goodTone(data.truth === 'safe') }),
  },
  {
    label: '비잔틴 여부',
    value: (row) => ({
      text: row.is_byzantine ? '비잔틴' : '정상',
      tone: row.is_byzantine ? 'error' : 'neutral',
    }),
  },
]
function cityValue(data: TurnDetail | null, city: number, field: (typeof compareFields)[number]) {
  const row = data?.cities.find((item) => item.city === city)
  return row && data ? field.value(row, data) : { text: '—', tone: 'muted' }
}

export function CompareCityTable({
  turn,
  city,
  sides,
  ready,
  onDetail,
}: CitiesProps & { turn: number; ready: boolean; onDetail: (city: number) => void }) {
  return (
    <section className="cp-lower">
      <div className="cp-section-title">
        <h2>{turn}턴 도시 비교</h2>
        <span className="cp-muted">같은 도시 번호를 나란히 비교합니다.</span>
      </div>
      <div className="cp-side-status">
        {sides.map((side, i) => (
          <div key={i} className={sideClasses[i]}>
            <strong>실험 {sideLabels[i]}</strong>{' '}
            {side.error ? (
              <span className="cp-error" role="alert">
                {side.error} <button onClick={side.retry}>{sideLabels[i]} 다시 조회</button>
              </span>
            ) : !ready ? (
              '실험을 선택하세요.'
            ) : side.missing ? (
              '해당 턴 없음'
            ) : !side.data ? (
              <span role="status">도시 결과를 불러오는 중…</span>
            ) : (
              <span>
                실제 상태 {truths[side.data.truth]} · 정확도 {percent(side.data.accuracy)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="cp-lower-scroll">
        <table className="cp-city-table">
          <caption className="sr-only">선택 턴의 같은 도시를 A와 B로 비교</caption>
          <thead>
            <tr>
              <th>도시</th>
              {compareFields.map(({ label }) => (
                <th key={label}>
                  {label}
                  <small>
                    <span className="cp-a">A</span> / <span className="cp-b">B</span>
                  </small>
                </th>
              ))}
              <th>통신 상세</th>
            </tr>
          </thead>
          <tbody>
            {cityIds.map((n) => (
              <tr key={n} data-city={n} data-selected={city === n}>
                <th>도시 {n}</th>
                {compareFields.map((field) => (
                  <td key={field.label}>
                    {sides.map((side, i) => {
                      const value = cityValue(side.data, n, field)
                      return (
                        <span key={i} className="cp-cell-value" data-tone={value.tone}>
                          <small className="cp-cell-side">{sideLabels[i]}</small>
                          {value.text}
                        </span>
                      )
                    })}
                  </td>
                ))}
                <td>
                  <button aria-expanded={city === n} onClick={() => onDetail(n)}>
                    도시 {n} 상세
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cp-footnote">
        실제 상태는 턴의 공통 값입니다. 수신 ‘없음’은 null이며, 발신 ‘정상’은 내용이 진실임을 뜻하지
        않습니다.
      </p>
    </section>
  )
}
