import { percent } from '../components/results/resultLabels'
import { SUSPICION, endReasonLabels, outcomeLabels } from '../gameApi'
import type { GameState, TurnResult } from '../gameApi'
import { gameSummary } from './village'

// 날짜별 나에 대한 최고 의심도 막대. 재판 기준을 넘은 날은 붉게.
function Peaks({ peaks }: { peaks: (number | null)[] }) {
  const h = 100
  const y = (v: number) => h - Math.min(v, 100)
  const label = peaks.map((v, i) => `${i + 1}일 ${v ?? '—'}`).join(', ')
  return (
    <svg className="gr-peaks" preserveAspectRatio="xMinYMin meet" viewBox={`0 0 ${peaks.length * 34 + 16} ${h + 22}`} role="img" aria-label={`날짜별 나에 대한 최고 의심도: ${label}`}>
      {peaks.map((v, i) => (
        <g key={i} transform={`translate(${16 + i * 34},0)`}>
          {v != null && <rect className={v >= SUSPICION.threshold ? 'is-over' : undefined} y={y(v)} width="22" height={h - y(v)} />}
          <text x="11" y={h + 16} textAnchor="middle">
            {i + 1}
          </text>
        </g>
      ))}
      <path d={`M0 ${y(SUSPICION.threshold)} H${peaks.length * 34 + 16}`} className="gr-line" />
    </svg>
  )
}

// 결과 화면 (명세 4번): 표를 펼치지 않아도 왜 이기고 졌는지 보인다.
export function GameResult({ state, history }: { state: GameState; history: TurnResult[] }) {
  const s = gameSummary(state, history)
  const won = state.outcome !== 'loss'
  return (
    <section className="gm-panel gr-result" aria-live="polite">
      <h2 className={won ? 'rs-correct' : 'rs-incorrect'}>
        {state.outcome ? outcomeLabels[state.outcome] : '종료'}. {s.headline}
      </h2>
      <p>
        {state.end_reason && `끝난 이유: ${endReasonLabels[state.end_reason]}`}
        {state.bot_win_rate != null && ` · 같은 설정의 기준 봇 승률 ${percent(state.bot_win_rate)}`}
      </p>
      <h3>결정적 순간</h3>
      <ul>
        {s.moments.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <h3>배운 것</h3>
      <p>{s.lesson}</p>
      {s.peaks.some((v) => v != null) && (
        <>
          <h3>날짜별 나에 대한 최고 의심도 (점선: 재판 기준 {SUSPICION.threshold})</h3>
          <Peaks peaks={s.peaks} />
        </>
      )}
    </section>
  )
}
