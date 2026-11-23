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
const TOP_ARC_BACK = 'M615 215 Q450 115 285 215'
// 바닥에 깔리는 오솔길 6개 (집 5개 + 위쪽 숲길)
export const TRAILS = [...SLOTS.map(({ trail: [a, b, c, d, e, f] }) => `M${a} ${b} Q${c} ${d} ${e} ${f}`), TOP_ARC]

// 집 5채 자리: 내 집은 아래 가운데, 나머지는 내 다음 번호부터 시계방향 (양옆이 ring 이웃).
export function houseSlots(player: number) {
  return [0, 1, 2, 3, 4].map((i) => ({ city: ((player - 1 + i) % 5) + 1, slot: i, ...SLOTS[i] }))
}

// 도시의 자리 번호 (0번이 내 집).
const slotOf = (player: number, city: number) => (city - player + 5) % 5

// a에서 b로 가는 오솔길. 위쪽 두 집은 숲길, 나머지는 광장을 지나간다.
export function sharePath(player: number, a: number, b: number) {
  const [sa, sb] = [slotOf(player, a), slotOf(player, b)]
  if (sa >= 2 && sa <= 3 && sb >= 2 && sb <= 3) return sa < sb ? TOP_ARC : TOP_ARC_BACK
  const [x0, y0, cx, cy, x1, y1] = SLOTS[sa].trail
  const [u0, v0, ux, uy, u1, v1] = SLOTS[sb].trail
  return `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1} L${u1} ${v1} Q${ux} ${uy} ${u0} ${v0}`
}

// 모순 매듭을 놓을 길 위 한가운데 점.
export function pairMid(player: number, a: number, b: number): [number, number] {
  const path = sharePath(player, a, b)
  if (path === TOP_ARC || path === TOP_ARC_BACK) return [450, 165]
  const n = path.match(/-?\d+/g)!.map(Number)
  return [(n[4] + n[6]) / 2, (n[5] + n[7]) / 2 - 30]
}

// 오늘 밤 만나는 두 집에 서로 다른 말을 고른 쌍 (모순 경고).
export function clashingPairs(pairs: [number, number][], claims: Record<string, Claim>) {
  return pairs.filter(([a, b]) => claims[a] && claims[b] && claims[a] !== claims[b])
}

const agrees = (hint: Truth, claim: Claim) => (hint === 'danger') === (claim === 'evacuate')

// 쪽지 하나로 그 시민의 나에 대한 의심도가 어떻게 바뀔지 (7.6, engine/city/logic.py game_turn과 같은 규칙).
// 자기 힌트와 같은 말 −20, 다른 말 +20, 오늘 밤 쪽지를 맞춰 보는 상대에게 다른 말을 했으면 추가 +20 (쌍이 여럿이어도 한 번).
// 0~100으로 자르고, 60 이상이면 재판이 열린다. 게임은 memory "turn"이라 자기 힌트 = 이번 턴 힌트, 1턴 전 의심도는 0.
export function suspicionPreview(
  h: Pick<House, 'city' | 'hint' | 'suspicion'>,
  claim: Claim,
  pairs: [number, number][],
  claims: Record<string, Claim>,
) {
  if (!h.hint) return null
  const from = h.suspicion ?? 0
  const contradiction = pairs.some(([a, b]) => {
    const other = a === h.city ? b : b === h.city ? a : null
    return other != null && claims[other] != null && claims[other] !== claim
  })
  const delta = (agrees(h.hint, claim) ? SUSPICION.agree : SUSPICION.disagree) + (contradiction ? SUSPICION.contradiction : 0)
  const next = Math.min(100, Math.max(0, from + delta))
  return { from, next, trial: next >= SUSPICION.threshold }
}
export type Preview = NonNullable<ReturnType<typeof suspicionPreview>>
// 불리한 말은 항상 +20 이상이라 next>=from이고 next>0 (100→100도 불리). 유리한 말은 next<from이거나 0→0.
export const worsens = (p: Pick<Preview, 'from' | 'next'>) => p.next >= p.from && p.next > 0

// 어제와 달라진 집 (쪽지를 다시 볼 곳): 다음 힌트가 이번 턴과 바뀌었거나 새로 점선에 들어온 시민. 첫날은 없다.
export function changedHouses(result: Pick<TurnResult, 'cities' | 'sharing' | 'next_hints' | 'next_share_pairs'>) {
  const met = new Set(result.sharing.flatMap((s) => s.pair))
  const changes: Record<number, string[]> = {}
  for (const c of result.cities) {
    const next = result.next_hints?.[c.city]
    const why = [
      c.hint && next && c.hint !== next ? '힌트 바뀜' : null,
      !met.has(c.city) && result.next_share_pairs?.some((p) => p.includes(c.city)) ? '새 점선' : null,
    ].filter((w) => w != null)
    if (why.length) changes[c.city] = why
  }
  return changes
}

