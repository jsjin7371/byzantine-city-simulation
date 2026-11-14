import type { TurnSummary } from '../../experimentsApi'
import { percent } from './resultLabels'

export function AccuracyTimeline({ turns, turn, onTurn }: { turns: TurnSummary[]; turn: number; onTurn: (turn: number) => void }) {
  const index = turns.findIndex(row => row.turn === turn)
  const current = turns[index]
  // 실제 턴 번호를 X축으로 사용한다. 한 턴만 있는 실험도 중앙에 선택 가능한 점을 표시한다.
  const first = turns[0]?.turn ?? 1, last = turns.at(-1)?.turn ?? 1
  const x = (n: number) => first === last ? 330 : 48 + (n - first) / (last - first) * 564
  // API의 0~1 정확도를 SVG 좌표로 변환한다. 화면의 백분율은 별도로 포맷한다.
  const y = (accuracy: number) => 132 - accuracy * 112
  return <section className="rs-timeline" aria-label="턴별 정확도">
    <div className="rs-section-heading"><h2>턴별 정확도</h2><span>선택 {current ? `${turn}턴` : '—'} <strong data-testid="turn-accuracy">{current ? percent(current.accuracy) : '—'}</strong></span></div>
    {turns.length ? <svg className="rs-chart" viewBox="0 0 640 166" role="group" aria-label="전체 턴 정확도 그래프. 점을 선택해 턴 이동">
      {[0, 50, 100].map(value => <g key={value}><text x="2" y={y(value / 100) + 4}>{value}%</text><line x1="48" x2="612" y1={y(value / 100)} y2={y(value / 100)} /></g>)}
      {current && <line className="rs-cursor" x1={x(turn)} x2={x(turn)} y1="15" y2="137" />}
      <polyline points={turns.map(row => `${x(row.turn)},${y(row.accuracy)}`).join(' ')} />
      {turns.map(row => <g key={row.turn} role="button" tabIndex={0} aria-label={`${row.turn}턴 정확도 ${percent(row.accuracy)}`} aria-pressed={row.turn === turn} onClick={() => onTurn(row.turn)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTurn(row.turn) } }}>
        <rect className="rs-hit" x={x(row.turn) - Math.min(18, 260 / turns.length)} y="6" width={Math.min(36, 520 / turns.length)} height="158" />
        <circle className="rs-point" cx={x(row.turn)} cy={y(row.accuracy)} r={row.turn === turn ? 5 : 3} />
        <title>{row.turn}턴 · {percent(row.accuracy)}</title>
        {(turns.length <= 10 || row.turn === first || row.turn === last || row.turn % 2 === 0) && <text x={x(row.turn)} y="158" textAnchor="middle">{row.turn}</text>}
      </g>)}
      <text x="635" y="158" textAnchor="end">턴</text>
    </svg> : <div className="rs-chart-empty">실험을 선택하면 모든 턴의 정확도가 표시됩니다.</div>}
    <div className="rs-turn-nav"><button disabled={index <= 0} onClick={() => onTurn(turns[index - 1].turn)} aria-label="이전 턴">이전</button><label htmlFor="result-turn">{current ? `${turn} / ${last}턴` : '턴 선택'}</label><input id="result-turn" type="range" min={0} max={Math.max(0, turns.length - 1)} value={Math.max(0, index)} disabled={!turns.length} aria-label="결과 턴 선택" aria-valuetext={current ? `${turn}턴` : '결과 없음'} onChange={e => onTurn(turns[Number(e.target.value)].turn)} /><button disabled={index < 0 || index >= turns.length - 1} onClick={() => onTurn(turns[index + 1].turn)} aria-label="다음 턴">다음</button></div>
  </section>
}
