import { SUSPICION, claimTargets, majority } from '../gameApi.ts'
import type { Claim, GameState, Role, Truth, TurnResult } from '../gameApi.ts'

// 숲속 보드 좌표 (viewBox 900x698, 목업 A3). 0번 자리는 내 집(아래 가운데), 1~4번은 시계방향.
// trail: 집 앞 공터에서 광장까지의 오솔길 [시작x, 시작y, 조절x, 조절y, 끝x, 끝y].
const SLOTS = [
  { x: 450, y: 540, trail: [450, 512, 450, 452, 450, 392] },
  { x: 230, y: 477, trail: [230, 470, 330, 400, 398, 360] },
  { x: 230, y: 252, trail: [230, 262, 320, 330, 398, 338] },
  { x: 670, y: 252, trail: [670, 262, 580, 330, 502, 338] },
  { x: 670, y: 477, trail: [670, 470, 570, 400, 502, 360] },
]
// 바닥에 깔리는 오솔길 5개 (집마다 광장으로 이어지는 길)
export const TRAILS = SLOTS.map(({ trail: [a, b, c, d, e, f] }) => `M${a} ${b} Q${c} ${d} ${e} ${f}`)

// 집 5채 자리: 내 집은 아래 가운데, 나머지는 내 다음 번호부터 시계방향 (양옆이 ring 이웃).
export function houseSlots(player: number) {
  return [0, 1, 2, 3, 4].map((i) => ({ city: ((player - 1 + i) % 5) + 1, slot: i, ...SLOTS[i] }))
}

// 도시의 자리 번호 (0번이 내 집).
const slotOf = (player: number, city: number) => (city - player + 5) % 5

// a에서 b로 가는 오솔길. 모든 길은 광장을 지나간다.
export function sharePath(player: number, a: number, b: number) {
  const [sa, sb] = [slotOf(player, a), slotOf(player, b)]
  const [x0, y0, cx, cy, x1, y1] = SLOTS[sa].trail
  const [u0, v0, ux, uy, u1, v1] = SLOTS[sb].trail
  return `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1} L${u1} ${v1} Q${ux} ${uy} ${u0} ${v0}`
}

// 모순 매듭을 놓을 길 위 한가운데 점.
export function pairMid(player: number, a: number, b: number): [number, number] {
  const ta = SLOTS[slotOf(player, a)].trail
  const tb = SLOTS[slotOf(player, b)].trail
  return [(ta[4] + tb[4]) / 2, (ta[5] + tb[5]) / 2 - 30]
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

// 어제와 달라진 집 (쪽지를 다시 볼 곳): 다음 힌트가 이번 턴과 바뀌었거나 새로 쪽지 비교에 들어온 시민. 첫날은 없다.
export function changedHouses(result: Pick<TurnResult, 'cities' | 'sharing' | 'next_hints' | 'next_share_pairs'>) {
  const met = new Set(result.sharing.flatMap((s) => s.pair))
  const changes: Record<number, string[]> = {}
  for (const c of result.cities) {
    const next = result.next_hints?.[c.city]
    const why = [
      c.hint && next && c.hint !== next ? '관측 바뀜' : null,
      !met.has(c.city) && result.next_share_pairs?.some((p) => p.includes(c.city)) ? '쪽지 비교' : null,
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
type Weight = { from: number | 'hint'; value: number }
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
  suspicions: Record<string, number> | null // 그 턴의 이 주민이 다른 집(나 포함)을 의심하는 정도
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
      suspicions: row?.suspicion ?? null,
      reachable: targets.includes(h.city),
    }
  })
}

// 집→집 의심 선 경로표 (슬롯 번호 쌍 a < b 기준).
// 각 선과 숫자 꼬리표는 게이지·깃발·점선 이름표·광장 글자를 피하는 빈 통로에 놓는다.
type LinkGeom = { a: [number, number]; b: [number, number]; c: [number, number]; tag: [number, number] }
const SUSPICION_EDGE: Record<string, LinkGeom> = {
  '0-1': { a: [412, 494], b: [282, 462], c: [352, 466], tag: [352, 474] },
  '0-2': { a: [428, 480], b: [266, 260], c: [332, 396], tag: [344, 392] },
  '0-3': { a: [472, 480], b: [634, 260], c: [568, 396], tag: [556, 392] },
  '0-4': { a: [488, 494], b: [618, 462], c: [548, 466], tag: [548, 474] },
  '1-2': { a: [178, 412], b: [178, 252], c: [70, 344], tag: [140, 374] },
  '1-3': { a: [280, 418], b: [620, 246], c: [450, 434], tag: [450, 383] },
  '1-4': { a: [282, 424], b: [618, 424], c: [450, 438], tag: [450, 431] },
  '2-3': { a: [282, 204], b: [618, 204], c: [450, 152], tag: [450, 178] },
  '2-4': { a: [280, 246], b: [620, 418], c: [450, 434], tag: [450, 383] },
  '3-4': { a: [722, 252], b: [748, 416], c: [806, 344], tag: [774, 382] },
}

