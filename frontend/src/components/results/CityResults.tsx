import type { CityResult, TurnDetail } from '../../experimentsApi'
import {
  decisions,
  percent,
  received,
  sendTones,
  sends,
  truthTones,
  truths,
} from './resultLabels'
import { neighbours } from '../networkGeometry'

// 동일한 필드 매핑을 요약·상세 양쪽에서 사용해 표시 의미가 어긋나지 않게 한다.
// tone은 값의 의미를 색으로 함께 보여준다. 눈에 띄어야 하는 값(위험·오답·비잔틴·누락·조작)에만 색을 준다.
type Field = {
  label: string
  value: (city: CityResult, data: TurnDetail) => string
  tone?: (city: CityResult, data: TurnDetail) => string | undefined
}
const fields: Field[] = [
  // truth는 도시별 값이 아니라 해당 턴에 모든 도시가 공유하는 실제 상태다.
  { label: '실제 상태', value: (_, d) => truths[d.truth], tone: (_, d) => truthTones[d.truth] },
  { label: '센서값', value: (c) => truths[c.hint], tone: (c) => truthTones[c.hint] },
  {
    label: '왼쪽 수신',
    value: (c) => received(c.from_left),
    tone: (c) => (c.from_left === null ? 'muted' : undefined),
  },
  {
    label: '오른쪽 수신',
    value: (c) => received(c.from_right),
    tone: (c) => (c.from_right === null ? 'muted' : undefined),
  },
  { label: '판단', value: (c) => decisions[c.decision] },
  {
    label: '정답 여부',
    value: (c) => (c.correct ? '정답' : '오답'),
    tone: (c) => (c.correct ? 'success' : 'error'),
  },
  {
    label: '비잔틴 여부',
    value: (c) => (c.is_byzantine ? '비잔틴' : '정상'),
    tone: (c) => (c.is_byzantine ? 'byzantine' : undefined),
  },
  // 발신 필드는 메시지 내용이 아닌 전송 상태(normal/dropped/flipped)다.
  { label: '왼쪽 발신', value: (c) => sends[c.to_left], tone: (c) => sendTones[c.to_left] },
  { label: '오른쪽 발신', value: (c) => sends[c.to_right], tone: (c) => sendTones[c.to_right] },
]
export function CityOverview({ data, onCity }: { data: TurnDetail; onCity: (n: number) => void }) {
  const cities = [...data.cities].sort((a, b) => a.city - b.city)
  return (
    <table className="rs-city-table" data-testid="city-overview">
      <caption className="sr-only">{data.turn}턴의 전체 도시 결과</caption>
      <thead>
        <tr>
          <th scope="col">항목</th>
          {cities.map((c) => (
            <th scope="col" key={c.city}>
              <button onClick={() => onCity(c.city)} aria-label={`도시 ${c.city} 상세`}>
                도시 {c.city}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => (
          <tr key={field.label}>
            <th scope="row">{field.label}</th>
            {cities.map((c) => (
              <td key={c.city} data-city={c.city} data-tone={field.tone?.(c, data)}>
                {field.value(c, data)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
export function CityDetail({ data, city }: { data: TurnDetail; city: number | null }) {
  const row = data.cities.find((c) => c.city === city)
  if (!row)
    return (
      <div className="rs-god-detail">
        <h3>God · 실제 상태의 출처</h3>
        <strong>{truths[data.truth]}</strong>
        <p>
          이 턴의 모든 도시에 적용되는 실제 상태입니다. 각 도시는 센서값과 이전 턴에 받은 이웃
          메시지를 바탕으로 판단합니다.
        </p>
        <p>도시를 선택하면 센서값, 수신 메시지와 발신 상태를 확인할 수 있습니다.</p>
      </div>
    )
  return (
    <div data-testid="city-detail">
      <div className="rs-detail-title">
        <h3>도시 {row.city}</h3>
        <span className={row.correct ? 'rs-correct' : 'rs-incorrect'}>
          {row.correct ? '정답' : '오답'}
        </span>
      </div>
      <p className="rs-muted">
        왼쪽 이웃: 도시 {neighbours(row.city).left} / 오른쪽 이웃: 도시{' '}
        {neighbours(row.city).right}
      </p>
      <dl className="rs-detail-values">
        {fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd data-tone={field.tone?.(row, data)}>{field.value(row, data)}</dd>
          </div>
        ))}
      </dl>
      <p className="rs-muted">
        수신 ‘없음’은 저장된 null 값입니다. 첫 턴 또는 메시지 누락일 수 있습니다.
      </p>
    </div>
  )
}
export function AllResultsTable({
  rows,
  onSelect,
}: {
  rows: TurnDetail[]
  onSelect: (turn: number, city: number) => void
}) {
  return (
    <table className="rs-all-table">
      <caption className="sr-only">모든 턴의 도시별 결과</caption>
      <thead>
        <tr>
          <th>턴</th>
          <th>정확도</th>
          <th>도시</th>
          {fields.map((f) => (
            <th key={f.label}>{f.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.flatMap((data) =>
          [...data.cities]
            .sort((a, b) => a.city - b.city)
            .map((city) => (
              <tr key={`${data.turn}-${city.city}`} data-turn={data.turn} data-city={city.city}>
                <td>{data.turn}</td>
                <td>{percent(data.accuracy)}</td>
                <td>
                  <button
                    onClick={() => onSelect(data.turn, city.city)}
                    aria-label={`${data.turn}턴 도시 ${city.city} 보기`}
                  >
                    도시 {city.city}
                  </button>
                </td>
                {fields.map((f) => (
                  <td key={f.label} data-tone={f.tone?.(city, data)}>
                    {f.value(city, data)}
                  </td>
                ))}
              </tr>
            )),
        )}
      </tbody>
    </table>
  )
}
