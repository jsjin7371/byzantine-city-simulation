import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Progress } from '../components/ui/progress'
import { pentagonPoints } from '../components/networkGeometry'
import { decisions, percent, truths } from '../components/results/resultLabels'
import { errorMessage } from '../lib/errors'
import {
  TOTAL_TURNS,
  citizenTypes,
  claimTargets,
  createGame,
  defaultClaims,
  difficulties,
  endReasonLabels,
  getGame,
  outcomeLabels,
  playTurn,
} from '../gameApi'
import type { CitizenType, Claim, Difficulty, GameState, TurnResult } from '../gameApi'
import './GamePage.css'

const roleLabels = { player: '나(마피아)', colleague: '동료 마피아', citizen: '시민' }

function GameMap({ state, result }: { state: GameState; result: TurnResult | null }) {
  const points = pentagonPoints({ x: 200, y: 150 }, 110)
  return (
    <svg className="gm-map" viewBox="0 0 400 300" role="img" aria-label="도시 지도">
      {points.map((p, i) => {
        const city = i + 1
        const row = result?.cities.find((c) => c.city === city)
        const tone =
          row?.correct == null ? 'is-neutral' : row.correct ? 'is-correct' : 'is-incorrect'
        return (
          <g key={city} className={`gm-node ${tone}`} transform={`translate(${p.x} ${p.y})`}>
            <circle r="34" />
            <text y="-6" textAnchor="middle">
              도시 {city}
            </text>
            <text y="12" textAnchor="middle" className="gm-caption">
              {row?.decision
                ? `${decisions[row.decision]} · ${row.correct ? '정답' : '오답'}`
                : roleLabels[state.roles[city]]}
            </text>
            {result?.vote?.accused === city && (
              <text y="28" textAnchor="middle" className="gm-caption">
                고발됨
              </text>
            )}
          </g>
        )
      })}
    </svg>
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
                    <Progress value={value} aria-label={`도시 ${target} 의심도`} />
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
  const [result, setResult] = useState<TurnResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      const game = await createGame(difficulty, citizenType)
      setState(game)
      setResult(null)
      setClaims(defaultClaims(game))
    }, '게임을 시작하지 못했습니다.')

  const submit = () =>
    run(async () => {
      if (!state) return
      const turn = await playTurn(state.game_id, state.turn + 1, claims)
      setResult(turn)
      // bot_win_rate는 GET /games/{id}에 있다. 끝났을 때만 한 번 더 조회한다.
      if (turn.game_over) return setState(await getGame(state.game_id))
      setState({
        ...state,
        turn: turn.turn,
        game_over: turn.game_over,
        outcome: turn.outcome,
        end_reason: turn.end_reason,
        next_hints: turn.next_hints,
      })
    }, '턴을 진행하지 못했습니다.')

  const targets = state ? claimTargets(state) : []
  return (
    <div className="gm-workspace">
      <h1>마피아 놀이</h1>
      <section className="gm-panel">
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
        <p className="gm-muted">
          {Object.values(citizenTypes)
            .map((c) => `${c.label}: ${c.hint}`)
            .join(' / ')}
        </p>
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
            <p className="gm-muted">시민 과반이 오답을 고르고 고발당하지 않으면 승리합니다.</p>
            <GameMap state={state} result={result} />
          </section>

          {state.game_over ? (
            <section className="gm-panel" aria-live="polite">
              <h2>
                {state.outcome ? outcomeLabels[state.outcome] : '종료'}
                {state.end_reason && ` · ${endReasonLabels[state.end_reason]}`}
              </h2>
              {state.bot_win_rate != null && (
                <p>같은 설정의 기준 봇 승률: {percent(state.bot_win_rate)}</p>
              )}
            </section>
          ) : (
            <section className="gm-panel">
              <h2>{state.turn + 1}턴 · 시민에게 할 말</h2>
              {targets.map((city) => {
                const hint = state.next_hints?.[city]
                return (
                  <div key={city} className="gm-row">
                    <span className="gm-target">
                      도시 {city} (힌트 {hint ? truths[hint] : '—'})
                    </span>
                    {(['evacuate', 'stay'] as const).map((claim) => (
                      <Button
                        key={claim}
                        size="sm"
                        variant={claims[city] === claim ? 'default' : 'outline'}
                        aria-pressed={claims[city] === claim}
                        onClick={() => setClaims({ ...claims, [city]: claim })}
                      >
                        {decisions[claim]}
                      </Button>
                    ))}
                  </div>
                )
              })}
              <Button onClick={submit} disabled={busy}>
                턴 진행
              </Button>
            </section>
          )}

          {result && <TurnReport result={result} />}
        </>
      )}
    </div>
  )
}
