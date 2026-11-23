import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { decisions, percent, truths } from '../components/results/resultLabels'
import { errorMessage } from '../lib/errors'
import {
  SUSPICION,
  TOTAL_TURNS,
  citizenTypes,
  createGame,
  defaultClaims,
  difficulties,
  getGame,
  majority,
  playTurn,
} from '../gameApi'
import type { CitizenType, Claim, Difficulty, GameState, TurnResult } from '../gameApi'
import { VillageBoard } from '../game/VillageBoard'
import { VillageLog } from '../game/VillageLog'
import { GameResult } from '../game/GameResult'
import { citizenScales, nightSteps, villageLines, visibleLines } from '../game/village'
import './GamePage.css'

// 의심도 게이지. 투표 열림 기준(60) 위치에 선을 긋는다.
function Gauge({ value, label }: { value: number; label: string }) {
  return (
    <div className="gm-bar">
      <Progress value={value} aria-label={label} />
      <span className="gm-line" style={{ left: `${SUSPICION.threshold}%` }} aria-hidden />
    </div>
  )
}

function TurnReport({ result }: { result: TurnResult }) {
  return (
    <section className="gm-panel" aria-label={`${result.turn}턴 결과`}>
      <h2>
        {result.turn}턴 결과 · 시민 정확도 {percent(result.accuracy)}
      </h2>
      <div className="gm-citizens">
        {result.cities
          .filter((c) => c.role === 'citizen')
          .map((c) => (
            <article key={c.city} className="gm-citizen">
              <h3>
                도시 {c.city} · 힌트 {c.hint ? truths[c.hint] : '—'} ·{' '}
                {c.decision ? decisions[c.decision] : '—'}{' '}
                <span className={c.correct ? 'rs-correct' : 'rs-incorrect'}>
                  {c.correct ? '정답' : '오답'}
                </span>
              </h3>
              {c.suspicion ? (
                Object.entries(c.suspicion).map(([target, value]) => (
                  <div key={target} className="gm-gauge">
                    <span>도시 {target}</span>
                    <Gauge value={value} label={`도시 ${target} 의심도`} />
                    <span>{value}</span>
                  </div>
                ))
              ) : (
                <p className="gm-muted">의심도 없음 (다수결 시민)</p>
              )}
              {c.reason && <p className="gm-reason">{c.reason}</p>}
            </article>
          ))}
      </div>
      <h3>정보 공유</h3>
      {result.sharing.length === 0 && <p className="gm-muted">이번 턴 공유 없음</p>}
      <ul>
        {result.sharing.map((s) => (
          <li key={s.pair.join('-')}>
            도시 {s.pair[0]} ↔ 도시 {s.pair[1]}:{' '}
            {s.contradictions.length === 0
              ? '모순 없음'
              : s.contradictions
                  .map(
                    (x) =>
                      `도시 ${x.city} 모순 (${Object.entries(x.told)
                        .map(([to, m]) => `${to}번에게 ${decisions[m.claim]}`)
                        .join(', ')})`,
                  )
                  .join(' / ')}
          </li>
        ))}
      </ul>
      <h3>고발 투표</h3>
      {result.vote ? (
        <p>
          {Object.entries(result.vote.ballots)
            .map(([from, to]) => `${from}→${to}`)
            .join(', ')}{' '}
          · 고발:{' '}
          {result.vote.accused === null
            ? '없음 (과반 미달)'
            : `도시 ${result.vote.accused}${result.vote.caught ? ' (마피아 발각)' : ' (시민 오지목)'}`}
        </p>
      ) : (
        <p className="gm-muted">투표가 열리지 않았습니다.</p>
      )}
    </section>
  )
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

  const start = () =>
    run(async () => {
      setState(null) // 실패해도 이전 게임을 이어서 진행하지 않게 (God은 새 요청 때 이전 게임을 버린다)
      const game = await createGame(difficulty, citizenType)
      setState(game)
      setHistory([])
      setViewed(0)
      setStep(null)
      setClaims(defaultClaims(game))
    }, '게임을 시작하지 못했습니다.')

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
      // bot_win_rate는 GET /games/{id}에 있다. 끝났을 때만 한 번 더 조회한다 (실패해도 종료 상태는 위에서 반영됨).
      if (turn.game_over) setState(await getGame(state.game_id))
    }, '턴을 진행하지 못했습니다.')

  const playing = step != null && result != null
  const shown = playing ? result : (history[viewed - 1] ?? result)
  const latest = state != null && !state.game_over && shown === result && !playing // 할 말은 마지막 턴에서만 고른다
  const scales = shown && state ? citizenScales(state, history, history.indexOf(shown)) : {}
  const lines = shown && state ? villageLines(state, shown, scales) : null
  const settled = playing ? (history.at(-2) ?? null) : result // 연출 중에는 지난 턴 숫자
  const citizens = settled?.cities.filter((c) => c.role === 'citizen') ?? []
  const me = state ? String(state.player_city) : ''
  const topSuspicion = Math.max(0, ...citizens.map((c) => c.suspicion?.[me] ?? 0))
  const citizenCount = state
    ? Object.values(state.roles).filter((r) => r === 'citizen').length
    : 0
  const wrong = citizens.filter((c) => c.correct === false).length
  const wary = state?.config.citizen_type !== 'majority' // 의심도가 있는 시민
  const ruled = state?.config.citizen_type === 'wary' // 7.6 규칙을 따르는 시민만 예상을 보인다
  return (
    <div className="gm-workspace">
      <h1>AI 시민을 속여라</h1>
      <section className="gm-panel">
        <ul className="gm-rules">
          <li>
            목표: 나는 마피아. {TOTAL_TURNS}턴째에 시민 과반이 오답을
            고르게 하면 승리, 전부 오답이면 완승.
          </li>
          <li>
            의심도(나에 대한): 시민 힌트와 같은 말 {SUSPICION.agree}, 다른 말 +
            {SUSPICION.disagree}, 공유 쌍인 두 시민에게 서로 다른 말을 하면 모순 +
            {SUSPICION.contradiction}.
          </li>
          <li>
            패배: 누구든 의심도 {SUSPICION.threshold} 이상이면 고발 투표가 열리고 시민 과반이 나나
            동료를 지목하면 즉시 패배. {TOTAL_TURNS}턴에 과반 오답이 아니어도 패배.
          </li>
        </ul>
        <div className="gm-row" role="group" aria-label="난이도">
          {(Object.keys(difficulties) as Difficulty[]).map((key) => (
            <Button
              key={key}
              variant={difficulty === key ? 'default' : 'outline'}
              aria-pressed={difficulty === key}
              onClick={() => setDifficulty(key)}
            >
              {difficulties[key].label}
            </Button>
          ))}
        </div>
        <div className="gm-row" role="group" aria-label="시민 종류">
          {(Object.keys(citizenTypes) as CitizenType[]).map((key) => (
            <Button
              key={key}
              variant={citizenType === key ? 'default' : 'outline'}
              aria-pressed={citizenType === key}
              onClick={() => setCitizenType(key)}
            >
              {citizenTypes[key].label}
            </Button>
          ))}
        </div>
        <p className="gm-muted">{citizenTypes[citizenType].hint}</p>
        <div className="gm-row">
          <Button onClick={start} disabled={busy}>
            {state ? '새 게임' : '게임 시작'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="rs-incorrect">
            {error}
          </p>
        )}
      </section>

      {state && (
        <>
          <section className="gm-panel">
            <h2>
              정답 {truths[state.truth]} · 나는 도시 {state.player_city} · {state.turn}/
              {TOTAL_TURNS}턴
            </h2>
            <p>
              지난 턴 틀린 시민 {settled ? wrong : '—'}/{citizenCount} ({TOTAL_TURNS}턴에{' '}
              {majority(citizenCount)}명 이상 필요)
              {wary && ` · 나에 대한 최고 의심도 ${topSuspicion} / 투표 열림 기준 ${SUSPICION.threshold}`}
            </p>
            {wary && <Gauge value={topSuspicion} label="나에 대한 최고 의심도" />}
            <div className="vb-table">
              <VillageBoard
                state={state}
                result={shown}
                swayed={Object.keys(scales).map(Number).filter((c) => scales[c].swayed)}
                stage={playing ? { ...steps[step], prev: history.at(-2) ?? null } : undefined}
                picker={
                  latest
                    ? { claims, ruled, onClaim: (city, claim) => setClaims({ ...claims, [city]: claim }) }
                    : undefined
                }
              />
              <VillageLog lines={lines && playing ? visibleLines(lines, steps[step]) : lines} live={playing}>
                {playing ? (
                  <Button variant="outline" onClick={() => setStep(null)}>
                    건너뛰기 (Esc)
                  </Button>
                ) : (
                  !state.game_over && (
                    <Button onClick={submit} disabled={busy || !latest}>
                      {latest ? `${state.turn + 1}일째 밤으로 넘기기` : '마지막 턴에서 넘길 수 있습니다'}
                    </Button>
                  )
                )}
              </VillageLog>
            </div>
          </section>

          {state.game_over && !playing && <GameResult state={state} history={history} />}

          {history.length > 1 && !playing && (
            <div className="gm-row" role="group" aria-label="턴 다시 보기">
              {history.map((t) => (
                <Button
                  key={t.turn}
                  size="sm"
                  variant={shown?.turn === t.turn ? 'default' : 'outline'}
                  aria-pressed={shown?.turn === t.turn}
                  onClick={() => setViewed(t.turn)}
                >
                  {t.turn}턴
                </Button>
              ))}
            </div>
          )}
          {shown && !playing && (
            <details className="gm-details">
              <summary>{shown.turn}턴 자세한 표</summary>
              <TurnReport result={shown} />
            </details>
          )}
        </>
      )}
    </div>
  )
}
