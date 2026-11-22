import { SUSPICION, claimTargets, majority } from '../gameApi.ts'
import type { Claim, GameState, Role, Truth, TurnResult } from '../gameApi.ts'

// 숲속 보드 좌표 (viewBox 900x660, 목업 A3). 0번 자리는 내 집(아래 가운데), 1~4번은 시계방향.
// trail: 집 앞 공터에서 광장까지의 오솔길 [시작x, 시작y, 조절x, 조절y, 끝x, 끝y].
const SLOTS = [
  { x: 450, y: 540, trail: [450, 512, 450, 452, 450, 392] },
  { x: 230, y: 477, trail: [230, 470, 330, 400, 398, 360] },
  { x: 230, y: 252, trail: [230, 262, 320, 330, 398, 338] },
  { x: 670, y: 252, trail: [670, 262, 580, 330, 502, 338] },
  { x: 670, y: 477, trail: [670, 470, 570, 400, 502, 360] },
]
// 위쪽 두 집(2, 3번 자리)은 광장을 거치지 않는 숲길로 바로 이어진다.
export const TOP_ARC = 'M285 215 Q450 115 615 215'
// 바닥에 깔리는 오솔길 6개 (집 5개 + 위쪽 숲길)
export const TRAILS = [...SLOTS.map(({ trail: [a, b, c, d, e, f] }) => `M${a} ${b} Q${c} ${d} ${e} ${f}`), TOP_ARC]

// 집 5채 자리: 내 집은 아래 가운데, 나머지는 내 다음 번호부터 시계방향 (양옆이 ring 이웃).
export function houseSlots(player: number) {
  return [0, 1, 2, 3, 4].map((i) => ({ city: ((player - 1 + i) % 5) + 1, slot: i, ...SLOTS[i] }))
}

// 두 집 사이 오솔길. 위쪽 두 집은 숲길, 나머지는 광장을 지나간다.
export function sharePath(player: number, a: number, b: number) {
  const slot = (c: number) => (c - player + 5) % 5
  const [sa, sb] = [slot(a), slot(b)].sort((p, q) => p - q)
  if (sa === 2 && sb === 3) return TOP_ARC
  const [x0, y0, cx, cy, x1, y1] = SLOTS[sa].trail
  const [u0, v0, ux, uy, u1, v1] = SLOTS[sb].trail
  return `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1} L${u1} ${v1} Q${ux} ${uy} ${u0} ${v0}`
}

// 모순 매듭을 놓을 길 위 한가운데 점.
export function pairMid(player: number, a: number, b: number): [number, number] {
  const path = sharePath(player, a, b)
  if (path === TOP_ARC) return [450, 165]
  const n = path.match(/-?\d+/g)!.map(Number)
  return [(n[4] + n[6]) / 2, (n[5] + n[7]) / 2 - 30]
}

// 오늘 밤 만나는 두 집에 서로 다른 말을 고른 쌍 (모순 경고).
export function clashingPairs(pairs: [number, number][], claims: Record<string, Claim>) {
  return pairs.filter(([a, b]) => claims[a] && claims[b] && claims[a] !== claims[b])
}

export type House = {
  city: number
  slot: number
  x: number
  y: number
  role: Role
  hint: Truth | null // 다음 턴 힌트
  flag: Claim | null // 그 턴의 결정 (1턴 전, 마피아는 null)
  lit: boolean | null // 다음 힌트가 정답과 같은가 (힌트가 없으면 null)
  suspicion: number | null // 그 턴의 나에 대한 의심도 (다수결 시민, 1턴 전은 null)
  reachable: boolean // 내가 말을 보낼 수 있는 시민인가 (ring이면 양옆만)
}

// 보드가 그릴 집 상태. result가 없으면 1턴 전 (게임 상태의 힌트만 있음).
export function villageHouses(
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth' | 'next_hints'>,
  result: Pick<TurnResult, 'cities' | 'next_hints'> | null,
): House[] {
  const me = String(state.player_city)
  const hints = result ? result.next_hints : state.next_hints
  const targets = claimTargets(state)
  return houseSlots(state.player_city).map((h) => {
    const row = result?.cities.find((c) => c.city === h.city)
    const hint = hints?.[h.city]
    return {
      ...h,
      role: state.roles[h.city],
      hint: hint ?? null,
      flag: row?.decision ?? null,
      lit: hint ? hint === state.truth : null,
      suspicion: row?.suspicion?.[me] ?? null,
      reachable: targets.includes(h.city),
    }
  })
}

// 투표에서 도시별 받은 표 수.
export function tally(ballots: Record<string, number>) {
  const votes: Record<number, number> = {}
  for (const to of Object.values(ballots)) votes[to] = (votes[to] ?? 0) + 1
  return votes
}

// 밤 연출 단계 (A3 흐름): 밤 → 쪽지 전달 → 결정 깃발 → 의심 변화 → 재판 지목 한 명씩 → 판정 도장 → 다음 날.
export type Phase = 'night' | 'notes' | 'flags' | 'suspicion' | 'trial' | 'verdict' | 'day'
const PHASES: Phase[] = ['night', 'notes', 'flags', 'suspicion', 'trial', 'verdict', 'day']
export const reached = (phase: Phase, at: Phase) => PHASES.indexOf(phase) >= PHASES.indexOf(at)