export type SuspicionLink = {
  from: number
  to: number
  value: number
  path: string
  labelX: number
  labelY: number
  strokeWidth: number
}

// 특정 시민 집이 다른 집(나 포함)을 의심하는 선 목록. 0이거나 다수결·값 없음이면 빈 배열.
export function suspicionLinks(
  houses: Pick<House, 'city' | 'slot' | 'role' | 'suspicions'>[],
  fromCity: number,
): SuspicionLink[] {
  const from = houses.find((h) => h.city === fromCity)
  if (!from || from.role !== 'citizen' || !from.suspicions) return []
  const byCity = new Map(houses.map((h) => [h.city, h]))
  return Object.entries(from.suspicions)
    .map(([city, value]) => [Number(city), value] as const)
    .filter(([, value]) => value > 0)
    .sort(([a], [b]) => a - b)
    .flatMap(([toCity, value]) => {
      const to = byCity.get(toCity)
      if (!to || to.slot === from.slot) return []
      const [lo, hi] = from.slot < to.slot ? [from.slot, to.slot] : [to.slot, from.slot]
      const geom = SUSPICION_EDGE[`${lo}-${hi}`]
      if (!geom) return []
      const [start, end] = from.slot < to.slot ? [geom.a, geom.b] : [geom.b, geom.a]
      const clamped = Math.min(100, Math.max(0, value))
      return [
        {
          from: from.city,
          to: to.city,
          value,
          path: `M${start[0]} ${start[1]} Q${geom.c[0]} ${geom.c[1]} ${end[0]} ${end[1]}`,
          labelX: geom.tag[0],
          labelY: geom.tag[1],
          strokeWidth: Number((1.8 + (clamped / 100) * 4.2).toFixed(2)),
        },
      ]
    })
}

export type VoteItem = {
  from: 'hint' | number
  role: 'hint' | Role
  claim: Claim | null // null이면 "고르는 중"
  weight: number // 0..100 (1표 = 100, 어젯밤 의심도 기준)
}

export type TonightVotes = {
  items: VoteItem[]
  noCitizenNotesYet: boolean // 1일째처럼 이웃 주민이 아직 어제 결정이 없을 때
  usesSuspicion: boolean // 눈치 시민(7.6 가중치 규칙)이면 true, 다수결·AI면 false
  ai: boolean // AI 시민(LLM 자율 판단)이면 true
}

// 쪽지 카드 "이 집의 표": 오늘 밤 targetCity가 받을 관측 1표 + 보낸 집별 쪽지 1장.
// 합계나 예상 결과는 계산하지 않고 표 구성과 어젯밤 기준 믿음 크기만 돌려준다.
export function tonightVotes(
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth'>,
  houses: Pick<House, 'city' | 'role' | 'hint' | 'flag' | 'suspicions'>[],
  targetCity: number,
  claims: Record<string, Claim>,
): TonightVotes {
  const target = houses.find((h) => h.city === targetCity)
  const usesSuspicion = state.config.citizen_type === 'wary'
  const ai = state.config.citizen_type === 'ai'
  if (!target || target.role !== 'citizen') {
    return { items: [], noCitizenNotesYet: false, usesSuspicion, ai }
  }
  const items: VoteItem[] = []
  if (target.hint) {
    items.push({
      from: 'hint',
      role: 'hint',
      claim: target.hint === 'danger' ? 'evacuate' : 'stay',
      weight: 100,
    })
  }
  const neighbors = (
    state.config.connection === 'ring'
      ? [((targetCity + 3) % 5) + 1, (targetCity % 5) + 1]
      : [1, 2, 3, 4, 5].filter((c) => c !== targetCity)
  ).sort((a, b) => Number(state.roles[b] === 'player') - Number(state.roles[a] === 'player') || a - b)
  const byCity = new Map(houses.map((h) => [h.city, h]))
  const lie: Claim = state.truth === 'danger' ? 'stay' : 'evacuate'
  const weightOf = (sender: number) =>
    usesSuspicion ? Math.max(0, 100 - (target.suspicions?.[sender] ?? 0)) : 100

  for (const sender of neighbors) {
    const role = state.roles[sender]
    const claim =
      role === 'player'
        ? (claims[targetCity] ?? null)
        : role === 'colleague'
          ? lie
          : (byCity.get(sender)?.flag ?? null)
    if (role === 'citizen' && !claim) continue
    items.push({ from: sender, role, claim, weight: weightOf(sender) })
  }
  return {
    items,
    noCitizenNotesYet:
      neighbors.some((c) => state.roles[c] === 'citizen') && !items.some((item) => item.role === 'citizen'),
    usesSuspicion,
    ai,
  }
}

