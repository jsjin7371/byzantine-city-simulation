import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { pairLogScales } from './village'
import type { Line, Scale, ScaleLine } from './village'

// 작은 양팔 저울: 왼쪽 접시 대피(+), 오른쪽 접시 잔류(−). 몫마다 블록 하나, 합만큼 기운다.
// 블록 색: 내 관측 초록, 이웃 쪽지 갈색, 내 쪽지 붉은색.
function Balance({ scale, me }: { scale: Scale; me: number }) {
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
    <svg className="vl-balance" viewBox="0 0 120 76" width="120" height="76" aria-hidden="true">
      <path d="M60 24 V56 M48 58 H72" className="vl-post" />
      <path d="M18 24 H102" className="vl-beam" style={{ '--tilt': `${tilt}deg` } as CSSProperties} />
      {pan(1)}
      {pan(-1)}
      <circle cx="60" cy="24" r="2.5" className="vl-pivot" />
      <text x="18" y="71" fontSize="12.5" fontWeight="700" textAnchor="middle" className="vl-pan-label">
        대피
      </text>
      <text x="102" y="71" fontSize="12.5" fontWeight="700" textAnchor="middle" className="vl-pan-label">
        잔류
      </text>
    </svg>
  )
}

function WhyBox({ id, scale }: { id: string; scale: ScaleLine }) {
  const reasons = scale.detail.slice(0, -1)
  const verdict = scale.detail[scale.detail.length - 1]
  return (
    <div id={id} className="vl-why-box">
      <Balance scale={scale.scale} me={scale.me} />
      <ul className="vl-why-list">
        {reasons.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p className="vl-why-verdict">{verdict}</p>
    </div>
  )
}

// 마을 이야기 (명세 3번). 턴 결과에서 만든 대사를 일기장에 적고, 속마음·저울은 줄 오른쪽 토글 뒤에 접는다.
// live: 밤 연출 중. 새 줄이 한 줄씩 나타나고 맨 아래로 따라간다.
export function VillageLog({
  lines,
  day,
  live = false,
  highlight = null,
  onScaleOpen,
  scaleBtnRef,
  children,
}: {
  lines: Line[] | null
  day?: number
  live?: boolean
  highlight?: 'log' | 'scale' | null
  onScaleOpen?: (open: boolean) => void
  scaleBtnRef?: RefObject<HTMLButtonElement | null>
  children?: ReactNode
}) {
  const log = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const entries = lines ? pairLogScales(lines) : null
  const count = entries?.length ?? 0
  const firstScaleIndex = entries
    ? entries.findIndex((entry) => (entry.kind === 'say' || entry.kind === 'scale') && Boolean(entry.scale))
    : -1
  const hasOpenScale = Boolean(
    entries?.some((entry) => {
      if ((entry.kind !== 'say' && entry.kind !== 'scale') || !entry.scale) return false
      const who = entry.kind === 'scale' ? entry.scale.who : entry.who
      return Boolean(open[`${day ?? 0}-${who}`])
    }),
  )
  useEffect(() => {
    if (live && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [live, count])
  useEffect(() => {
    if (highlight === 'scale' && log.current) log.current.scrollTop = 0
  }, [highlight])
  useEffect(() => {
    onScaleOpen?.(hasOpenScale)
  }, [hasOpenScale, onScaleOpen])

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <aside className={highlight === 'log' ? 'vl-talk is-tut-log' : 'vl-talk'} aria-label="마을 이야기">
      {highlight === 'log' && (
        <>
          <svg
            className="tut-log-frame"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className="tut-log-stroke"
              d="M 1.6 1.2 Q 50 0.4 98.6 1.4 Q 99.5 50 98.5 98.7 Q 50 99.6 1.4 98.6 Q 0.5 50 1.8 0.9"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="tut-note-tag is-log" aria-hidden="true">
            주민들이 여기서 이야기해요
          </span>
        </>
      )}
      <div className="vl-head">
        <h2>마을 이야기</h2>
        {day != null && <span className="vl-day">{day}일째 밤</span>}
      </div>
      <p className="vl-intro">밤마다 주민들이 나눈 말과 결정한 이유가 적혀요. 줄 옆 › 버튼을 누르면 속마음 저울이 보여요.</p>
      <div className="vl-legend" aria-hidden="true">
        <span>
          <i className="vl-swatch is-hint" />
          주민 관측
        </span>
        <span>
          <i className="vl-swatch is-note" />
          이웃 쪽지
        </span>
        <span>
          <i className="vl-swatch is-mine" />
          내 쪽지
        </span>
      </div>
      <div ref={log} className={live ? 'vl-log is-live' : 'vl-log'} aria-live={live ? 'polite' : undefined}>
        {!entries && <p className="vl-event is-quiet">아직 첫날 밤이 오지 않았어요. 집마다 쪽지를 고르고 밤으로 넘겨 보세요.</p>}
        {entries?.map((entry, i) => {
          if (entry.kind === 'when') {
            return (
              <p key={i} className="vl-when">
                {entry.text}
              </p>
            )
          }
          if (entry.kind === 'say' || entry.kind === 'scale') {
            const quiet = entry.kind === 'scale'
            const who = quiet ? entry.scale.who : entry.who
            const text = quiet ? entry.scale.text : entry.text
            const scale = entry.scale
            const key = `${day ?? 0}-${who}`
            const isOpen = !!scale && !!open[key]
            const panelId = `vl-why-${key}`
            const isFirstScale = i === firstScaleIndex
            const isGuideTarget = highlight === 'scale' && isFirstScale
            return (
              <article key={i} className={isOpen ? 'vl-entry is-open' : 'vl-entry'}>
                <div className="vl-entry-row">
                  <span className={quiet ? 'vl-tok is-quiet' : 'vl-tok'}>
                    <span className="sr-only">{who}번</span>
                    <span aria-hidden="true">{who}</span>
                  </span>
                  <p className="vl-quote">{text}</p>
                  {scale && (
                    <button
                      ref={isFirstScale ? scaleBtnRef : undefined}
                      type="button"
                      className={isGuideTarget ? 'vl-why-btn is-tut-target' : 'vl-why-btn'}
                      aria-label={`${who}번 주민 속마음 저울 보기`}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? panelId : undefined}
                      onClick={() => toggle(key)}
                    >
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                        <path d="M6 3.5 L10.5 8 L6 12.5" />
                      </svg>
                    </button>
                  )}
                </div>
                {isGuideTarget && (
                  <div className="tut-callout is-up-right" aria-hidden="true">
                    <span className="tut-note-tag">여기를 눌러 보세요</span>
                    <svg className="tut-arrow is-up" viewBox="0 0 32 30" width="32" height="30">
                      <path d="M8 26 Q17 18 19 5 M11 12 L19 4 L26 13" />
                    </svg>
                  </div>
                )}
                {isOpen && scale && <WhyBox id={panelId} scale={scale} />}
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