// 밤에 오솔길을 따라 오가는 말: 받은 집마다 보낸 집에서 온 주장 (connection이 all이면 모든 집이 서로 보낸다).
export function talkNotes(player: number, result: Pick<TurnResult, 'cities'>) {
  return result.cities.flatMap((c) =>
    Object.entries(c.received ?? {}).flatMap(([from, msg]) => {
      const s = Number(from)
      if (!msg) return []
      return [{ from: s, to: c.city, claim: msg.claim, path: sharePath(player, s, c.city) }]
    }),
  )
}

// 시민 마음속 저울 (A-1): engine/city/logic.py game_turn을 그대로 옮긴다. 1표 = 100.
// 기억한 힌트마다 ±100 (대피 +, 잔류 −), 받은 쪽지마다 ±(100 − 보낸 집에 대한 새 의심도). 합 >0 대피, <0 잔류, 0이면 이번 힌트.
// mine: 내(플레이어) 쪽지 몫. swayed: 그 몫을 빼면 결정이 반대였다 (= 내 쪽지가 마음을 흔들었다).
export type Weight = { from: number | 'hint'; value: number }
export type Scale = { parts: Weight[]; total: number; decision: Claim; mine: number | null; swayed: boolean }

const vote = (hint: Truth) => (hint === 'danger' ? 100 : -100)
const pick = (score: number, hint: Truth): Claim => (score === 0 ? (hint === 'danger' ? 'evacuate' : 'stay') : score > 0 ? 'evacuate' : 'stay')

// history[i] 턴의 시민별 저울. 과거 힌트는 memory에 따라 앞선 턴에서 가져온다 (recent는 직전 1턴, full은 전부).
// AI 시민은 규칙 밖이라 비운다.
export function citizenScales(
  state: Pick<GameState, 'player_city' | 'config'>,
  history: Pick<TurnResult, 'cities'>[],
  i: number,
): Record<number, Scale> {
  if (state.config.citizen_type === 'ai') return {}
  const { memory } = state.config
  const scales: Record<number, Scale> = {}
  for (const c of history[i].cities) {
    if (c.role !== 'citizen' || !c.hint) continue
    const past = memory === 'turn' ? [] : history.slice(memory === 'recent' ? Math.max(0, i - 1) : 0, i)
    const hints = [...past.map((t) => t.cities.find((x) => x.city === c.city)?.hint), c.hint].filter((h) => h != null)
    const parts: Weight[] = [{ from: 'hint', value: hints.reduce((a, h) => a + vote(h), 0) }]
    for (const [s, msg] of Object.entries(c.received ?? {})) {
      if (!msg) continue
      const w = 100 - (c.suspicion?.[s] ?? 0)
      parts.push({ from: Number(s), value: msg.claim === 'evacuate' ? w : -w })
    }
    const total = parts.reduce((a, p) => a + p.value, 0)
    const mine = parts.find((p) => p.from === state.player_city)?.value ?? null
    const decision = pick(total, c.hint)
    scales[c.city] = { parts, total, decision, mine, swayed: mine != null && pick(total - mine, c.hint) !== decision }
  }
  return scales
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
    | { kind: 'scale'; who: number; text: string }
    | { kind: 'event'; text: string; good?: boolean }
  )

const saw = { danger: '태풍', safe: '맑음' } as const
const said = { evacuate: '대피', stay: '잔류' } as const
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')

// 저울 읽기용 한 줄. 예) "내 관측 +100 · 2번 +80 · 4번 +100 · 너(1번) −40 → 합 +240, 대피"
export function scaleText(scale: Scale, me: number) {
  const parts = scale.parts.map((p) =>
    `${p.from === 'hint' ? '내 관측' : p.from === me ? `너(${me}번)` : `${p.from}번`} ${signed(p.value)}`,
  )
  const tie = scale.total === 0 ? ' (동점이라 내 관측대로)' : ''
  return `${parts.join(' · ')} → 합 ${signed(scale.total)}, ${said[scale.decision]}${tie}`
}

// scales: 그 턴의 시민 저울 (citizenScales). 있으면 결정 단계에 저울과 "흔들었다"를 적는다.
export function villageLines(
  state: Pick<GameState, 'player_city' | 'roles' | 'config'>,
  result: Pick<TurnResult, 'turn' | 'cities' | 'sharing' | 'vote'>,
  scales: Record<number, Scale> = {},
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

  // 마음속 저울과 작은 성공: 내 쪽지가 없었다면 반대로 골랐을 주민
  for (const c of citizens) {
    const s = scales[c.city]
    if (!s) continue
    lines.push({ phase: 'flags', kind: 'scale', who: c.city, text: scaleText(s, me) })
    if (s.swayed) lines.push({ phase: 'flags', kind: 'event', good: true, text: `${c.city}번 주민을 흔들었다` })
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
        : peaks.some((v) => v != null)
          ? '의심을 재판 기준 아래로 관리하며 끝까지 버텼다.'
          : '다수결 주민은 의심하지 않는다. 눈치 주민은 거짓말이 쌓이면 재판을 연다.'
  return { headline, moments, lesson, peaks }
}
