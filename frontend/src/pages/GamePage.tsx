import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { decisions, percent } from '../components/results/resultLabels'
import { errorMessage } from '../lib/errors'
import {
  SUSPICION,
  createGame,
  defaultClaims,
  getGame,
  playTurn,
} from '../gameApi'
import type { CitizenType, Claim, Difficulty, GameState, TurnResult } from '../gameApi'
import { GameStart } from '../game/GameStart'
import { Tutorial } from '../game/Tutorial'
import { VillageBoard } from '../game/VillageBoard'
import { VillageLog } from '../game/VillageLog'
import { GameResult } from '../game/GameResult'
import {
  TUTORIAL_SEED,
  TUTORIAL_STEPS,
  citizenScales,
  fooledDots,
  nightSteps,
  tutorialStep,
  villageLines,
  visibleLines,
} from '../game/village'
import './GamePage.css'

// 의심도 게이지. 재판 기준(60) 위치에 선을 긋는다.
function Gauge({ value, label }: { value: number; label: string }) {
  return (
    <div className="gm-bar">
      <Progress value={value} aria-label={label} />
      <span className="gm-line" style={{ left: `${SUSPICION.threshold}%` }} aria-hidden />
    </div>
  )
}

const weather = { danger: '태풍', safe: '맑음' } as const

function TurnReport({ result }: { result: TurnResult }) {
  return (
    <section className="gm-panel" aria-label={`${result.turn}일째 결과`}>
      <h2>
        {result.turn}일째 결과 · 주민 정확도 {percent(result.accuracy)}
      </h2>
      <div className="gm-citizens">
        {result.cities
          .filter((c) => c.role === 'citizen')
          .map((c) => (
            <article key={c.city} className="gm-citizen">
              <h3>
                {c.city}번 주민 · 관측 {c.hint ? weather[c.hint] : '—'} ·{' '}
                {c.decision ? decisions[c.decision] : '—'}{' '}
                <span className={c.correct ? 'rs-correct' : 'rs-incorrect'}>
                  {c.correct ? '정답' : '오답'}
                </span>
              </h3>
              {c.suspicion ? (
                Object.entries(c.suspicion).map(([target, value]) => (
                  <div key={target} className="gm-gauge">
                    <span>{target}번 집</span>
                    <Gauge value={value} label={`${target}번 집 의심도`} />
                    <span>{value}</span>
                  </div>
                ))
              ) : (
                <p className="gm-muted">의심도 없음 (다수결 주민)</p>
              )}
              {c.reason && <p className="gm-reason">{c.reason}</p>}
            </article>
          ))}
      </div>
      <h3>점선 대조</h3>
      {result.sharing.length === 0 && <p className="gm-muted">오늘 밤 점선 대조 없음</p>}
      <ul>
        {result.sharing.map((s) => (
          <li key={s.pair.join('-')}>
            {s.pair[0]}번 주민 ↔ {s.pair[1]}번 주민:{' '}
            {s.contradictions.length === 0
              ? '모순 없음'
              : s.contradictions
                  .map(
                    (x) =>
                      `${x.city}번 집 모순 (${Object.entries(x.told)
                        .map(([to, m]) => `${to}번에게 ${decisions[m.claim]}`)
                        .join(', ')})`,
                  )
                  .join(' / ')}
          </li>
        ))}
      </ul>
      <h3>재판</h3>
      {result.vote ? (
        <p>
          {Object.entries(result.vote.ballots)
            .map(([from, to]) => `${from}→${to}`)
            .join(', ')}{' '}
          · 지목:{' '}
          {result.vote.accused === null
            ? '없음 (과반 미달)'
            : `${result.vote.accused}번 집${result.vote.caught ? ' (마피아 발각)' : ' (무고한 주민 지목)'}`}
        </p>
      ) : (
        <p className="gm-muted">재판이 열리지 않았어요.</p>
      )}
    </section>
  )
}