export type Step = { phase: Phase; ballots: number; ms: number }

// 한 턴 결과를 보여 줄 단계 목록. 마지막 단계(day)가 최종 상태다.
export function nightSteps(result: Pick<TurnResult, 'vote'>): Step[] {
  const steps: Step[] = [
    { phase: 'night', ballots: 0, ms: 700 },
    { phase: 'notes', ballots: 0, ms: 1300 },
    { phase: 'flags', ballots: 0, ms: 1000 },
    { phase: 'suspicion', ballots: 0, ms: 1300 },
  ]
  if (result.vote) {
    const n = Object.keys(result.vote.ballots).length
    for (let i = 1; i <= n; i++) steps.push({ phase: 'trial', ballots: i, ms: 800 })
    steps.push({ phase: 'verdict', ballots: n, ms: 1300 })
  }
  steps.push({ phase: 'day', ballots: Infinity, ms: 0 })
  return steps
}

// 연출 중 집 상태: 깃발·의심도는 그 단계가 오기 전까지 지난 턴 값, 창문은 다음 날 전까지 오늘 밤 힌트.
export function stagedHouses(
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth' | 'next_hints'>,
  prev: Pick<TurnResult, 'cities' | 'next_hints'> | null,
  result: Pick<TurnResult, 'cities' | 'next_hints'>,
  phase: Phase,
): House[] {
  const after = villageHouses(state, result)
  if (phase === 'day') return after
  const before = villageHouses(state, prev ?? { cities: [], next_hints: null })
  return after.map((h, i) => {
    const tonight = result.cities.find((c) => c.city === h.city)?.hint ?? null
    return {
      ...h,
      hint: tonight,
      lit: tonight ? tonight === state.truth : null,
      flag: reached(phase, 'flags') ? h.flag : before[i].flag,
      suspicion: reached(phase, 'suspicion') ? h.suspicion : before[i].suspicion,
    }
  })
}

// 마을 이야기 (명세 3번): 턴 결과를 규칙 대사로 바꾼다. LLM 없이 방향_제안.html 3절 템플릿.
// phase: 연출에서 그 대사가 나오는 단계.
type Said = { phase: Phase }
export type Line = Said &
  (
    | { kind: 'when'; text: string }
    | { kind: 'say'; who: number; text: string }
    | { kind: 'event'; text: string }
  )

const saw = { danger: '태풍', safe: '맑음' } as const
const said = { evacuate: '대피', stay: '잔류' } as const
const agrees = (hint: Truth, claim: Claim) => (hint === 'danger') === (claim === 'evacuate')

export function villageLines(
  state: Pick<GameState, 'player_city' | 'roles' | 'config'>,
  result: Pick<TurnResult, 'turn' | 'cities' | 'sharing' | 'vote'>,
): Line[] {
  const me = state.player_city
  const wary = state.config.citizen_type !== 'majority'
  const ai = state.config.citizen_type === 'ai'
  const met = result.sharing.map((s) => `${s.pair[0]}번과 ${s.pair[1]}번`).join(', ')
  const lines: Line[] = [
    { phase: 'night', kind: 'when', text: `${result.turn}일째 밤${met ? `, ${met}이 만났다` : ''}` },
  ]
  const citizens = result.cities.filter((c) => c.role === 'citizen')

  // 쪽지를 받은 주민의 반응: 관측과 맞는 말 / 어긋나는 말 (AI 시민은 자기 판단 이유)
  for (const c of citizens) {
    const mine = c.received?.[me]
    if (ai && c.reason) lines.push({ phase: 'notes', kind: 'say', who: c.city, text: c.reason })
    else if (mine && c.hint)
      lines.push({
        phase: 'notes',
        kind: 'say',
        who: c.city,
        text: agrees(c.hint, mine.claim)
          ? `그치, 나도 ${saw[c.hint]}이라고 봤어`
          : `음… 내가 본 건 ${saw[c.hint]}인데, ${me}번은 ${said[mine.claim]}래`,
      })
  }

  // 모순 발견: 만난 두 주민이 내가 한 말을 맞춰 봤다
  for (const { pair, contradictions } of result.sharing) {
    const told = contradictions.find((c) => c.city === me)?.told
    if (!told) continue
    const [a, b] = pair
    lines.push({
      phase: 'suspicion',
      kind: 'say',
      who: a,
      text: `잠깐, ${me}번이 나한텐 ${said[told[a].claim]}라더니 ${b}번한텐 ${said[told[b].claim]}라고 했대?`,
    })
  }

  // 의심: 재판 직전 경고, 주민끼리 의심 (다수결 시민은 없음)
  for (const c of citizens) {
    if (!wary || !c.suspicion) continue
    const onMe = c.suspicion[me] ?? 0
    if (onMe >= 40 && onMe < 60)
      lines.push({ phase: 'suspicion', kind: 'say', who: c.city, text: `${me}번 좀 수상한데. 한 번만 더 그러면 재판이야` })
    const [top, value] = Object.entries(c.suspicion).sort((x, y) => y[1] - x[1])[0] ?? []
    if (top && value > 0 && state.roles[top] === 'citizen')
      lines.push({ phase: 'suspicion', kind: 'event', text: `${c.city}번이 ${top}번을 의심하고 있다` })
  }

  if (result.vote) {
    lines.push({ phase: 'trial', kind: 'when', text: '광장 재판' })
    for (const [from, to] of Object.entries(result.vote.ballots))
      lines.push({ phase: 'trial', kind: 'say', who: Number(from), text: `나는 ${to}번을 지목한다` })
    const a = result.vote.accused
    lines.push({
      phase: 'verdict',
      kind: 'event',
      text:
        a === null
          ? '과반이 모이지 않아 아무도 지목되지 않았다'
          : result.vote.caught
            ? `${a}번이 지목됐다. 사기꾼이 들켰다`
            : `${a}번이 지목됐지만 마을 사람이었다. 게임은 계속된다`,
    })
  }
  return lines
}