// HUD "속은 주민 ●●○|○" 계산: 시민 수만큼 점, 속은(틀린) 시민 수만큼 채움, 과반(need) 눈금 위치.
export function fooledDots(wrong: number, total: number) {
  const need = majority(total)
  const fooled = Math.max(0, Math.min(wrong, total))
  return {
    need,
    dots: Array.from({ length: total }, (_, i) => i < fooled),
    label: `속은 주민 ${fooled}/${total}, ${need}명 필요`,
  }
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
// 단계 이름표 (보드 위쪽 + 마을 이야기 제목). 문구는 여기서만 바꾼다.
export const PHASE_LABEL: Record<Phase, string> = {
  night: '① 날씨 관측',
  notes: '② 쪽지 전달',
  flags: '③ 주민 결정',
  suspicion: '④ 의심도 변화',
  trial: '⑤ 광장 재판',
  verdict: '⑥ 재판 결과',
  day: '', // 낮에는 이름표를 숨긴다
}

type Step = { phase: Phase; ballots: number; decided: number; ms: number }

// 시계 방향 집 순서에서 시민의 1-based 순번.
export function citizenOrder(houses: Pick<House, 'city' | 'role'>[]): Map<number, number> {
  const order = new Map<number, number>()
  for (const h of houses) {
    if (h.role === 'citizen') order.set(h.city, order.size + 1)
  }
  return order
}

// 한 턴 결과를 보여 줄 단계 목록. 마지막 단계(day)가 최종 상태다.
// ③ 주민 결정(flags)은 표 줄이 있는 시민이면 집마다 차례로(650ms) 쌓고, AI 시민(withVotes=false)은 한 번에 세운다.
export function nightSteps(
  result: Pick<TurnResult, 'vote' | 'cities'>,
  withVotes = true,
): Step[] {
  const steps: Step[] = [
    { phase: 'night', ballots: 0, decided: 0, ms: 700 },
    { phase: 'notes', ballots: 0, decided: 0, ms: 1100 },
  ]
  if (withVotes) {
    const citizens = result.cities.filter((c) => c.role === 'citizen').length
    for (let i = 1; i <= citizens; i++) steps.push({ phase: 'flags', ballots: 0, decided: i, ms: 650 })
  } else {
    steps.push({ phase: 'flags', ballots: 0, decided: Infinity, ms: 900 })
  }
  steps.push({ phase: 'suspicion', ballots: 0, decided: Infinity, ms: 1100 })
  if (result.vote) {
    const n = Object.keys(result.vote.ballots).length
    for (let i = 1; i <= n; i++) steps.push({ phase: 'trial', ballots: i, decided: Infinity, ms: 450 })
    steps.push({ phase: 'verdict', ballots: n, decided: Infinity, ms: 1100 })
  }
  steps.push({ phase: 'day', ballots: Infinity, decided: Infinity, ms: 0 })
  return steps
}

// 연출 중 집 상태: 깃발·의심도는 그 단계가 오기 전까지 지난 턴 값, 창문은 다음 날 전까지 오늘 밤 힌트.
// flags 단계에서는 decided 수만큼 시계 방향 순서로 시민 깃발을 차례로 세운다.
export function stagedHouses(
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth' | 'next_hints'>,
  prev: Pick<TurnResult, 'cities' | 'next_hints'> | null,
  result: Pick<TurnResult, 'cities' | 'next_hints'>,
  phase: Phase,
  decided = Infinity,
): House[] {
  const after = villageHouses(state, result)
  if (phase === 'day') return after
  const before = villageHouses(state, prev ?? { cities: [], next_hints: null })
  const orderOf = citizenOrder(after)
  return after.map((h, i) => {
    const tonight = result.cities.find((c) => c.city === h.city)?.hint ?? null
    const order = orderOf.get(h.city) ?? 0
    const showFlag = reached(phase, 'suspicion') || (phase === 'flags' && order > 0 && order <= decided)
    return {
      ...h,
      hint: tonight,
      lit: tonight ? tonight === state.truth : null,
      flag: showFlag ? h.flag : before[i].flag,
      suspicion: reached(phase, 'suspicion') ? h.suspicion : before[i].suspicion,
      suspicions: reached(phase, 'suspicion') ? h.suspicions : before[i].suspicions,
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
    | { kind: 'scale'; who: number; text: string; detail: string[]; scale: Scale; me: number } // text: 짧은 결론, detail: 생각 줄 목록
    | { kind: 'event'; text: string; good?: boolean }
  )

const saw = { danger: '태풍', safe: '맑음' } as const
const said = { evacuate: '대피', stay: '잔류' } as const

const AGREE_LINES = [
  (w: string) => `그치, 나도 ${w}이라고 봤어`,
  (w: string) => `맞아, 내 눈에도 ${w}으로 보였어`,
  (w: string) => `같은 생각이네, 나도 ${w}으로 봤어`,
  (w: string) => `그래, 내가 본 하늘도 ${w}이었어`,
  (w: string) => `역시, 나도 똑같이 ${w}으로 봤네`,
]
const DISAGREE_LINES = [
  (w: string, me: number, c: string) => `음… 내가 본 건 ${w}인데, ${me}번은 ${c}래`,
  (w: string, me: number, c: string) => `어라, 나는 ${w}이던데 ${me}번은 ${c}라니`,
  (w: string, me: number, c: string) => `이상하네, 난 ${w}으로 봤는데 ${me}번은 ${c}라네`,
  (w: string, me: number, c: string) => `글쎄, 내 눈엔 ${w}인데 ${me}번은 ${c}라고 하네`,
  (w: string, me: number, c: string) => `뭐지, 분명 ${w}으로 봤는데 ${me}번은 ${c}라잖아`,
]
const WARN_LINES = [
  (me: number) => `${me}번 좀 수상한데. 한 번만 더 그러면 재판이야`,
  (me: number) => `${me}번 슬슬 의심스러워. 다음엔 바로 재판이야`,
  (me: number) => `${me}번 영 수상쩍네. 또 이러면 재판 열어야겠어`,
  (me: number) => `${me}번 자꾸 미심쩍네. 또 엇나가면 재판 열 거야`,
  (me: number) => `${me}번 점점 못 믿겠어. 다음엔 재판에 넘겨야겠어`,
]
const byCity = <T,>(city: number, items: readonly T[]) => items[(city - 1) % items.length]

// 저울 읽기용 문장 목록: 숫자 없이 혼잣말로 항목마다 짧은 한 줄 + 마지막 결론 한 줄.
export function scaleText(scale: Scale, me: number, memory: GameState['config']['memory']): string[] {
  const lines = scale.parts.map((p) => {
    const abs = Math.abs(p.value)
    if (p.from === 'hint') {
      if (p.value === 0) return '지금까지 본 하늘은 반반이었어'
      if (memory === 'turn' && abs === 100) return p.value > 0 ? '내가 본 하늘은 태풍이었어' : '내가 본 하늘은 맑았어'
      return `지금까지 본 하늘은 ${p.value > 0 ? '태풍' : '맑음'} 쪽이 많았어`
    }
    const who = p.from === me ? `네(${me}번)` : `${p.from}번`
    if (abs === 0) return `${who} 쪽지는 하나도 안 믿겨`
    const topic = p.from === me ? `너(${me}번)는` : `${p.from}번은`
    const side = p.value > 0 ? '대피' : '잔류'
    const trust = abs === 100 ? '믿을 만해' : abs >= 60 ? '조금 미심쩍어' : '많이 의심스러워'
    return `${topic} ${side}래. ${trust}`
  })
  const choice = `${said[scale.decision]}하기로 했어`
  const diff = Math.abs(scale.total)
  const verdict =
    diff === 0
      ? `양쪽이 똑같아서 이번에 본 하늘대로 ${choice}`
      : diff >= 200
        ? `${said[scale.decision]} 쪽이 훨씬 무거워서 ${choice}`
        : `${said[scale.decision]} 쪽이 조금 더 무거워서 ${choice}`
  lines.push(verdict)
  return lines
}

// scales: 그 턴의 시민 저울 (citizenScales). 있으면 결정 단계에 저울과 "설득 성공"을 적는다.
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
    { phase: 'night', kind: 'when', text: `${PHASE_LABEL.night} (${result.turn}일째${met ? `, ${met}이 만났다` : ''})` },
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
          ? byCity(c.city, AGREE_LINES)(saw[c.hint])
          : byCity(c.city, DISAGREE_LINES)(saw[c.hint], me, said[mine.claim]),
      })
  }

  // 마음속 저울과 작은 성공: 내 쪽지가 없었다면 반대로 골랐을 주민
  for (const c of citizens) {
    const s = scales[c.city]
    if (!s) continue
    const text = `${said[s.decision]}하기로 했어`
    lines.push({
      phase: 'flags',
      kind: 'scale',
      who: c.city,
      text,
      detail: scaleText(s, me, state.config.memory),
      scale: s,
      me,
    })
    if (s.swayed) lines.push({ phase: 'flags', kind: 'event', good: true, text: `${c.city}번이 내 쪽지에 넘어왔다` })
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
    if (onMe >= SUSPICION.threshold - SUSPICION.disagree && onMe < SUSPICION.threshold)
      lines.push({ phase: 'suspicion', kind: 'say', who: c.city, text: byCity(c.city, WARN_LINES)(me) })
    const [top, value] = Object.entries(c.suspicion).sort((x, y) => y[1] - x[1])[0] ?? []
    if (top && value > 0 && state.roles[top] === 'citizen')
      lines.push({ phase: 'suspicion', kind: 'event', text: `${c.city}번이 ${top}번을 의심하고 있다 (의심도 ${value})` })
  }

  if (result.vote) {
    lines.push({ phase: 'trial', kind: 'when', text: PHASE_LABEL.trial })
    for (const [from, to] of Object.entries(result.vote.ballots))
      lines.push({ phase: 'trial', kind: 'say', who: Number(from), text: `난 ${to}번을 지목할게` })
    const a = result.vote.accused
    lines.push({
      phase: 'verdict',
      kind: 'event',
      text:
        a === null
          ? '과반이 모이지 않아 아무도 지목되지 않았다'
          : result.vote.caught
            ? `${a}번이 지목됐다. 마피아가 들켰다`
            : `${a}번이 지목됐지만 무고한 주민이었다. 마피아는 아직 숨어 있다`,
    })
  }
  return lines
}

