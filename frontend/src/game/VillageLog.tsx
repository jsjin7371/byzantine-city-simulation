import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { decisions } from '../components/results/resultLabels'
import type { CitizenType } from '../gameApi'
import { TONIGHT_SCALE_TITLE, pairLogScales, tonightVotesText, villageLogHeader, voteItemLabel } from './village'
import type { Line, Scale, ScaleLine, TonightVotes } from './village'

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
      <text x="18" y="72" fontSize="15" fontWeight="700" textAnchor="middle" className="vl-pan-label">
        대피
      </text>
      <text x="102" y="72" fontSize="15" fontWeight="700" textAnchor="middle" className="vl-pan-label">
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

// 쪽지 카드가 열려 있는 동안 마을 이야기 맨 위에 보여 주는 오늘 밤 저울(합계·예상 결과 없음).
function TonightScaleBlock({
  city,
  votes,
  highlighted = false,
}: {
  city: number
  votes: TonightVotes
  highlighted?: boolean
}) {
  const { subtitle, note, aiNote, aria } = tonightVotesText(votes)
  return (
    <section
      className={highlighted ? 'vl-tonight is-tut-votes' : 'vl-tonight'}
      aria-label={`${city}번 집 · ${TONIGHT_SCALE_TITLE}`}
    >
      <p className="sr-only">{aria}</p>
      {highlighted && (
        <svg
          className="tut-tonight-frame"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="tut-tonight-stroke"
            d="M 1.6 1.6 Q 50 0.5 98.5 1.8 Q 99.4 50 98.4 98.4 Q 50 99.5 1.5 98.3 Q 0.6 50 1.8 1.4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <div aria-hidden="true">
        <div className="vl-tonight-head">
          <h3 className="vl-tonight-title">
            {city}번 집 · {TONIGHT_SCALE_TITLE}
          </h3>
          <span className="vl-tonight-sub">{subtitle}</span>
        </div>
        <ul className="vl-tonight-list">
          {votes.items.map((item) => {
            const label = voteItemLabel(item)
            const kind = item.role === 'hint' ? 'is-hint' : item.role === 'player' ? 'is-mine' : 'is-note'
            const emptyText = item.role === 'hint' ? '상쇄' : '고르는 중'
            const pct = item.weight > 0 ? Math.min(100, Math.max(8, item.weight)) : 0
            return (
              <li key={String(item.from)} className={votes.ai ? 'vl-tonight-row is-ai' : 'vl-tonight-row'}>
                <span className="vl-tonight-who">{label}</span>
                {votes.ai && <span className="vl-tonight-dots" />}
                <span className={`vl-claim-pill ${item.claim ? `is-${item.claim}` : 'is-pending'}`}>
                  {item.claim ? decisions[item.claim] : emptyText}
                </span>
                {!votes.ai && (
                  <span className="vl-tonight-meter">
                    {pct > 0 ? (
                      <span className="vl-tonight-track">
                        <span className={`vl-tonight-fill ${kind}`} style={{ width: `${pct}%` }} />
                      </span>
                    ) : (
                      <span className="vl-tonight-zero">{item.role === 'hint' ? '상쇄' : '안 믿음'}</span>
                    )}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        {note && <p className="vl-tonight-note">{note}</p>}
        {aiNote && <p className="vl-tonight-note">{aiNote}</p>}
      </div>
    </section>
  )
}

// 마을 이야기 (명세 3번). 턴 결과에서 만든 대사를 일기장에 적고, 속마음·저울은 줄 오른쪽 토글 뒤에 접는다.
// live: 밤 연출 중. 새 줄이 한 줄씩 나타나고 맨 아래로 따라간다.
export function VillageLog({
  lines,
  day,
  citizenType = 'wary',
  ring = false,
  live = false,
  tonightScale = null,
  highlight = null,
  onScaleOpen,
  scaleBtnRef,
  children,
}: {
  lines: Line[] | null
  day?: number
  citizenType?: CitizenType
  ring?: boolean
  live?: boolean
  tonightScale?: { city: number; votes: TonightVotes } | null
  highlight?: 'log' | 'scale' | 'votes' | null
  onScaleOpen?: (open: boolean) => void
  scaleBtnRef?: RefObject<HTMLButtonElement | null>
  children?: ReactNode
}) {
  const { intro, showLegend } = villageLogHeader(citizenType)
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
      <p className={citizenType === 'ai' ? 'vl-intro is-ai' : 'vl-intro'}>{intro}</p>
      {showLegend && (
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
      )}
      <div className="vl-tonight-live" aria-live="polite" aria-atomic="true">
        {tonightScale && (
          <TonightScaleBlock
            city={tonightScale.city}
            votes={tonightScale.votes}
            highlighted={highlight === 'votes'}
          />
        )}
      </div>
      <div ref={log} className={live ? 'vl-log is-live' : 'vl-log'} aria-live={live ? 'polite' : undefined}>
        {!entries && (
          <p className="vl-event is-quiet">
            {ring
              ? '아직 첫날 밤이 오지 않았어요. 양옆 두 집의 쪽지를 고르고 밤으로 넘겨 보세요.'
              : '아직 첫날 밤이 오지 않았어요. 집마다 쪽지를 고르고 밤으로 넘겨 보세요.'}
          </p>
        )}
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
                  {scale && <span className="sr-only">{scale.summary}</span>}
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
