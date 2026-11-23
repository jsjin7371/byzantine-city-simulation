import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { pairLogScales } from './village'
import type { Line, Scale, ScaleLine } from './village'

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
    <svg className="vl-balance" viewBox="0 0 120 62" width="84" height="44" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M60 24 V56 M48 58 H72" className="vl-post" />
      <path d="M18 24 H102" className="vl-beam" style={{ '--tilt': `${tilt}deg` } as CSSProperties} />
      {pan(1)}
      {pan(-1)}
      <circle cx="60" cy="24" r="2.5" className="vl-pivot" />
    </svg>
  )
}

function WhyBox({ id, scale }: { id: string; scale: ScaleLine }) {
  return (
    <div id={id} className="vl-why-box">
      <div className="vl-why-scale">
        <Balance scale={scale.scale} me={scale.me} label={`${scale.who}번 저울: ${scale.text}`} />
        <p className="vl-why-calc">{scale.detail}</p>
      </div>
    </div>
  )
}

// 마을 이야기 (명세 3번). 턴 결과에서 만든 대사를 일기장에 적고, 계산식·저울은 "왜?" 뒤에 접는다.
// live: 밤 연출 중. 새 줄이 한 줄씩 나타나고 맨 아래로 따라간다.
export function VillageLog({
  lines,
  day,
  live = false,
  children,
}: {
  lines: Line[] | null
  day?: number
  live?: boolean
  children?: ReactNode
}) {
  const log = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const entries = lines ? pairLogScales(lines) : null
  const count = entries?.length ?? 0
  useEffect(() => {
    if (live && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [live, count])

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <aside className="vl-talk" aria-label="마을 이야기">
      <div className="vl-head">
        <h3>마을 이야기</h3>
        {day != null && <span className="vl-day">{day}일째 밤</span>}
      </div>
      <div ref={log} className={live ? 'vl-log is-live' : 'vl-log'} aria-live={live ? 'polite' : undefined}>
        {!entries && <p className="vl-event is-quiet">아직 첫날 밤이 오지 않았다. 집마다 쪽지를 고르고 밤으로 넘긴다.</p>}
        {entries?.map((entry, i) => {
          if (entry.kind === 'when') {
            return (
              <p key={i} className="vl-when">
                {entry.text}
              </p>
            )
          }
          if (entry.kind === 'say') {
            const key = `${day ?? 0}-${entry.who}`
            const isOpen = !!entry.scale && !!open[key]
            const panelId = `vl-why-${key}`
            return (
              <article key={i} className={isOpen ? 'vl-entry is-open' : 'vl-entry'}>
                <div className="vl-entry-row">
                  <span className="vl-tok" aria-label={`${entry.who}번`}>
                    {entry.who}
                  </span>
                  <p className="vl-quote">{entry.text}</p>
                  {entry.scale && (
                    <button
                      type="button"
                      className="vl-why-btn"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => toggle(key)}
                    >
                      왜?<span aria-hidden="true">{isOpen ? ' ▾' : ' ▸'}</span>
                    </button>
                  )}
                </div>
                {isOpen && entry.scale && <WhyBox id={panelId} scale={entry.scale} />}
              </article>
            )
          }
          if (entry.kind === 'scale') {
            const s = entry.scale
            const key = `${day ?? 0}-${s.who}`
            const isOpen = !!open[key]
            const panelId = `vl-why-${key}`
            return (
              <article key={i} className={isOpen ? 'vl-entry is-open' : 'vl-entry'}>
                <div className="vl-entry-row">
                  <span className="vl-tok is-quiet" aria-label={`${s.who}번`}>
                    {s.who}
                  </span>
                  <p className="vl-quote">{s.text}</p>
                  <button
                    type="button"
                    className="vl-why-btn"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(key)}
                  >
                    왜?<span aria-hidden="true">{isOpen ? ' ▾' : ' ▸'}</span>
                  </button>
                </div>
                {isOpen && <WhyBox id={panelId} scale={s} />}
              </article>
            )
          }
          return (
            <p key={i} className={entry.good ? 'vl-event is-good' : 'vl-event'}>
              {entry.text}
            </p>
          )
        })}
      </div>
      {children && <div className="vl-foot">{children}</div>}
    </aside>
  )
}