// 그 단계까지 나온 대사. 재판 지목은 한 명씩.
export function visibleLines(lines: Line[], step: Step) {
  let ballots = 0
  return lines.filter((l) => {
    if (!reached(step.phase, l.phase)) return false
    if (l.phase !== 'trial' || l.kind !== 'say') return true
    return ++ballots <= step.ballots
  })
}

// 결과 화면 (명세 4번): 표를 펼치지 않아도 왜 이기고 졌는지.
export type Summary = { headline: string; moments: string[]; lesson: string; peaks: (number | null)[] }

export function gameSummary(
  state: Pick<GameState, 'player_city' | 'roles' | 'outcome' | 'end_reason'>,
  history: Pick<TurnResult, 'turn' | 'cities' | 'sharing' | 'vote'>[],
): Summary {
  const me = state.player_city
  const last = history.at(-1)
  const citizens = Object.values(state.roles).filter((r) => r === 'citizen').length
  const peaks = history.map((t) => {
    const values = t.cities.map((c) => c.suspicion?.[me]).filter((v): v is number => v != null)
    return values.length ? Math.max(...values) : null
  })
  const vote = state.end_reason === 'caught' ? last?.vote : null
  const day = last?.turn ?? 0
  const headline = vote
    ? `${day}일째 광장 재판에서 들켰다`
    : state.outcome === 'perfect_win'
      ? '주민을 모두 끝까지 속였다'
      : state.outcome === 'win'
        ? '주민 과반을 끝까지 속였다'
        : `${day}일째에 주민 과반이 정답을 골랐다`

  const moments: string[] = []
  if (vote) {
    const voters = Object.entries(vote.ballots)
      .filter(([, to]) => to === vote.accused)
      .map(([from]) => `${from}번`)
    const who = vote.accused === me ? '나를' : `동료 ${vote.accused}번을`
    moments.push(`${day}일째 재판에서 ${voters.join(', ')}이 ${who} 지목했다 (${voters.length}표, 과반 ${majority(citizens)}표)`)
  } else if (last) {
    const wrong = last.cities.filter((c) => c.role === 'citizen' && c.correct === false).length
    moments.push(`마지막 ${day}일째에 주민 ${citizens}명 중 ${wrong}명이 오답을 골랐다 (승리에 ${majority(citizens)}명 필요)`)
  }
  const crossed = history.find((_, i) => (peaks[i] ?? 0) >= SUSPICION.threshold)
  if (crossed) {
    const top = crossed.cities.reduce((a, c) => ((c.suspicion?.[me] ?? 0) > (a.suspicion?.[me] ?? 0) ? c : a))
    moments.push(`${crossed.turn}일째 ${top.city}번의 의심이 ${top.suspicion![me]}까지 올라 처음으로 재판 기준 ${SUSPICION.threshold}을 넘었다`)
  }
  const knots = history.filter((t) => t.sharing.some((s) => s.contradictions.some((c) => c.city === me)))
  if (knots.length)
    moments.push(`만난 두 주민에게 다른 말을 했다가 ${knots.length}번 들켰다 (${knots.map((t) => `${t.turn}일째`).join(', ')})`)
  const trials = history.filter((t) => t.vote).length
  if (trials) moments.push(`재판이 ${trials}번 열렸다`)

  const lesson = knots.length
    ? '만나는 두 주민에게 다른 말을 하면 바로 들킨다. 점선으로 이어진 집에는 같은 말을 하자.'
    : crossed
      ? '자기 관측과 다른 말을 계속 들은 주민은 의심을 쌓는다. 의심이 높은 집에는 가끔 맞는 말을 해 식히자.'
      : state.outcome === 'loss'
        ? '들키지는 않았지만 주민 과반을 설득하지 못했다. 창문 불이 꺼진 집은 이미 틀린 쪽을 보고 있다.'
        : '의심을 재판 기준 아래로 관리하며 끝까지 버텼다.'
  return { headline, moments, lesson, peaks }
}