export type ScaleLine = Extract<Line, { kind: 'scale' }>
type LogEntry =
  | { kind: 'when'; text: string }
  | { kind: 'say'; who: number; text: string; scale?: ScaleLine }
  | { kind: 'scale'; scale: ScaleLine }
  | { kind: 'event'; text: string; good?: boolean }

// 일기장 표시용으로 주민 말(notes 단계)과 그 주민의 저울(scale)을 짝짓는다.
// suspicion·trial 대사에는 붙이지 않고, 짝이 없는 저울(예: ring 이웃 밖)만 단독 행으로 남긴다.
export function pairLogScales(lines: Line[]): LogEntry[] {
  const scalesByCity = new Map<number, ScaleLine>()
  for (const line of lines) {
    if (line.kind === 'scale') scalesByCity.set(line.who, line)
  }
  const attached = new Set<number>()
  const entries: LogEntry[] = []
  for (const line of lines) {
    if (line.kind === 'when') {
      entries.push({ kind: 'when', text: line.text })
    } else if (line.kind === 'say') {
      const scale = line.phase === 'notes' && !attached.has(line.who) ? scalesByCity.get(line.who) : undefined
      if (scale) attached.add(line.who)
      entries.push(scale ? { kind: 'say', who: line.who, text: line.text, scale } : { kind: 'say', who: line.who, text: line.text })
    } else if (line.kind === 'scale') {
      if (!attached.has(line.who)) entries.push({ kind: 'scale', scale: line })
    } else {
      entries.push({ kind: 'event', text: line.text, good: line.good })
    }
  }
  return entries
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
type Summary = { headline: string; moments: string[]; lesson: string; peaks: (number | null)[] }

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
    ? `${day}일째 광장 재판에서 들켰어요`
    : state.outcome === 'perfect_win'
      ? '주민 모두를 끝까지 속였어요'
      : state.outcome === 'win'
        ? '주민 과반을 끝까지 속였어요'
        : `${day}일째에 주민 과반이 속지 않았어요`

  const moments: string[] = []
  if (vote) {
    const voters = Object.entries(vote.ballots)
      .filter(([, to]) => to === vote.accused)
      .map(([from]) => `${from}번`)
    const who = vote.accused === me ? '나를' : `동료 ${vote.accused}번을`
    moments.push(`${day}일째 재판에서 ${voters.join(', ')}이 ${who} 지목했어요 (${voters.length}표, 과반 ${majority(citizens)}표)`)
  } else if (last) {
    const wrong = last.cities.filter((c) => c.role === 'citizen' && c.correct === false).length
    moments.push(`마지막 ${day}일째에 주민 ${citizens}명 중 ${wrong}명이 속았어요 (승리에 ${majority(citizens)}명 필요)`)
  }
  const crossed = history.find((_, i) => (peaks[i] ?? 0) >= SUSPICION.threshold)
  if (crossed) {
    const top = crossed.cities.reduce((a, c) => ((c.suspicion?.[me] ?? 0) > (a.suspicion?.[me] ?? 0) ? c : a))
    moments.push(`${crossed.turn}일째 ${top.city}번의 의심도가 ${top.suspicion![me]}까지 올라 처음으로 재판 기준 ${SUSPICION.threshold}을 넘었어요`)
  }
  const knots = history.filter((t) => t.sharing.some((s) => s.contradictions.some((c) => c.city === me)))
  if (knots.length)
    moments.push(`쪽지 비교에서 다른 쪽지를 보냈다가 ${knots.length}번 들켰어요 (${knots.map((t) => `${t.turn}일째`).join(', ')})`)
  const trials = history.filter((t) => t.vote).length
  if (trials) moments.push(`재판이 ${trials}번 열렸어요`)

  const lesson = knots.length
    ? '쪽지 비교로 이어진 두 집에 다른 쪽지를 보내면 모순으로 의심도가 크게 올라요. 같은 쪽지를 보내 보세요.'
    : crossed
      ? '관측과 다른 쪽지를 계속 받으면 의심도가 쌓여요. 의심도가 높은 집에는 가끔 관측에 맞는 쪽지를 보내 낮춰 보세요.'
      : state.outcome === 'loss'
        ? '들키지는 않았지만 주민 과반을 속이지 못했어요. 창문 불이 꺼진 집은 관측이 틀려 속이기 쉬워요.'
        : peaks.some((v) => v != null)
          ? '의심도가 재판 기준을 넘지 않게 조절하며 끝까지 버텼어요.'
          : '다수결 주민은 의심하지 않아요. 눈치 주민은 의심도가 쌓이면 재판을 열어요.'
  return { headline, moments, lesson, peaks }
}

