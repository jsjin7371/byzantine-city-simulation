import type { ComparisonExperiment } from '../../experimentsApi'
import { percent } from '../results/resultLabels'

export function CompareTimeline({ rows, turn, onTurn }: { rows: ComparisonExperiment[] | null; turn: number; onTurn: (n: number) => void }) {
  const turns = [...new Set(rows?.flatMap(row => row.accuracy.map(t => t.turn)) ?? [])].sort((a, b) => a - b)
  const first = turns[0] ?? 1, last = turns.at(-1) ?? 1
  const x = (n: number) => last === first ? 500 : 50 + (n - first) / (last - first) * 900
  // 없는 턴은 선으로 연결하거나 0으로 보간하지 않는다. 두 실험 모두 동일한 0~100% 축을 쓴다.
  return <section className="cp-timeline"><div className="cp-section-title"><h2>턴별 정확도</h2><div className="cp-legend"><span className="cp-a">A ━ {rows?.[0]?.accuracy.find(t => t.turn === turn) ? percent(rows[0].accuracy.find(t => t.turn === turn)!.accuracy) : '해당 턴 없음'}</span><span className="cp-b">B ┄ {rows?.[1]?.accuracy.find(t => t.turn === turn) ? percent(rows[1].accuracy.find(t => t.turn === turn)!.accuracy) : '해당 턴 없음'}</span></div></div>
    {turns.length ? <svg className="cp-chart" viewBox="0 0 1000 180" role="group" aria-label="A 실선 B 점선 턴별 정확도 비교">
      {[0, 50, 100].map(n => <g key={n}><text x="2" y={144 - n * 1.2}>{n}%</text><line x1="50" x2="950" y1={140 - n * 1.2} y2={140 - n * 1.2} /></g>)}
      <line className="cp-cursor" x1={x(turn)} x2={x(turn)} y1="14" y2="145" />
      {rows?.map((row, side) => <g key={row.id} className={side ? 'cp-series-b' : 'cp-series-a'}>{row.accuracy.map((t, i) => <g key={t.turn}>{i > 0 && row.accuracy[i-1].turn === t.turn-1 && <line x1={x(row.accuracy[i-1].turn)} y1={140-row.accuracy[i-1].accuracy*120} x2={x(t.turn)} y2={140-t.accuracy*120} />}<circle cx={x(t.turn)} cy={140-t.accuracy*120} r={side ? t.turn===turn?4:3 : t.turn===turn?7:5} /></g>)}</g>)}
      {turns.map(n => <g key={n} role="button" tabIndex={0} aria-label={`${n}턴 선택`} aria-pressed={n===turn} onClick={()=>onTurn(n)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onTurn(n)}}}><rect className="cp-hit" x={x(n)-Math.min(20,420/turns.length)} y="5" width={Math.min(40,840/turns.length)} height="172" />{(turns.length<=10||n===first||n===last||n%2===0)&&<text x={x(n)} y="170" textAnchor="middle">{n}</text>}</g>)}<text x="990" y="170" textAnchor="end">턴</text>
    </svg> : <div className="cp-chart-empty">두 실험을 선택하면 모든 턴의 정확도를 같은 축에서 비교합니다.</div>}

  </section>
}

// 네트워크와 그래프의 공통 턴 조작부. 별도 상태를 만들지 않고 부모의 선택 턴만 변경한다.
export function CompareTurnControls({ rows, turn, onTurn }: { rows: ComparisonExperiment[] | null; turn: number; onTurn: (n: number) => void }) {
  const turns = [...new Set(rows?.flatMap(row => row.accuracy.map(t => t.turn)) ?? [])].sort((a, b) => a - b)
  const index = turns.indexOf(turn)
  return <div className="cp-turn-nav"><button disabled={index<=0} onClick={()=>onTurn(turns[index-1])}>이전 턴</button><label htmlFor="cp-turn">{turns.length?`${turn}턴`:'—'}</label><input id="cp-turn" type="range" aria-label="비교 턴 선택" min={0} max={Math.max(0,turns.length-1)} value={Math.max(0,index)} aria-valuetext={`${turn}턴`} disabled={!turns.length} onChange={e=>onTurn(turns[Number(e.target.value)])} /><button disabled={index<0||index>=turns.length-1} onClick={()=>onTurn(turns[index+1])}>다음 턴</button></div>
}
