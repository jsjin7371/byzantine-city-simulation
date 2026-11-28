import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { percent } from '../components/results/resultLabels'
import { SUSPICION, endReasonLabels, outcomeLabels } from '../gameApi'
import type { GameState, TurnResult } from '../gameApi'
import { BookLink, TheoryBook } from './TheoryBook'
import { THEORY_TOPICS } from './theoryBook'
import { TAG_LABELS, gameSummary } from './village'
import type { ChartPin, TagKey, TopicKey } from './village'

function TacticPopover({
  id,
  tag,
  onOpenBook,
}: {
  id: string
  tag: TagKey
  onOpenBook: (topic: TopicKey) => void
}) {
  const tipRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const topic = THEORY_TOPICS[tag]
  const tip = topic.tip

  useEffect(() => {
    const el = tipRef.current
    if (!el) return
    const closeOnScroll = (e: Event) => {
      if (e.target instanceof Node && el.contains(e.target)) return
      if (el.matches(':popover-open')) el.hidePopover()
    }
    const onToggle = (e: Event) => {
      const toggleEvent = e as ToggleEvent
      if (toggleEvent.newState !== 'open') {
        window.removeEventListener('scroll', closeOnScroll, true)
        return
      }
      const btn = btnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
      const top = Math.max(8, Math.min(r.bottom + 8, window.innerHeight - h - 8))
      el.style.left = `${Math.round(left)}px`
      el.style.top = `${Math.round(top)}px`
      window.addEventListener('scroll', closeOnScroll, { capture: true, passive: true })
    }
    el.addEventListener('toggle', onToggle)
    return () => {
      el.removeEventListener('toggle', onToggle)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [])

  return (
    <>
      <button ref={btnRef} type="button" className="gr-tag" popoverTarget={id}>
        {TAG_LABELS[tag]}
      </button>
      <div ref={tipRef} id={id} popover="auto" role="group" className="gr-tip" aria-label={topic.title}>
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
              // 팝오버가 닫히면 내부 버튼 초점이 사라지므로 showModal() 직전 꼬리표 버튼으로 맞춰 복귀 대상을 유지한다.
              btnRef.current?.focus({ preventScroll: true })
              onOpenBook(tag)
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
  colleaguePeaks,
  hasColleague,
  pins,
  citizenCount,
  majorityNeed,
}: {
  turns: number[]
  deceived: number[]
  peaks: (number | null)[]
  colleaguePeaks: (number | null)[] | null
  hasColleague: boolean
  pins: Record<number, ChartPin>
  citizenCount: number
  majorityNeed: number
}) {
  const chartId = useId()
  const [runId, setRunId] = useState(0)
  const hasPeaks = peaks.some((v) => v != null)
  const hasColleaguePeaks = Boolean(colleaguePeaks?.some((v) => v != null))

  const count = Math.max(deceived.length, 1)
  const x0 = 92
  const step = count <= 8 ? 72 : 48
  const bw = count <= 8 ? 36 : 26
  const pairGap = count <= 8 ? 4 : 2
  const pairBarW = Math.floor((bw - pairGap) / 2)
  const plotRightX = x0 + step * count
  const minCols = Math.max(count, 6)
  const viewW = x0 + step * minCols + 88

  const pinEntries = Object.entries(pins)
    .map(([i, p]) => [Number(i), p] as const)
    .sort((a, b) => a[0] - b[0])
  const laneCount = count <= 8 ? 3 : 4
  const usedLanes = Math.min(pinEntries.length, laneCount)
  const laneGap = 22
  const pinBandH = usedLanes * laneGap

  const topMax = Math.max(citizenCount, majorityNeed, 1)
  const topPlotH = 84
  const topBase = 30 + topPlotH + (!hasPeaks && usedLanes > 0 ? pinBandH + 14 : 0)
  const topUnit = topPlotH / topMax
  const majY = topBase - majorityNeed * topUnit

  const botPlotH = 100
  const botBase = topBase + 38 + pinBandH + botPlotH
  const trialY = botBase - SUSPICION.threshold
  const viewH = hasPeaks ? botBase + 30 : topBase + 32

  const ariaParts = [
    `위: 날짜별 틀린 주민 수 ${deceived.map((d, i) => `${turns[i]}일 ${d}명`).join(', ')}. 과반선 ${majorityNeed}명.`,
  ]
  if (hasPeaks) {
    ariaParts.push(
      `아래: 날짜별 나에 대한 최고 의심도 ${peaks.map((v, i) => `${turns[i]}일 ${v ?? '없음'}`).join(', ')}. 재판 기준 ${SUSPICION.threshold}.`,
    )
  }
  if (hasColleaguePeaks && colleaguePeaks) {
    ariaParts.push(
      `동료 최고 의심도 ${colleaguePeaks.map((v, i) => `${turns[i]}일 ${v ?? '없음'}`).join(', ')}.`,
    )
  }
  if (pinEntries.length > 0) {
    ariaParts.push(
      `주요 사건: ${pinEntries.map(([i, p]) => `${turns[i]}일 ${p.labels.join(', ')}`).join('; ')}.`,
    )
  }

  const pinLayout = pinEntries.map(([i, pin], k) => {
    const cx = x0 + i * step + bw / 2
    const d = deceived[i] ?? 0
    const peakVal = peaks[i]
    const colVal = hasColleaguePeaks ? colleaguePeaks?.[i] : null
    const hTop = d * topUnit
    const hBot = peakVal != null ? Math.min(peakVal, 100) * (botPlotH / 100) : 0
    const hCol = colVal != null ? Math.min(colVal, 100) * (botPlotH / 100) : 0
    const isOtherTrial = pin.trialKind === 'colleague' || pin.trialKind === 'other'
    return {
      i,
      pin,
      cx,
      isOtherTrial,
      color: pin.danger ? 'var(--rust)' : 'var(--wood)',
      dotY: hasPeaks ? botBase - Math.max(hBot, hCol) - 11 : topBase - hTop - 11,
      textY: (hasPeaks ? botBase - botPlotH : topBase - topPlotH) - 24 - (k % laneCount) * laneGap,
    }
  })

  const allyPatId = `${chartId}-ally`
  const allyOverPatId = `${chartId}-ally-over`

  return (
    <div className="gr-chart-wrap">
      <div className="gr-chart-head">
        <h3>날짜별 흐름</h3>
        <button type="button" className="gr-replay" onClick={() => setRunId((n) => n + 1)}>
          다시 보기
        </button>
      </div>
      {hasPeaks && (
        <div className="gr-chart-legend" aria-label="그래프 범례">
          {hasColleaguePeaks && (
            <>
              <span className="gr-legend-item">
                <i className="gr-swatch is-me" aria-hidden="true" />내 의심도
              </span>
              <span className="gr-legend-item">
                <i className="gr-swatch is-ally" aria-hidden="true" />동료 의심도
              </span>
            </>
          )}
          <span className="gr-legend-item">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="4" fill="var(--rust)" />
            </svg>
            내 재판
          </span>
          <span className="gr-legend-item">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <polygon points="6,1 11,6 6,11 1,6" fill="#fdfaf1" stroke="var(--wood)" strokeWidth="2" />
            </svg>
            {hasColleague ? '동료·주민 재판' : '주민 재판'}
          </span>
        </div>
      )}
      <div className="gr-chart-scroll" tabIndex={0} role="region" aria-label="날짜별 흐름 그래프">
        <svg
          key={runId}
          className={runId > 0 ? 'gr-chart is-play' : 'gr-chart'}
          viewBox={`0 0 ${viewW} ${viewH}`}
          style={{ minWidth: viewW, maxWidth: Math.max(680, viewW) }}
          role="img"
          aria-label={ariaParts.join(' ')}
        >
          {hasColleaguePeaks && (
            <defs>
              <pattern id={allyPatId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#dce5ec" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="#455f75" strokeWidth="2.4" />
              </pattern>
              <pattern id={allyOverPatId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#f4d9cf" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="#a8361f" strokeWidth="2.4" />
              </pattern>
            </defs>
          )}
          <text className="gr-axis-label" x="0" y={hasPeaks ? 24 : topBase - topPlotH}>
            틀린 주민
          </text>
          <path d={`M${x0 - 8} ${majY} H${plotRightX}`} stroke="var(--forest)" strokeWidth="1.6" strokeDasharray="4 4" />
          <text x={plotRightX + 8} y={majY + 5} fill="var(--forest)">
            과반 {majorityNeed}
          </text>
          <path d={`M${x0 - 8} ${topBase} H${plotRightX}`} stroke="var(--border)" strokeWidth="1.5" />

          {hasPeaks && (
            <>
              <text className="gr-axis-label" x="0" y={botBase - botPlotH}>
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
            const colVal = hasColleaguePeaks ? colleaguePeaks?.[i] : null
            const hCol = colVal != null ? Math.min(colVal, 100) * (botPlotH / 100) : 0
            const colOver = colVal != null && colVal >= SUSPICION.threshold

            return (
              <g key={i} style={{ '--i': i } as CSSProperties}>
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
                    width={hasColleaguePeaks ? pairBarW : bw}
                    height={hBot}
                    rx="3"
                    fill={over ? 'var(--rust)' : 'var(--wood)'}
                  />
                )}
                {hasColleaguePeaks && colVal != null && hCol > 0 && (
                  <rect
                    className="gr-bar"
                    x={x + pairBarW + pairGap}
                    y={botBase - hCol}
                    width={pairBarW}
                    height={hCol}
                    rx="3"
                    fill={`url(#${colOver ? allyOverPatId : allyPatId})`}
                    stroke={colOver ? 'var(--rust)' : '#455f75'}
                    strokeWidth="1.4"
                  />
                )}
                <text className="gr-daylabel" x={cx} y={hasPeaks ? botBase + 22 : topBase + 22} textAnchor="middle">
                  {turns[i]}일
                </text>
              </g>
            )
          })}

          {pinLayout.map(({ i, cx, color, dotY, textY, isOtherTrial }) => (
            <g key={`stem-${i}`} className="gr-pin" style={{ '--i': i } as CSSProperties}>
              {dotY - textY > 14 && (
                <line
                  x1={cx}
                  y1={dotY - 6}
                  x2={cx}
                  y2={textY + 5}
                  stroke={color}
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                  opacity="0.45"
                />
              )}
              {isOtherTrial ? (
                <polygon
                  points={`${cx},${dotY - 5} ${cx + 5},${dotY} ${cx},${dotY + 5} ${cx - 5},${dotY}`}
                  fill="#fdfaf1"
                  stroke={color}
                  strokeWidth="2"
                />
              ) : (
                <circle cx={cx} cy={dotY} r="4" fill={color} />
              )}
            </g>
          ))}

          {pinLayout.map(({ i, pin, cx, color, textY }) => (
            <text
              key={`label-${i}`}
              className="gr-pin gr-pin-label"
              style={{ '--i': i } as CSSProperties}
              x={cx}
              y={textY}
              textAnchor="middle"
              fill={color}
            >
              {pin.labels.join(', ')}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

// 결과 화면: 도장 머리 → 이 판 읽기 → 결정적 순간(+꼬리표) → 영향력 → 2단 그래프 → 자세한 표/새 게임.
export function GameResult({
  state,
  history,
  scenarioTopic,
  children,
}: {
  state: GameState
  history: TurnResult[]
  scenarioTopic?: TopicKey
  children?: ReactNode
}) {
  const s = gameSummary(state, history, scenarioTopic)
  const won = state.outcome === 'win' || state.outcome === 'perfect_win'
  const stampText = state.outcome ? outcomeLabels[state.outcome] : '종료'
  const subParts = [
    state.end_reason ? `끝난 이유: ${endReasonLabels[state.end_reason]}` : null,
    state.bot_win_rate != null
      ? `같은 마을에서 기본 마피아 봇이 이기는 비율은 ${percent(state.bot_win_rate)}예요.`
      : null,
  ].filter(Boolean)
  const idPrefix = useId()
  const [bookTopic, setBookTopic] = useState<TopicKey | null>(null)

  return (
    <section className="gr-sheet">
      <div className="gr-verdict">
        <div className={won ? 'gr-stamp is-win' : 'gr-stamp'} aria-hidden="true">
          {stampText}
        </div>
        <h2 aria-live="polite">
          <span className="sr-only">{stampText}. </span>
          {s.headline}
        </h2>
        <p className="gr-sub">
          {subParts.length > 0 ? subParts.join(' · ') : '이번 판의 기록을 정리했어요.'}
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
          <p>{s.baseline.lines.join('\n')}</p>
        </div>

        <div className="gr-step">
          <h3>결정타</h3>
          <p className="gr-lead">{s.decisive.join('\n')}</p>
        </div>

        <div className="gr-step">
          <h3>이론으로</h3>
          <div>
            <BookLink
              label={s.baseline.linkTitle}
              sub={s.baseline.linkSub}
              icon
              onClick={() => setBookTopic(s.baseline.topic)}
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
                    {m.tag && <TacticPopover id={tipId} tag={m.tag} onOpenBook={setBookTopic} />}
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
                쪽지 없이 각자 본 하늘만으로 정했다면, 하룻밤에 마피아가 주민 과반을 속이지 못할 확률은{' '}
                {s.influence.noNoteWinRate}예요.
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
          colleaguePeaks={s.colleaguePeaks}
          hasColleague={s.hasColleague}
          pins={s.pins}
          citizenCount={s.citizenCount}
          majorityNeed={s.majorityNeed}
        />
      )}

      {children && <div className="gr-footer">{children}</div>}

      <TheoryBook topic={bookTopic} onClose={() => setBookTopic(null)} />
    </section>
  )
}