// 튜토리얼 고정 seed (쉬움·눈치): 1일째 점선(2·3번)·꺼진 창문 2곳·주민 4곳·2일째 변동 표시 3곳·기본 쪽지로 3일간 발각 없음.
export const TUTORIAL_SEED = 15

export type TutorialHighlight =
  | 'sky'
  | 'windows'
  | 'houses'
  | 'suspicion'
  | 'votes'
  | 'share'
  | 'submit'
  | 'flags'
  | 'log'
  | 'scale'
  | 'changed'

export type TutorialStep = {
  text: string
  highlight: TutorialHighlight | null
  wait?: 'card' | 'turn' | 'scale'
  finish?: boolean
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    highlight: 'sky',
    text: '이번 판의 진짜 날씨예요. 주민은 모르고 나(마피아)만 알아요. 마지막 밤에 주민 과반이 날씨와 반대로 움직이면 내가 이겨요.',
  },
  {
    highlight: 'windows',
    text: '주민은 밤마다 날씨를 직접 관측해요. 창문 불이 켜진 집은 다음 관측이 진짜 날씨와 맞고, 꺼진 집은 틀려요. 불이 꺼진 집이 속이기 쉬워요.',
  },
  {
    highlight: 'houses',
    wait: 'card',
    text: '집을 눌러 보낼 쪽지를 골라 보세요.',
  },
  {
    highlight: 'suspicion',
    text: '쪽지를 고르면 의심도가 어떻게 바뀔지 미리 보여요. 주민의 관측과 다른 쪽지를 보내면 의심도가 올라가요. 재판 기준을 넘으면 재판이 열리고, 거기서 마피아로 지목되면 져요.',
  },
  {
    highlight: 'votes',
    text: '주민은 관측 한 표와 받은 쪽지들로 결정을 내려요. 의심하는 집이 보낸 쪽지는 블록이 작아져 덜 믿어요. 카드 아래에서 오늘 밤 이 집이 받을 표를 볼 수 있어요.',
  },
  {
    highlight: 'share',
    text: '점선으로 이어진 두 집은 오늘 밤 내 쪽지를 서로 비교해요(쪽지 비교). 두 집에 다른 쪽지를 보내면 모순이 생겨 의심도가 크게 올라요.',
  },
  {
    highlight: 'submit',
    wait: 'turn',
    text: '다 골랐으면 밤으로 넘겨 보세요.',
  },
  {
    highlight: 'flags',
    text: '밤에 표가 쌓여 주민의 결정이 깃발(대피·잔류)로 섰어요. 이 깃발은 다음 날 다른 주민에게 보내는 쪽지가 돼요.',
  },
  {
    highlight: null,
    text: '주민 집에 마우스를 올리면 그 주민이 다른 집을 의심하는 선이 보여요. 의심도가 높을수록 선이 굵고, 키보드 초점으로도 볼 수 있어요.',
  },
  {
    highlight: 'log',
    text: '주민들이 나눈 말과 결정한 이유가 적혀요. 줄 옆 버튼을 누르면 속마음 저울이 보여요.',
  },
  {
    highlight: 'scale',
    wait: 'scale',
    text: '줄 옆 › 버튼을 눌러 주민의 속마음 저울을 펼쳐 보세요.',
  },
  {
    highlight: 'changed',
    text: '어제와 달라진 집에는 표시가 생겨요. 어제 고른 쪽지는 그대로 남으니, 표시가 뜬 집만 다시 살펴보면 돼요. 이제 혼자 해 보세요.',
  },
  {
    highlight: null,
    finish: true,
    text: '튜토리얼은 여기까지예요. 재판에서 내가 마피아로 지목되면 지고, 마지막 밤에 주민 과반을 속이면 이겨요.',
  },
]

