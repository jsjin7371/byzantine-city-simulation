import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Line, Scale } from './village'

const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')

// 작은 양팔 저울: 왼쪽 접시 대피(+), 오른쪽 접시 잔류(−). 몫마다 블록 하나, 합만큼 기운다.
// 블록 색: 내 관측 초록, 이웃 쪽지 갈색, 내 쪽지 붉은색.
function Balance({ scale, me, label }: { scale: Scale; me: number; label: string }) {
  // 대피 쪽이 무거우면 왼쪽이 내려간다. 작은 차이도 보이게 제곱근으로, 최대 15도
  const tilt = -Math.sign(scale.total) * Math.min(1, Math.sqrt(Math.abs(scale.total) / 300)) * 15
  const drop = 42 * Math.sin((tilt * Math.PI) / 180)
  const pan = (side: 1 | -1) => {
    const parts = scale.parts.filter((p) => p.value * side > 0)
    return (
      <g className="vl-pan" style={{ '--drop': `${-side * drop}px` } as CSSProperties}>
        <g transform={`translate(${60 - side * 42},24)`}>
          <path d="M0 0 L-16 16 M0 0 L16 16" />
          <path d="M-17 16 Q0 22 17 16 Z" className="vl-plate" />
          {parts.map((p, i) => {
            const w = Math.max(8, Math.min(30, Math.abs(p.value) * 0.26))
            const kind = p.from === 'hint' ? 'is-hint' : p.from === me ? 'is-mine' : 'is-note'
            return <rect key={String(p.from)} className={kind} x={-w / 2} y={11 - i * 5.5} width={w} height="4.5" rx="1" />
          })}
        </g>
      </g>
    )
  }
  return (
    <svg className="vl-balance" viewBox="0 0 120 62" width="96" height="50" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M60 24 V56 M48 58 H72" className="vl-post" />
      <path d="M18 24 H102" className="vl-beam" style={{ '--tilt': `${tilt}deg` } as CSSProperties} />
      {pan(1)}
      {pan(-1)}
      <circle cx="60" cy="24" r="2.5" className="vl-pivot" />
    </svg>
  )
}

// 마을 이야기 (명세 3번). 턴 결과에서 만든 대사를 양피지에 적는다.
// live: 밤 연출 중. 새 줄이 한 줄씩 나타나고 맨 아래로 따라간다.
export function VillageLog({ lines, live = false, children }: { lines: Line[] | null; live?: boolean; children?: ReactNode }) {
  const log = useRef<HTMLDivElement>(null)
  const count = lines?.length ?? 0
  useEffect(() => {
    if (live && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [live, count])
  return (
    <aside className="vl-talk" aria-label="마을 이야기">
      <h3>마을 이야기</h3>
      <div ref={log} className={live ? 'vl-log is-live' : 'vl-log'} aria-live={live ? 'polite' : undefined}>
        {!lines && <p className="vl-event is-quiet">아직 첫날 밤이 오지 않았다. 집마다 쪽지를 고르고 밤으로 넘긴다.</p>}
        {lines?.map((line, i) =>
          line.kind === 'when' ? (
            <p key={i} className="vl-when">
              {line.text}
            </p>
          ) : line.kind === 'say' ? (
            <p key={i} className="vl-line">
              <span className="vl-tok" aria-label={`${line.who}번`}>
                {line.who}
              </span>
              <span>{line.text}</span>
            </p>
          ) : line.kind === 'scale' ? (
            <p key={i} className="vl-line vl-scale">
              <span className="vl-tok" aria-label={`${line.who}번 저울`}>
                {line.who}
              </span>
              <Balance scale={line.scale} me={line.me} label={`${line.who}번 저울: ${line.detail}`} />
              <span aria-hidden>
                {line.text}
                {line.scale.mine != null && <span className="vl-mine"> · 내 쪽지 {signed(line.scale.mine)}</span>}
              </span>
            </p>
          ) : (
            <p key={i} className={line.good ? 'vl-event is-good' : 'vl-event'}>
              {line.text}
            </p>
          ),
        )}
      </div>
      {children}
    </aside>
  )
}
