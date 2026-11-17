import type { ComparisonExperiment } from '../../experimentsApi'
import { percent } from '../results/resultLabels'
import { showTurnLabel, turnScale } from '../chartScale'
import { onActivateKey } from '../../lib/keyboard'

// 그래프 좌표(SVG viewBox 기준). 왼쪽은 % 눈금, 아래쪽은 턴 번호 자리다.
const CHART = { width: 1000, height: 180, left: 50, right: 950, top: 20, bottom: 140 }
const y = (accuracy: number) => CHART.bottom - accuracy * (CHART.bottom - CHART.top)
const sides = [
  { label: 'A', line: '━', className: 'cp-a', series: 'cp-series-a' },
  { label: 'B', line: '┄', className: 'cp-b', series: 'cp-series-b' },
]

function comparisonTurns(rows: ComparisonExperiment[] | null) {
  return [...new Set(rows?.flatMap((row) => row.accuracy.map((t) => t.turn)) ?? [])].sort(
    (a, b) => a - b,
  )
}

export function CompareTimeline({
  rows,
  turn,
  onTurn,
}: {
  rows: ComparisonExperiment[] | null
  turn: number
  onTurn: (n: number) => void
}) {
  const turns = comparisonTurns(rows)
  const first = turns[0] ?? 1,
    last = turns.at(-1) ?? 1
  const x = turnScale(first, last, CHART.left, CHART.right)
  // 없는 턴은 선으로 연결하거나 0으로 보간하지 않는다. 두 실험 모두 동일한 0~100% 축을 쓴다.
  return (
    <section className="cp-timeline">
      <div className="cp-section-title">
        <h2>턴별 정확도</h2>
        <div className="cp-legend">
          {sides.map((side, i) => {
            const current = rows?.[i]?.accuracy.find((t) => t.turn === turn)
            return (
              <span key={side.label} className={side.className}>
                {side.label} {side.line} {current ? percent(current.accuracy) : '해당 턴 없음'}
              </span>
            )
          })}
        </div>
      </div>
      {turns.length ? (
        <svg
          className="cp-chart"
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="group"
          aria-label="A 실선 B 점선 턴별 정확도 비교"
        >
          {[0, 50, 100].map((n) => (
            <g key={n}>
              <text x="2" y={y(n / 100) + 4}>
                {n}%
              </text>
              <line x1={CHART.left} x2={CHART.right} y1={y(n / 100)} y2={y(n / 100)} />
            </g>
          ))}
          <line className="cp-cursor" x1={x(turn)} x2={x(turn)} y1="14" y2="145" />
          {rows?.map((row, side) => (
            <g key={row.id} className={sides[side].series}>
              {row.accuracy.map((t, i) => (
                <g key={t.turn}>
                  {i > 0 && row.accuracy[i - 1].turn === t.turn - 1 && (
                    <line
                      x1={x(row.accuracy[i - 1].turn)}
                      y1={y(row.accuracy[i - 1].accuracy)}
                      x2={x(t.turn)}
                      y2={y(t.accuracy)}
                    />
                  )}
                  <circle
                    cx={x(t.turn)}
                    cy={y(t.accuracy)}
                    r={side ? (t.turn === turn ? 4 : 3) : t.turn === turn ? 7 : 5}
                  />
                </g>
              ))}
            </g>
          ))}
          {turns.map((n) => (
            <g
              key={n}
              role="button"
              tabIndex={0}
              aria-label={`${n}턴 선택`}
              aria-pressed={n === turn}
              onClick={() => onTurn(n)}
              onKeyDown={onActivateKey(() => onTurn(n))}
            >
              <rect
                className="cp-hit"
                x={x(n) - Math.min(20, 420 / turns.length)}
                y="5"
                width={Math.min(40, 840 / turns.length)}
                height="172"
              />
              {showTurnLabel(n, first, last, turns.length) && (
                <text x={x(n)} y="170" textAnchor="middle">
                  {n}
                </text>
              )}
            </g>
          ))}
          <text x="990" y="170" textAnchor="end">
            턴
          </text>
        </svg>
      ) : (
        <div className="cp-chart-empty">
          두 실험을 선택하면 모든 턴의 정확도를 같은 축에서 비교합니다.
        </div>
      )}
    </section>
  )
}

// 네트워크와 그래프의 공통 턴 조작부. 별도 상태를 만들지 않고 부모의 선택 턴만 변경한다.
export function CompareTurnControls({
  rows,
  turn,
  onTurn,
}: {
  rows: ComparisonExperiment[] | null
  turn: number
  onTurn: (n: number) => void
}) {
  const turns = comparisonTurns(rows)
  const index = turns.indexOf(turn)
  return (
    <div className="cp-turn-nav">
      <button disabled={index <= 0} onClick={() => onTurn(turns[index - 1])}>
        이전 턴
      </button>
      <label htmlFor="cp-turn">{turns.length ? `${turn}턴` : '—'}</label>
      <input
        id="cp-turn"
        type="range"
        aria-label="비교 턴 선택"
        min={0}
        max={Math.max(0, turns.length - 1)}
        value={Math.max(0, index)}
        aria-valuetext={`${turn}턴`}
        disabled={!turns.length}
        onChange={(e) => onTurn(turns[Number(e.target.value)])}
      />
      <button
        disabled={index < 0 || index >= turns.length - 1}
        onClick={() => onTurn(turns[index + 1])}
      >
        다음 턴
      </button>
    </div>
  )
}
