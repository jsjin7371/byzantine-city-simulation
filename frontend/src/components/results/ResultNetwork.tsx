import { useEffect, useRef, useState } from 'react'
import type { TurnDetail } from '../../experimentsApi'
import { decisions, truths } from './resultLabels'


export function ResultNetwork({ data, city, onCity }: { data: TurnDetail | null; city: number | null; onCity: (city: number | null) => void }) {
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 600, height: 360 })
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(stage.current!)
    return () => observer.disconnect()
  }, [])
  // 실제 픽셀 좌표로 정오각형을 계산해 작은 창에서도 글자 크기를 축소하지 않는다.
  const radius = Math.max(80, Math.min((size.height - 70) / 1.81, (size.width - 150) / 1.91, 230))
  const nodeWidth = size.height < 300 ? 106 : 118
  const cx = size.width / 2, cy = (size.height - radius * 1.81) / 2 + radius
  const points = Array.from({ length: 5 }, (_, i) => ({ x: cx + radius * Math.cos((-90 + i * 72) * Math.PI / 180), y: cy + radius * Math.sin((-90 + i * 72) * Math.PI / 180) }))
  // 연결선은 논리적인 통신 경로다. 이전 턴의 수신과 현재 턴의 발신을 구분한다.
  return <div className="rs-network" data-turn={data?.turn} aria-label="선택 턴의 도시 네트워크">
    <div className="rs-section-heading"><h2>도시 네트워크</h2><span>{data ? `${data.turn}턴 · 실제 상태 ${truths[data.truth]}` : '도시를 선택해 판단 살펴보기'}</span></div>
    <div className="rs-network-stage" ref={stage}>
      {/* 선택 전·로딩 중에는 SVG 자체를 만들지 않아 노드가 노출되거나 키보드로 선택되는 것을 막는다. */}
      {data && <svg viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="God과 다섯 도시의 연결 관계">
        <defs><marker id="result-message-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 2 8 5 2 8" fill="none" stroke="context-stroke" strokeWidth="1.4" /></marker><marker id="result-hint-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M2 2 8 5 2 8" fill="none" stroke="context-stroke" strokeWidth="1.4" /></marker></defs>
        {points.map((p, i) => { const q = points[(i + 1) % 5]; const cut = (a: typeof p, b: typeof p) => { const dx = b.x - a.x, dy = b.y - a.y; const t = Math.min((nodeWidth / 2 + 4) / Math.max(.01, Math.abs(dx)), 32 / Math.max(.01, Math.abs(dy))); return { x: a.x + dx * t, y: a.y + dy * t } }; const start = cut(p, q), end = cut(q, p); return <line key={i} className={`rs-message ${city === i + 1 || city === (i + 1) % 5 + 1 ? 'is-active' : ''}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerStart="url(#result-message-arrow)" markerEnd="url(#result-message-arrow)" /> })}
        {points.map((p, i) => {
          const dx = p.x - cx, dy = p.y - cy
          const from = Math.min(44 / Math.max(.01, Math.abs(dx)), 39 / Math.max(.01, Math.abs(dy)))
          const to = Math.min((nodeWidth / 2 + 4) / Math.max(.01, Math.abs(dx)), 33 / Math.max(.01, Math.abs(dy)))
          return <line key={i} className={`rs-hint ${city === null || city === i + 1 ? 'is-active' : ''}`} x1={cx + dx * from} y1={cy + dy * from} x2={p.x - dx * to} y2={p.y - dy * to} markerEnd="url(#result-hint-arrow)" />
        })}
        <g transform={`translate(${cx - 300} ${cy - 180})`} className="rs-god" role="button" tabIndex={0} aria-label="God 실제 상태 보기" aria-pressed={city === null} onClick={() => onCity(null)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCity(null) } }}>
          <rect x="258" y="143" width="84" height="74" rx="7" /><path d="m300 151 9 7-3 10h-12l-3-10Z" /><text x="300" y="187" textAnchor="middle">God</text><text className="rs-node-caption" x="300" y="205" textAnchor="middle">{data ? truths[data.truth] : '실제 상태'}</text>
        </g>
        {points.map((p, i) => { const row = data?.cities.find(c => c.city === i + 1); return <g key={i} transform={`translate(${p.x - nodeWidth / 2} ${p.y - 29})`} role="button" tabIndex={0} aria-label={`도시 ${i + 1} 상세 보기`} aria-pressed={city === i + 1} className={`rs-result-node ${city === i + 1 ? 'is-selected' : ''}`} onClick={() => onCity(i + 1)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCity(i + 1) } }}>
          <rect width={nodeWidth} height="58" rx="6" /><text x="10" y="22">도시 {i + 1}</text><text x={nodeWidth - 10} y="22" textAnchor="end" className="rs-node-caption">{row?.is_byzantine ? '비잔틴' : row ? '정상' : ''}</text><text x="10" y="44" className={row?.correct ? 'rs-correct' : row ? 'rs-incorrect' : 'rs-node-caption'}>{row ? `${decisions[row.decision]} · ${row.correct ? '정답' : '오답'}` : '결과 대기'}</text>
        </g> })}
      </svg>}
    </div>
    <div className="rs-legend"><span><i className="hint" />God → 도시 힌트</span><span><i />이웃 도시 간 메시지</span><span>수신: 이전 턴 · 발신: 현재 턴</span></div>
  </div>
}