const TUTORIAL_STEP = {
  cardWait: TUTORIAL_STEPS.findIndex((s) => s.wait === 'card'),
  day2Start: TUTORIAL_STEPS.findIndex((s) => s.wait === 'turn') + 1,
  scaleWait: TUTORIAL_STEPS.findIndex((s) => s.wait === 'scale'),
  finish: TUTORIAL_STEPS.findIndex((s) => s.finish),
  done: TUTORIAL_STEPS.length,
} as const

const TUTORIAL_END_TURN = 3

export type TutorialContext = {
  turn: number
  playing: boolean
  cardOpen: boolean
  scaleOpen?: boolean
  gameOver: boolean
  viewingPast?: boolean
}

// 튜토리얼 문구를 문장 끝(. ? !) 기준으로 나눈다. 화면 낭독기는 원래 문장 그대로 읽히고 시각적으로만 문장마다 줄을 바꾼다.
export function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.?!])\s+/)
    .filter(Boolean)
}

// 튜토리얼 단계 진행 규칙: 지금 턴·연출 중 여부·쪽지 카드 열림·속마음 저울 펼침·게임 종료·지난밤 보기로 커서와 현재 표시할 단계를 정한다.
export function tutorialStep(
  cursor: number,
  { turn, playing, cardOpen, scaleOpen = false, gameOver, viewingPast = false }: TutorialContext,
): { cursor: number; step: TutorialStep | null } {
  const { cardWait, day2Start, scaleWait, finish, done } = TUTORIAL_STEP
  if (gameOver || cursor < 0 || cursor >= done || turn > TUTORIAL_END_TURN) return { cursor: done, step: null }

  let next = cursor
  if (turn === 0 && next === cardWait && cardOpen) next = cardWait + 1
  else if (turn === 1 && next < day2Start) next = day2Start
  else if (turn >= 2 && next < finish) next = finish

  if (turn === 1 && !playing && !viewingPast && next === scaleWait && scaleOpen) next = scaleWait + 1

  if (playing || viewingPast) return { cursor: next, step: null }
  if (next === finish && turn < TUTORIAL_END_TURN) return { cursor: next, step: null }
  return { cursor: next, step: TUTORIAL_STEPS[next] }
}