// 연필 질감 SVG 필터 (목업 start.html pencil-gaegu). 게임 페이지에 한 번만 둔다.
function PencilFilters() {
  return (
    <svg width="0" height="0" className="gm-svg-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="vb-pencil" x="-5%" y="-12%" width="110%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={2} seed={13} result="edge" />
          <feDisplacementMap in="SourceGraphic" in2="edge" scale={1.15} xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves={2} seed={21} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.45 0.60" result="mask" />
          <feComposite in="rough" in2="mask" operator="in" />
        </filter>
        <filter id="vb-pencil-sm" x="-4%" y="-10%" width="108%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={21} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.28 0.76" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
      </defs>
    </svg>
  )
}

function scrollIntoView(el: HTMLElement | null) {
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  el?.scrollIntoView({ behavior, block: 'start' })
}

export function GamePage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [citizenType, setCitizenType] = useState<CitizenType>('wary')
  const [state, setState] = useState<GameState | null>(null)
  const [claims, setClaims] = useState<Record<string, Claim>>({})
  const [history, setHistory] = useState<TurnResult[]>([])
  const [viewed, setViewed] = useState(0) // 다시 볼 턴 (1부터). 0이면 마지막 턴
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<number | null>(null) // 밤 연출 중인 단계. null이면 최종 상태
  const [tutorial, setTutorial] = useState(false)
  const [tutorialCursor, setTutorialCursor] = useState(0)
  const [cardOpen, setCardOpen] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inGame = state !== null
  const prevInGame = useRef(inGame)
  useEffect(() => {
    if (prevInGame.current !== inGame) {
      prevInGame.current = inGame
      headingRef.current?.focus({ preventScroll: true })
    }
  }, [inGame])

  const result = history.at(-1) ?? null
  const steps = useMemo(() => (result ? nightSteps(result) : []), [result])
  // 단계마다 정해진 시간 뒤 다음 단계로. 마지막(다음 날)에 닿으면 연출 끝.
  useEffect(() => {
    if (step == null) return
    const next = steps[step + 1]?.phase === 'day' ? null : step + 1
    const timer = setTimeout(() => setStep(next), steps[step].ms)
    return () => clearTimeout(timer)
  }, [step, steps])
  useEffect(() => {
    if (step == null) return
    const skip = (e: KeyboardEvent) => e.key === 'Escape' && setStep(null)
    window.addEventListener('keydown', skip)
    return () => window.removeEventListener('keydown', skip)
  }, [step])

  async function run(task: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (cause) {
      setError(errorMessage(cause, fallback))
    } finally {
      setBusy(false)
    }
  }

  const start = (isTutorial = false) =>
    run(async () => {
      setState(null) // 실패해도 이전 게임을 이어서 진행하지 않게 (God은 새 요청 때 이전 게임을 버린다)
      const game = isTutorial
        ? await createGame('easy', 'wary', TUTORIAL_SEED)
        : await createGame(difficulty, citizenType)
      setState(game)
      setTutorial(isTutorial)
      setTutorialCursor(0)
      setCardOpen(false)
      setHistory([])
      setViewed(0)
      setStep(null)
      setClaims(defaultClaims(game))
    }, '게임을 시작하지 못했어요.')

  const submit = () =>
    run(async () => {
      if (!state) return
      const turn = await playTurn(state.game_id, state.turn + 1, claims)
      setHistory([...history, turn])
      setViewed(0)
      // 움직임 줄이기 설정이면 연출 없이 바로 최종 상태
      setStep(matchMedia('(prefers-reduced-motion: reduce)').matches ? null : 0)
      setState({
        ...state,
        turn: turn.turn,
        game_over: turn.game_over,
        outcome: turn.outcome,
        end_reason: turn.end_reason,
        next_hints: turn.next_hints,
        next_share_pairs: turn.next_share_pairs,
      })
      if (turn.game_over) setTutorial(false)
      else setTutorialCursor((c) => tutorialStep(c, { turn: turn.turn, playing: false, cardOpen: false, gameOver: false }).cursor)
      // bot_win_rate는 GET /games/{id}에 있다. 끝났을 때만 한 번 더 조회한다 (실패해도 종료 상태는 위에서 반영됨).
      if (turn.game_over) setState(await getGame(state.game_id))
    }, '다음 밤으로 넘기지 못했어요.')

  const exit = () => {
    setState(null)
    setTutorial(false)
    setTutorialCursor(0)
    setCardOpen(false)
    setHistory([])
    setViewed(0)
    setStep(null)
    setClaims({})
    setError('')
  }

  const dismissTutorial = () => {
    setTutorial(false)
    setTutorialCursor(TUTORIAL_STEPS.length)
  }

  const handleCardOpen = useCallback((isOpen: boolean) => {
    setCardOpen(isOpen)
    if (isOpen) setTutorialCursor((c) => (c === 2 ? 3 : c))
  }, [])

  const playing = step != null && result != null
  const finished = Boolean(state?.game_over && !playing)
  const tut =
    tutorial && state
      ? tutorialStep(tutorialCursor, {
          turn: state.turn,
          playing,
          cardOpen,
          gameOver: state.game_over,
        })
      : null
  const tutCursor = tut?.cursor
  const activeTutorial = tut?.step ?? null
  const highlight = activeTutorial?.highlight ?? null
  const nextTutorial = () => {
    if (tutCursor == null || !state) return
    setTutorialCursor(
      tutorialStep(tutCursor + 1, {
        turn: state.turn,
        playing,
        cardOpen,
        gameOver: state.game_over,
      }).cursor,
    )
  }
  const shown = playing ? result : (history[viewed - 1] ?? result)
  const latest = state != null && !state.game_over && shown === result && !playing // 할 말은 마지막 턴에서만 고른다
  const scales = shown && state ? citizenScales(state, history, history.indexOf(shown)) : {}
  const lines = shown && state ? villageLines(state, shown, scales) : null
  const settled = playing ? (history.at(-2) ?? null) : shown // 연출 중에는 지난 턴, 평소에는 보고 있는 밤 숫자
  const citizens = settled?.cities.filter((c) => c.role === 'citizen') ?? []
  const citizenCount = state
    ? Object.values(state.roles).filter((r) => r === 'citizen').length
    : 0
  const wrong = citizens.filter((c) => c.correct === false).length
  const fooled = fooledDots(settled ? wrong : 0, citizenCount)
  const ruled = state?.config.citizen_type === 'wary' // 7.6 규칙을 따르는 시민만 예상을 보인다

  useEffect(() => {
    if (finished) scrollIntoView(resultRef.current)
  }, [finished])

  const scrollToResult = () => scrollIntoView(resultRef.current)

  return (
    <>
      <PencilFilters />
      {!state ? (
        <GameStart
          difficulty={difficulty}
          citizenType={citizenType}
          busy={busy}
          error={error}
          headingRef={headingRef}
          onDifficulty={setDifficulty}
          onCitizenType={setCitizenType}
          onStart={() => start(false)}
          onTutorial={() => start(true)}
        />
      ) : (
        <div className="gm-workspace gm-play">
          <h1 ref={headingRef} tabIndex={-1} className="sr-only">
            AI 주민을 속여라
          </h1>
          <div className="gm-stage">
            <section className="gm-board-zone" aria-label="마을 보드">
              <header className="gm-hud">
                <div className="gm-hud-left">
                  <button type="button" className="gm-exit" onClick={exit} disabled={busy}>
                    ← 나가기
                  </button>
                  {tutorial && !state.game_over && <span className="gm-tutorial-badge">튜토리얼</span>}
                  <div className="gm-role">
                    <span className="gm-me-dot" aria-hidden="true">
                      나
                    </span>
                    <span>
                      나는 {state.player_city}번 집 <span className="gm-role-sub">(마피아)</span>
                    </span>
                  </div>
                </div>
                <div className="gm-hud-right">
                  <div className="gm-progress" role="img" aria-label={fooled.label}>
                    <span>속은 주민</span>
                    <span className="gm-dots" aria-hidden="true">
                      {fooled.dots.map((filled, i) => (
                        <Fragment key={i}>
                          {i === fooled.need && <span className="gm-dots-sep" />}
                          <span className={filled ? 'gm-dot is-fooled' : 'gm-dot'} />
                        </Fragment>
                      ))}
                    </span>
                  </div>
                </div>
              </header>
              {error && (
                <p role="alert" className="rs-incorrect gm-error">
                  {error}
                </p>
              )}
              {tutorial && !state.game_over && (
                <Tutorial
                  step={activeTutorial}
                  onNext={nextTutorial}
                  onDismiss={dismissTutorial}
                  onExit={exit}
                />
              )}
              <div className="gm-board-frame">
                <VillageBoard
                  state={state}
                  result={shown}
                  swayed={Object.keys(scales).map(Number).filter((c) => scales[c].swayed)}
                  stage={playing ? { ...steps[step], prev: history.at(-2) ?? null } : undefined}
                  highlight={highlight}
                  hideSigns={tutorial}
                  onCardOpen={handleCardOpen}
                  picker={
                    latest
                      ? { claims, ruled, onClaim: (city, claim) => setClaims({ ...claims, [city]: claim }) }
                      : undefined
                  }
                />
              </div>
            </section>
            <VillageLog
              lines={lines && playing ? visibleLines(lines, steps[step]) : lines}
              day={shown?.turn}
              live={playing}
              highlight={highlight === 'log'}
            >
              {shown && !playing && (
                <div className="vl-pager" role="group" aria-label="지난밤 넘겨보기">
                  <span className="vl-pager-label">지난밤 넘겨보기</span>
                  <div className="vl-pager-ctrl">
                    <button
                      type="button"
                      className="vl-pager-btn"
                      aria-label="이전 밤"
                      disabled={shown.turn <= 1}
                      onClick={() => setViewed(shown.turn - 1)}
                    >
                      ‹
                    </button>
                    <span className="vl-pager-day">{shown.turn}일째</span>
                    <button
                      type="button"
                      className="vl-pager-btn"
                      aria-label="다음 밤"
                      disabled={shown.turn >= history.length}
                      onClick={() => setViewed(shown.turn + 1 >= history.length ? 0 : shown.turn + 1)}
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
              {playing ? (
                <Button variant="outline" onClick={() => setStep(null)}>
                  건너뛰기 (Esc)
                </Button>
              ) : state.game_over ? (
                <div className="vl-foot-actions">
                  <Button onClick={scrollToResult}>결과 보기</Button>
                  <Button variant="outline" onClick={exit} disabled={busy}>
                    새 게임
                  </Button>
                </div>
              ) : (
                <Button
                  className={highlight === 'submit' ? 'tut-hl' : undefined}
                  onClick={submit}
                  disabled={busy || !latest}
                >
                  {latest ? `${state.turn + 1}일째 밤으로 넘기기` : '가장 최근 날에서만 밤으로 넘길 수 있어요'}
                </Button>
              )}
            </VillageLog>
          </div>

          {finished && (
            <div ref={resultRef} className="gm-below">
              <GameResult state={state} history={history}>
                {shown && (
                  <details className="gm-details">
                    <summary>{shown.turn}일째 자세한 표</summary>
                    <TurnReport result={shown} />
                  </details>
                )}
                <div className="gm-row">
                  <Button onClick={exit} disabled={busy}>
                    새 게임
                  </Button>
                </div>
              </GameResult>
            </div>
          )}
        </div>
      )}
    </>
  )
}
