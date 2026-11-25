import { Fragment, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { percent } from '../components/results/resultLabels'
import { SUSPICION, endReasonLabels, outcomeLabels } from '../gameApi'
import type { GameState, TurnResult } from '../gameApi'
import { BookLink, TheoryBook } from './TheoryBook'
import { THEORY_TOPICS, getTacticTip } from './theoryBook'
import { TAG_LABELS, gameSummary } from './village'
import type { ChartPin, TagKey, TopicKey } from './village'

function Multiline({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  )
}

function TacticPopover({
  id,
  tag,
  onOpenBook,
}: {
  id: string
  tag: TagKey
  onOpenBook: (topic: TopicKey, opener: HTMLElement | null) => void
}) {
  const tipRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const topic = THEORY_TOPICS[tag]
  const tip = getTacticTip(tag)

  useEffect(() => {
    const el = tipRef.current
    if (!el) return
    const onToggle = (e: Event) => {
      const toggleEvent = e as ToggleEvent
      if (toggleEvent.newState !== 'open') return
      const btn = btnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
      const top = Math.max(8, Math.min(r.bottom + 8, window.innerHeight - h - 8))
      el.style.left = `${Math.round(left)}px`
      el.style.top = `${Math.round(top)}px`
    }
    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [])

  return (
    <>
      <button ref={btnRef} type="button" className="gr-tag" popoverTarget={id}>
        {TAG_LABELS[tag]}
      </button>
      <div ref={tipRef} id={id} popover="auto" className="gr-tip">
        <div className="gr-tip-body">
          <h4>
            {topic.title}
            <small>{topic.en}</small>
          </h4>
          <p>{tip.easy}</p>
          <span className="gr-tip-label">이 게임에서는</span>
          <p>{tip.game}</p>
        </div>
        <p className="gr-tip-theory">
          {tip.theory}
          <cite>{tip.cite}</cite>
        </p>
        <footer>
          <BookLink
            label="책에서 자세히"
            onClick={() => {
              const el = tipRef.current
              if (el?.matches(':popover-open')) el.hidePopover()
              onOpenBook(tag, btnRef.current)
            }}
          />
        </footer>
      </div>
    </>
  )
}

function ResultChart({
  turns,
  deceived,
  peaks,
  pins,
  citizenCount,
  majorityNeed,
}: {
  turns: number[]
  deceived: number[]
  peaks: (number | null)[]
  pins: Record<number, ChartPin>
  citizenCount: number
  majorityNeed: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [phase, setPhase] = useState<'armed' | 'play'>(() =>
    typeof IntersectionObserver === 'undefined' ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      ? 'play'
      : 'armed',
  )
  const [runId, setRunId] = useState(0)
  const hasPeaks = peaks.some((v) => v != null)

  const triggerPlay = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('play')
      return
    }
    setPhase('armed')
    setRunId((n) => n + 1)
  }

  useEffect(() => {
    if (runId === 0) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase('play'))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [runId])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPhase('armed')
          setRunId((n) => n + 1)
          io.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    io.observe(svg)
    return () => io.disconnect()
  }, [])

  const count = Math.max(deceived.length, 1)
  const x0 = 92
  const step = count <= 8 ? 72 : 48
  const bw = count <= 8 ? 36 : 26
  const plotRightX = x0 + step * count
  const minCols = Math.max(count, 6)
  const viewW = x0 + step * minCols + 88

  const topMax = Math.max(citizenCount, majorityNeed, 1)
  const topBase = 114
  const topPlotH = 84
  const topUnit = topPlotH / topMax
  const majY = topBase - majorityNeed * topUnit

  const botPlotH = 100
  const baseBotBase = 296
  const pinLayout: Record<number, { dotY: number; textY: number }> = {}
  const placedPins: { left: number; right: number; y: number }[] = []
  let minPinY = topBase + 24

  for (let i = 0; i < deceived.length; i++) {
    const pin = pins[i]
    if (!pin) continue
    const cx = x0 + i * step + bw / 2
    const hTop = deceived[i] * topUnit
    const peakVal = peaks[i]
    const hBot = peakVal != null ? Math.min(peakVal, 100) * (botPlotH / 100) : 0
    const dotY = hasPeaks ? baseBotBase - hBot - 11 : topBase - hTop - 11
    const estW = pin.labels.join(', ').length * 10.5 + 12
    const left = cx - estW / 2
    const right = cx + estW / 2
    let textY = dotY - 10
    while (placedPins.some((p) => !(right < p.left || left > p.right) && Math.abs(textY - p.y) < 18)) {
      textY -= 18
    }
    placedPins.push({ left, right, y: textY })
    if (hasPeaks && textY < minPinY) minPinY = textY
    pinLayout[i] = { dotY, textY }
  }

  // 핀이 여러 날 연속으로 쌓여 위 칸 기준선과 가까워지면 아래 칸을 그만큼 내려 겹침을 막는다.
  const botShift = hasPeaks ? Math.max(0, topBase + 26 - minPinY) : 0
  const botBase = baseBotBase + botShift
  const trialY = botBase - SUSPICION.threshold
  const viewH = hasPeaks ? botBase + 30 : 146

  const pinEntries = Object.entries(pins)
    .map(([i, p]) => [Number(i), p] as const)
    .sort((a, b) => a[0] - b[0])

  const ariaParts = [
    `위: 날짜별 속은 주민 수 ${deceived.map((d, i) => `${turns[i]}일 ${d}명`).join(', ')}. 과반선 ${majorityNeed}명.`,
  ]
  if (hasPeaks) {
    ariaParts.push(
      `아래: 날짜별 나에 대한 최고 의심도 ${peaks.map((v, i) => `${turns[i]}일 ${v ?? '없음'}`).join(', ')}. 재판 기준 ${SUSPICION.threshold}.`,
    )
  }
  if (pinEntries.length > 0) {
    ariaParts.push(
      `주요 사건: ${pinEntries.map(([i, p]) => `${turns[i]}일 ${p.labels.join(', ')}`).join('; ')}.`,
    )
  }

  return (
    <div className="gr-chart-wrap">
      <div className="gr-chart-head">
        <h3>날짜별 흐름</h3>
        <button type="button" className="gr-replay" onClick={triggerPlay}>
          다시 보기
        </button>
      </div>
      <div className="gr-chart-scroll">
        <svg
          ref={svgRef}
          className={`gr-chart ${phase === 'play' ? 'is-play' : 'is-armed'}`}
          viewBox={`0 0 ${viewW} ${viewH}`}
          role="img"
          aria-label={ariaParts.join(' ')}
        >
          <text className="gr-axis-label" x="0" y="24">
            속은 주민
          </text>
          <path d={`M${x0 - 8} ${majY} H${plotRightX}`} stroke="var(--forest)" strokeWidth="1.6" strokeDasharray="4 4" />
          <text x={plotRightX + 8} y={majY + 5} fill="var(--forest)">
            과반 {majorityNeed}
          </text>
          <path d={`M${x0 - 8} ${topBase} H${plotRightX}`} stroke="var(--border)" strokeWidth="1.5" />

          {hasPeaks && (
            <>
              <text className="gr-axis-label" x="0" y={botBase - botPlotH - 18}>
                최고 의심도
              </text>
              <path
                d={`M${x0 - 8} ${trialY} H${plotRightX}`}
                stroke="var(--rust)"
                strokeWidth="1.6"
                strokeDasharray="4 4"
              />
              <text x={plotRightX + 8} y={trialY + 5} fill="var(--rust)">
                재판 {SUSPICION.threshold}
              </text>
              <path d={`M${x0 - 8} ${botBase} H${plotRightX}`} stroke="var(--border)" strokeWidth="1.5" />
            </>
          )}

          {deceived.map((d, i) => {
            const x = x0 + i * step
            const cx = x + bw / 2
            const hTop = d * topUnit
            const peakVal = peaks[i]
            const hBot = peakVal != null ? Math.min(peakVal, 100) * (botPlotH / 100) : 0
            const over = peakVal != null && peakVal >= SUSPICION.threshold
            const pin = pins[i]
            const pinColor = pin?.danger ? 'var(--rust)' : 'var(--wood)'
            const placed = pinLayout[i]
            const pinDotY = placed ? placed.dotY + botShift : 0
            const pinTextY = placed ? placed.textY + botShift : 0

            return (
              <g key={`${runId}-${i}`} style={{ '--i': i } as CSSProperties}>
                <rect
                  className="gr-bar"
                  x={x}
                  y={topBase - hTop}
                  width={bw}
                  height={hTop}
                  rx="3"
                  fill="var(--leave)"
                />
                {hasPeaks && peakVal != null && (
                  <rect
                    className="gr-bar"
                    x={x}
                    y={botBase - hBot}
                    width={bw}
                    height={hBot}
                    rx="3"
                    fill={over ? 'var(--rust)' : 'var(--wood)'}
                  />
                )}
                <text className="gr-daylabel" x={cx} y={hasPeaks ? botBase + 22 : topBase + 22} textAnchor="middle">
                  {turns[i]}일
                </text>
                {pin && placed && (
                  <g className="gr-pin">
                    {pinDotY - pinTextY > 14 && (
                      <line
                        x1={cx}
                        y1={pinDotY - 5}
                        x2={cx}
                        y2={pinTextY + 4}
                        stroke={pinColor}
                        strokeWidth="1.2"
                        strokeDasharray="2 2"
                        opacity="0.65"
                      />
                    )}
                    <circle cx={cx} cy={pinDotY} r="4" fill={pinColor} />
                    <text x={cx} y={pinTextY} textAnchor="middle" fill={pinColor}>
                      {pin.labels.join(', ')}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// 결과 화면: 도장 머리 → 이 판 읽기 → 결정적 순간(+꼬리표) → 영향력 → 2단 그래프 → 자세한 표/새 게임.
export function GameResult({
  state,
  history,
  children,
}: {
  state: GameState
  history: TurnResult[]
  children?: ReactNode
}) {
  const s = gameSummary(state, history)
  const won = state.outcome !== 'loss'
  const stampText = state.outcome ? outcomeLabels[state.outcome] : '종료'
  const idPrefix = useId()
  const [book, setBook] = useState<{ topic: TopicKey; opener: HTMLElement | null } | null>(null)

  const openBook = (topic: TopicKey, opener: HTMLElement | null) => {
    setBook({ topic, opener })
  }

  return (
    <section className="gr-sheet" aria-live="polite">
      <div className="gr-verdict">
        <div className={won ? 'gr-stamp is-win' : 'gr-stamp'} aria-hidden="true">
          {stampText}
        </div>
        <h2>
          <span className="sr-only">{stampText}. </span>
          {s.headline}
        </h2>
        <p className="gr-sub">
          {state.bot_win_rate != null
            ? `같은 마을에서 기본 마피아 봇이 이기는 비율은 ${percent(state.bot_win_rate)}예요.`
            : state.end_reason
              ? `끝난 이유: ${endReasonLabels[state.end_reason]}`
              : '이번 판의 기록을 정리했어요.'}
        </p>
      </div>

      <div className="gr-reading">
        <div className="gr-step">
          <h3>이번 마을</h3>
          <div className="gr-chips">
            {s.chips.map((chip) => (
              <span key={chip} className="gr-chip">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="gr-step">
          <h3>출발선</h3>
          <p>
            <Multiline lines={s.baseline.lines} />
          </p>
        </div>

        <div className="gr-step">
          <h3>결정타</h3>
          <p className="gr-lead">
            <Multiline lines={s.decisive} />
          </p>
        </div>

        <div className="gr-step">
          <h3>이론으로</h3>
          <div>
            <BookLink
              showIcon
              label={s.baseline.linkTitle}
              sub={s.baseline.linkSub}
              onClick={(btn) => openBook(s.baseline.topic, btn)}
            />
          </div>
        </div>
      </div>

      {s.moments.length > 0 && (
        <>
          <h3 className="gr-block-title">결정적 순간</h3>
          <ol className="gr-moments">
            {s.moments.map((m, idx) => {
              const tipId = `${idPrefix}-tip-${idx}`
              return (
                <li key={`${m.day ?? 'all'}-${idx}`}>
                  <span className="gr-day">{m.day != null ? `${m.day}일` : '전체'}</span>
                  <span className="gr-moment-text">
                    {m.text}
                    {m.tag && <TacticPopover id={tipId} tag={m.tag} onOpenBook={openBook} />}
                  </span>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {s.influence && (
        <div className="gr-influence">
          <b>{s.influence.count}번</b>
          <p>
            내 쪽지가 주민의 마음을 거짓 쪽으로 뒤집은 횟수예요.
            {s.influence.noNoteWinRate && (
              <small>
                쪽지 없이 각자 본 하늘만으로 정했다면, 이 난이도에서 주민이 맞힐 확률은 {s.influence.noNoteWinRate}였어요.
              </small>
            )}
          </p>
        </div>
      )}

      {history.length > 0 && (
        <ResultChart
          turns={history.map((t) => t.turn)}
          deceived={s.deceived}
          peaks={s.peaks}
          pins={s.pins}
          citizenCount={s.citizenCount}
          majorityNeed={s.majorityNeed}
        />
      )}

      {children && <div className="gr-footer">{children}</div>}

      <TheoryBook topic={book?.topic ?? null} opener={book?.opener} onClose={() => setBook(null)} />
    </section>
  )
}
