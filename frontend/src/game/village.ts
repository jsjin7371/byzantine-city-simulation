import { SUSPICION, TOTAL_TURNS, claimTargets, difficulties, majority } from '../gameApi.ts'
import type { Claim, Difficulty, GameState, Role, Truth, TurnResult } from '../gameApi.ts'

// 엔진(engine/city/ai.py)이 AI 응답 실패 때 붙이는 접두어를 화면용 쉬운 문장으로 바꾼다. 오류 종류는 숨긴다.
export const plainAiReason = (reason: string) =>
  reason.replace(/^\[AI 응답 실패\([^)]*\)로 눈치 규칙 대체\]/, 'AI 주민이 답하지 못해 눈치 규칙으로 판단했어요.')

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
// 고리 연결 오솔길 5개 (양옆 이웃 집끼리만 이어지는 길: 0-1-2-3-4-0)
const RING_EDGES: readonly (readonly [number, number, number, number, number, number])[] = [
  [450, 528, 340, 518, 230, 470],
  [230, 470, 208, 358, 230, 245],
  [230, 245, 450, 218, 670, 245],
  [670, 245, 692, 358, 670, 470],
  [670, 470, 560, 518, 450, 528],
]
const quad = ([x0, y0, cx, cy, x1, y1]: readonly [number, number, number, number, number, number]) =>
  `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`
export const RING_TRAILS = RING_EDGES.map(quad)

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

// 모순 매듭 문구: 눈치 주민은 고정 수치(+20)를 보이고, AI 주민은 LLM이 의심도를 자유롭게 정하므로 고정 수치 없이 안내한다.
export function contradictionKnotCopy(
  citizenType: GameState['config']['citizen_type'],
  kind: 'clashes' | 'caught',
  a: number,
  b: number,
): { text: string; label: string } {
  const head = kind === 'caught' ? '모순 발견' : citizenType === 'ai' ? '모순 주의' : '모순 위험'
  if (citizenType === 'ai') {
    const verb = kind === 'caught' ? '보냈어요' : '골랐어요'
    return { text: head, label: `${head}: ${a}번 집과 ${b}번 집에 다른 쪽지를 ${verb}. AI 주민이 의심할 수 있어요.` }
  }
  const pair = kind === 'caught' ? `${a}번 집과 ${b}번 집` : `${a}번 집과 ${b}번 집에 다른 쪽지`
  return { text: `모순 +${SUSPICION.contradiction}`, label: `${head}: ${pair}, 의심도 +${SUSPICION.contradiction}` }
}

// 광장 쪽지 비교 배지 문구. 쌍이 1개면 기존 문구를 유지하고, 2개 이상이면 모순 요약까지 배지 하나로 합친다.
export function shareBadgeLabel(
  pairCount: number,
  clashCount: number,
  shareMode: GameState['config']['share_mode'],
  citizenType: GameState['config']['citizen_type'],
): string | null {
  if (pairCount <= 0) return null
  if (pairCount === 1) return '오늘 밤 쪽지 비교'
  const base = shareMode === 'all' ? '모든 집 쪽지 비교' : '오늘 밤 쪽지 비교'
  if (clashCount <= 0) return base
  if (citizenType === 'ai') return `${base} · 모순 ${clashCount}쌍`
  return `${base} · 모순 ${clashCount}쌍 (집마다 +${SUSPICION.contradiction})`
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
  return { from, next, trial: next >= SUSPICION.threshold, contradiction }
}
export type Preview = NonNullable<ReturnType<typeof suspicionPreview>>
// 관측과 어긋나거나(+20) 모순이 겹치면(0 이상) 불리(100→100 포함). 모순 없이 관측에 맞는 말(감소 또는 0→0)만 유리.
export const worsens = (p: Pick<Preview, 'from' | 'next' | 'contradiction'>) =>
  p.contradiction || (p.next >= p.from && p.next > 0)

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

// 고리 연결에서 인접한 두 집 사이의 오솔길 경로(정방향·역방향). 인접하지 않으면 광장 경로로 대체한다.
function ringNotePath(player: number, from: number, to: number) {
  const [sa, sb] = [slotOf(player, from), slotOf(player, to)]
  if (sb === (sa + 1) % 5) return quad(RING_EDGES[sa])
  if (sa === (sb + 1) % 5) {
    const [x0, y0, cx, cy, x1, y1] = RING_EDGES[sb]
    return quad([x1, y1, cx, cy, x0, y0])
  }
  return sharePath(player, from, to)
}

// 밤에 오솔길을 따라 오가는 말: 받은 집마다 보낸 집에서 온 주장 (connection이 ring이면 고리 오솔길을 따른다).
export function talkNotes(
  player: number,
  result: Pick<TurnResult, 'cities'>,
  connection: GameState['config']['connection'] = 'all',
) {
  return result.cities.flatMap((c) =>
    Object.entries(c.received ?? {}).flatMap(([from, msg]) => {
      const s = Number(from)
      if (!msg) return []
      const path = connection === 'ring' ? ringNotePath(player, s, c.city) : sharePath(player, s, c.city)
      return [{ from: s, to: c.city, claim: msg.claim, path }]
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
  order: number // 시계 방향 시민 순번 (1부터, 마피아는 0)
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

export type ObservationTag = {
  claim: Claim
  lit: boolean
  aria: string
}

// 창문 불(h.lit)이 보이는 집 아래에 붙일 오늘 밤 관측 꼬리표와 낭독 문구 (danger→대피, safe→잔류).
export function nextObservationTag(h: Pick<House, 'hint' | 'lit'>): ObservationTag | null {
  if (h.lit == null || h.hint == null) return null
  const claim: Claim = h.hint === 'danger' ? 'evacuate' : 'stay'
  const word = said[claim]
  return {
    claim,
    lit: h.lit,
    aria: h.lit ? `오늘 밤 관측 ${word}, 맞음, 불 켜짐` : `오늘 밤 관측 ${word}, 틀림, 불 꺼짐`,
  }
}

// 보드가 그릴 집 상태. result가 없으면 1턴 전 (게임 상태의 힌트만 있음).
export function villageHouses(
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth' | 'next_hints'>,
  result: Pick<TurnResult, 'cities' | 'next_hints'> | null,
): House[] {
  const me = String(state.player_city)
  const hints = result ? result.next_hints : state.next_hints
  const targets = claimTargets(state)
  let citizenIdx = 0
  return houseSlots(state.player_city).map((h) => {
    const role = state.roles[h.city]
    const row = result?.cities.find((c) => c.city === h.city)
    const hint = hints?.[h.city]
    return {
      ...h,
      order: role === 'citizen' ? ++citizenIdx : 0,
      role,
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
// 각 선과 숫자 꼬리표는 게이지·예상 문구·관측/변동 꼬리표·깃발·광장 글자를 피하는 빈 통로에 놓는다.
type LinkGeom = { a: [number, number]; b: [number, number]; c: [number, number]; tag: [number, number] }
const SUSPICION_EDGE: Record<string, LinkGeom> = {
  '0-1': { a: [412, 494], b: [282, 462], c: [352, 466], tag: [352, 474] },
  '0-2': { a: [432, 480], b: [300, 294], c: [348, 264], tag: [362, 333] }, // 2번 집 예상 문구 아래·쪽지 비교 이름표 아래로
  '0-3': { a: [466, 480], b: [618, 242], c: [476, 336], tag: [482, 404] },
  '0-4': { a: [488, 494], b: [618, 462], c: [548, 466], tag: [548, 474] },
  '1-2': { a: [178, 412], b: [174, 248], c: [44, 344], tag: [124, 372] },
  '1-3': { a: [282, 420], b: [618, 242], c: [450, 420], tag: [366, 409] },
  '1-4': { a: [282, 424], b: [618, 424], c: [450, 438], tag: [450, 431] },
  '2-3': { a: [282, 204], b: [618, 204], c: [450, 152], tag: [450, 178] },
  '2-4': { a: [294, 294], b: [618, 414], c: [484, 306], tag: [547, 366] },
  '3-4': { a: [726, 246], b: [750, 420], c: [932, 208], tag: [814, 334] },
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
      return [
        {
          from: from.city,
          to: to.city,
          value,
          path: `M${start[0]} ${start[1]} Q${geom.c[0]} ${geom.c[1]} ${end[0]} ${end[1]}`,
          labelX: geom.tag[0],
          labelY: geom.tag[1],
          strokeWidth: Number((1.8 + (value / 100) * 4.2).toFixed(2)),
        },
      ]
    })
}

export type VoteItem = {
  from: 'hint' | number
  role: 'hint' | Role
  claim: Claim | null // null이면 플레이어는 "고르는 중", 관측은 기억 상쇄(0표)
  weight: number // 0..100 (기억한 관측은 N*100, 어젯밤 의심도 기준)
  hintCount?: number // memory가 recent/full로 지난 힌트를 포함할 때 순 관측 표 수
}

export type TonightVotes = {
  items: VoteItem[]
  noCitizenNotesYet: boolean // 1일째처럼 이웃 주민이 아직 어제 결정이 없을 때
  usesSuspicion: boolean // 눈치 시민(7.6 가중치 규칙)이면 true, 다수결·AI면 false
  ai: boolean // AI 시민(LLM 자율 판단)이면 true
}

// 쪽지 카드 "이 집의 표": 오늘 밤 targetCity가 받을 관측(기억 포함) + 보낸 집별 쪽지 1장.
// 합계나 예상 결과는 계산하지 않고 표 구성과 어젯밤 기준 믿음 크기만 돌려준다.
export function tonightVotes(
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth'>,
  houses: Pick<House, 'city' | 'role' | 'hint' | 'flag' | 'suspicions'>[],
  targetCity: number,
  claims: Record<string, Claim>,
  history: Pick<TurnResult, 'cities'>[] = [],
): TonightVotes {
  const target = houses.find((h) => h.city === targetCity)
  const usesSuspicion = state.config.citizen_type === 'wary'
  const ai = state.config.citizen_type === 'ai'
  if (!target || target.role !== 'citizen') {
    return { items: [], noCitizenNotesYet: false, usesSuspicion, ai }
  }
  const items: VoteItem[] = []
  if (target.hint) {
    const { memory } = state.config
    const past = memory === 'turn' ? [] : memory === 'recent' ? history.slice(-1) : history
    const pastHints = past
      .map((t) => t.cities.find((c) => c.city === targetCity)?.hint)
      .filter((h): h is Truth => h != null)
    const hints = [...pastHints, target.hint]
    const net = hints.reduce((sum, h) => sum + vote(h), 0)
    const count = Math.abs(net) / 100
    items.push({
      from: 'hint',
      role: 'hint',
      claim: net === 0 ? null : net > 0 ? 'evacuate' : 'stay',
      weight: Math.abs(net),
      ...(pastHints.length > 0 ? { hintCount: count } : {}),
    })
  }
  const neighbors = (
    state.config.connection === 'ring'
      ? [((targetCity + 3) % 5) + 1, (targetCity % 5) + 1]
      : [1, 2, 3, 4, 5].filter((c) => c !== targetCity)
  ).sort((a, b) => Number(state.roles[b] === 'player') - Number(state.roles[a] === 'player') || a - b)
  const byCity = new Map(houses.map((h) => [h.city, h]))
  const lie: Claim = state.truth === 'danger' ? 'stay' : 'evacuate'
  const weightOf = (sender: number) => (usesSuspicion ? 100 - (target.suspicions?.[sender] ?? 0) : 100)

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

// 쪽지 카드 표 항목 라벨 (짧은 화면 표기 / 낭독기 표기 공용).
export function voteItemLabel(item: VoteItem, verbose = false): string {
  if (item.role === 'hint') return item.hintCount != null ? `관측 ${item.hintCount}표` : '관측'
  if (item.role === 'player') return verbose ? '내 쪽지' : '나'
  if (item.role === 'colleague') return verbose ? `동료 ${item.from}번` : '동료'
  return `${item.from}번`
}

export const TONIGHT_SCALE_TITLE = '오늘 밤 저울'

// 오늘 밤 저울 부제·안내 문구와 낭독기 설명 문구.
export function tonightVotesText(votes: TonightVotes): {
  subtitle: string
  note: string | null
  aiNote: string | null
  aria: string
} {
  const subtitle = votes.ai ? '스스로 판단' : votes.usesSuspicion ? '어젯밤 기준' : '모두 1표'
  const note = votes.noCitizenNotesYet ? '1일째는 이웃 주민 쪽지가 없어요' : null
  const aiNote = votes.ai ? 'AI 주민은 의심도를 참고해 스스로 판단해요' : null
  const summary = votes.items
    .map((item) => {
      const who = voteItemLabel(item, true)
      const what = item.claim ? said[item.claim] : item.role === 'hint' ? '상쇄' : '고르는 중'
      if (votes.ai || (item.role === 'hint' && item.hintCount != null)) return `${who} ${what}`
      return votes.usesSuspicion ? `${who} ${what} 믿음 ${item.weight}` : `${who} ${what} 1표`
    })
    .join(', ')
  const aria = `${TONIGHT_SCALE_TITLE} (${subtitle}): ${summary}${note ? `, ${note}` : ''}${aiNote ? `. ${aiNote}` : ''}`
  return { subtitle, note, aiNote, aria }
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

// 재판 결과 도장 문구: 연출·호버·낭독용 전체 문구(full)와 낮 광장 꼬리표용 짧은 문구(compact).
// 발각/무고 구분은 색만이 아니라 글자로도 드러낸다.
export function trialStampCopy(vote: Pick<NonNullable<TurnResult['vote']>, 'accused' | 'caught'>): {
  full: string
  compact: string
} {
  if (vote.accused === null) return { full: '과반 없음', compact: '과반 없음' }
  return vote.caught
    ? { full: `${vote.accused}번 집 발각`, compact: `${vote.accused}번 집 · 발각` }
    : { full: `${vote.accused}번 집 무고한 주민 지목`, compact: `${vote.accused}번 집 · 무고` }
}

// 광장 재판 도장·화살표 표시 단계:
// - full: 밤 연출 중이거나 낮에 의심 선·튜토리얼 강조·쪽지 카드가 없을 때 광장을 호버·포커스한 경우 (화살표와 함께 원래 크기 도장)
// - dimmed: 낮에 집 호버·포커스로 의심 선이 보일 때 (작은 꼬리표를 흐리게)
// - compact: 그 외 낮 기본 상태 (광장 위 작은 꼬리표)
export type TrialStampMode = 'full' | 'compact' | 'dimmed'

export function trialStampMode({
  isNight,
  trialInspect,
  hasSuspicionLines,
  hasHighlight,
  hasOpenCard,
}: {
  isNight: boolean
  trialInspect: boolean
  hasSuspicionLines: boolean
  hasHighlight: boolean
  hasOpenCard: boolean
}): TrialStampMode {
  if (isNight || (!hasSuspicionLines && !hasHighlight && !hasOpenCard && trialInspect)) return 'full'
  return hasSuspicionLines ? 'dimmed' : 'compact'
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

// 밤 ③ 주민 결정 한 집 연출 시간표 (상자 → 블록 → 많은 쪽 표시 → 꼬리표 → 깃발 → 불꽃 순차, 4집 기준 추가 연출 2860ms <= 3000ms).
export const VOTE_ANIM = {
  boxMs: 90,
  blockStartMs: 90,
  blockStaggerMs: 25,
  blockMs: 90,
  markGapMs: 15,
  markMs: 170,
  tagGapMs: 10,
  tagMs: 100,
  flagGapMs: 20,
  flagMs: 170,
  sparkGapMs: 10,
  sparkMs: 145,
  stepMs: 940,
} as const

export function voteAnimDelays(blockCount: number) {
  const blocksEnd =
    blockCount > 0
      ? VOTE_ANIM.blockStartMs + (blockCount - 1) * VOTE_ANIM.blockStaggerMs + VOTE_ANIM.blockMs
      : VOTE_ANIM.boxMs
  const markDelay = blocksEnd + VOTE_ANIM.markGapMs
  const tagDelay = markDelay + VOTE_ANIM.markMs + VOTE_ANIM.tagGapMs
  const flagDelay = tagDelay + VOTE_ANIM.tagMs + VOTE_ANIM.flagGapMs
  const sparkDelay = flagDelay + VOTE_ANIM.flagMs + VOTE_ANIM.sparkGapMs
  return { blocksEnd, markDelay, tagDelay, flagDelay, sparkDelay, totalMs: sparkDelay + VOTE_ANIM.sparkMs }
}

// 한 턴 결과를 보여 줄 단계 목록. 마지막 단계(day)가 최종 상태다.
// ③ 주민 결정(flags)은 표 줄이 있는 시민이면 집마다 차례로(VOTE_ANIM.stepMs) 쌓고, AI 시민(withVotes=false)은 한 번에 세운다.
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
    for (let i = 1; i <= citizens; i++) steps.push({ phase: 'flags', ballots: 0, decided: i, ms: VOTE_ANIM.stepMs })
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

// 튜토리얼 첫 밤의 ③ 주민 결정은 처음 보는 사람이 읽을 수 있게 더 오래 둔다.
export function nightStepMs(
  step: Pick<Step, 'phase' | 'ms'>,
  tutorial: boolean,
  turn: number | null | undefined,
): number {
  const slow = tutorial && turn === 1 && step.phase === 'flags'
  return step.ms * (slow ? 2.5 : 1)
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
  return after.map((h, i) => {
    const tonight = result.cities.find((c) => c.city === h.city)?.hint ?? null
    const showFlag = reached(phase, 'suspicion') || (phase === 'flags' && h.order > 0 && h.order <= decided)
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
    | { kind: 'scale'; who: number; text: string; summary: string; detail: string[]; scale: Scale; me: number } // text: 짧은 결론, summary: 낭독기 표 요약, detail: 생각 줄 목록
    | { kind: 'event'; text: string; good?: boolean }
  )

export type ScaleLeader = {
  winner: Claim | 'tie'
  label: string
  aria: string
}

// 밤 ③ 주민 결정에서 표가 많은 쪽(또는 동점 시 관측대로)의 꼬리표와 낭독 문구.
export function scaleLeader(scale: Pick<Scale, 'total' | 'decision'>): ScaleLeader {
  if (scale.total > 0) {
    return { winner: 'evacuate', label: '대피 쪽이 많아요', aria: '대피 쪽이 많아 대피' }
  }
  if (scale.total < 0) {
    return { winner: 'stay', label: '잔류 쪽이 많아요', aria: '잔류 쪽이 많아 잔류' }
  }
  const text = `같아서 관측대로 ${said[scale.decision]}`
  return { winner: 'tie', label: text, aria: text }
}

// 밤 ③ 표 줄(aria-hidden) 대신 낭독기에 읽힐 집별 저울 요약.
// 다수결은 1표=100을 정수 표 수로, 눈치는 신뢰 가중치 합을 무게로 읽는다.
export function scaleVoteSummary(
  city: number,
  scale: Scale,
  citizenType: GameState['config']['citizen_type'],
): string {
  const evac = scale.parts.filter((p) => p.value > 0).reduce((a, p) => a + p.value, 0)
  const stay = scale.parts.filter((p) => p.value < 0).reduce((a, p) => a - p.value, 0)
  const choice = `${said[scale.decision]}하기로 했어요`
  if (citizenType === 'majority') {
    const evacVotes = Math.round(evac / 100)
    const stayVotes = Math.round(stay / 100)
    const verdict =
      scale.total === 0
        ? `표가 같아서 관측대로 ${choice}`
        : `${said[scale.decision]} 쪽이 더 많아서 ${choice}`
    return `${city}번 집 속마음 저울: 대피 ${evacVotes}표, 잔류 ${stayVotes}표. ${verdict}.`
  }
  const verdict =
    scale.total === 0
      ? `무게가 같아서 관측대로 ${choice}`
      : `${said[scale.decision]} 쪽이 더 무거워서 ${choice}`
  return `${city}번 집 속마음 저울: 대피 쪽 무게 ${evac}, 잔류 쪽 무게 ${stay}. ${verdict}.`
}

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
    if (ai && c.reason) lines.push({ phase: 'notes', kind: 'say', who: c.city, text: plainAiReason(c.reason) })
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
      summary: scaleVoteSummary(c.city, s, state.config.citizen_type),
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
    const hasTiedVoter = citizens.some((c) => {
      if (!c.suspicion || !(String(c.city) in result.vote!.ballots)) return false
      const vals = Object.values(c.suspicion)
      if (vals.length === 0) return false
      const top = Math.max(...vals)
      return vals.filter((v) => v === top).length > 1
    })
    if (hasTiedVoter) {
      lines.push({
        phase: 'trial',
        kind: 'event',
        text: '가장 의심하는 집이 여럿이면(아무도 의심하지 않을 때도) 그중 아무나 지목해요.',
      })
    }
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
            ? `${a}번이 지목됐다. 마피아가 재판에 걸렸다`
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

// 마을 이야기 상단 안내와 3색 범례 표시 여부. AI 주민은 속마음 저울(› 버튼)과 3색 막대를 쓰지 않는다.
export function villageLogHeader(citizenType: GameState['config']['citizen_type']): {
  intro: string
  showLegend: boolean
} {
  if (citizenType === 'ai') {
    return {
      intro: '밤마다 AI 주민이 직접 판단한 이유가 적혀요.',
      showLegend: false,
    }
  }
  return {
    intro: '밤마다 주민들이 나눈 말과 결정한 이유가 적혀요. 줄 옆 › 버튼을 누르면 속마음 저울이 보여요.',
    showLegend: true,
  }
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

// 결과 화면 (명세: 결과 해석 확장)
export type TopicKey = 'byz' | 'equiv' | 'onoff' | 'ring' | 'condorcet' | 'zealot' | 'falsepos' | 'audit'
export type TagKey = 'audit' | 'onoff' | 'zealot' | 'falsepos' | 'equiv'

export const TAG_LABELS: Record<TagKey, string> = {
  audit: '감사 회피',
  onoff: '온오프 공격',
  zealot: '완고한 행위자',
  falsepos: '거짓 양성',
  equiv: '이중 발언',
}

export type Moment = {
  day: number | null
  text: string
  tag?: TagKey
}

export type BaselineReading = {
  lines: string[]
  topic: 'byz' | 'ring'
  linkTitle: string
  linkSub: string
}

export type InfluenceSummary = {
  count: number
  noNoteWinRate: string | null
}

export type ChartPin = {
  labels: string[]
  danger: boolean
}

export type Summary = {
  headline: string
  chips: string[]
  baseline: BaselineReading
  decisive: string[]
  moments: Moment[]
  influence: InfluenceSummary | null
  deceived: number[]
  peaks: (number | null)[]
  pins: Record<number, ChartPin>
  majorityNeed: number
  citizenCount: number
}

const NO_NOTE_WIN_RATE: Record<number, string> = { 0.3: '92%', 0.4: '82%', 0.48: '72%' }

const MAFIA_CHIPS: Record<GameState['config']['mafia_count'], string> = {
  1: '마피아는 나 혼자',
  2: '마피아 둘',
}
const SHARE_CHIPS: Record<GameState['config']['share_mode'], string> = {
  all: '모든 집 쪽지 비교',
  none: '쪽지 비교 없음',
  pairs: '밤마다 쪽지 비교',
}
const CITIZEN_CHIPS: Record<GameState['config']['citizen_type'], string> = {
  wary: '눈치 보는 주민',
  majority: '다수결 주민',
  ai: 'AI 주민',
}

// 이번 마을 칩: 집 수, 마피아 수, 쪽지 비교 방식, 연결 방식, 주민 종류.
export function resultVillageChips(state: Pick<GameState, 'config' | 'roles'>): string[] {
  return [
    `집 ${Object.keys(state.roles).length}채`,
    MAFIA_CHIPS[state.config.mafia_count],
    SHARE_CHIPS[state.config.share_mode],
    state.config.connection === 'ring' ? '양옆과만 연결' : '모든 집과 연결',
    CITIZEN_CHIPS[state.config.citizen_type],
  ]
}

// 날짜별 속은 주민 수 (role==='citizen' && correct===false).
export function resultDeceived(history: Pick<TurnResult, 'cities'>[]): number[] {
  return history.map((t) => t.cities.filter((c) => c.role === 'citizen' && c.correct === false).length)
}

// 판 전체에서 플레이어가 매 턴 모든 주민에게 진짜 날씨만 보냈는지 확인.
function playerAlwaysHonest(
  state: Pick<GameState, 'player_city' | 'truth'>,
  history: Pick<TurnResult, 'cities'>[],
): boolean {
  const me = state.player_city
  let sentCount = 0
  for (const t of history) {
    for (const c of t.cities) {
      if (c.role !== 'citizen') continue
      const msg = c.received?.[me]
      if (!msg) continue
      sentCount++
      if (!agrees(state.truth, msg.claim)) return false
    }
  }
  return sentCount > 0
}

function peakSus(cities: Pick<TurnResult, 'cities'>['cities'], target: number | null): number {
  if (target == null) return 0
  return Math.max(0, ...cities.filter((c) => c.role === 'citizen').map((c) => c.suspicion?.[target] ?? 0))
}

// 재판 기록: 지목된 집의 그날 최고 의심도와, 동점 추첨이 지목을 갈랐는지(그 집만 가장 의심한 주민이 과반이 아님).
function trialRecord(turn: Pick<TurnResult, 'cities' | 'vote'> | undefined) {
  const accused = turn?.vote?.accused
  if (accused == null) return null
  const citizens = turn!.cities.filter((c) => c.role === 'citizen')
  const sure = citizens.filter((c) =>
    Object.entries(c.suspicion ?? {}).every(
      ([target, v]) => Number(target) === accused || v < (c.suspicion?.[accused] ?? 0),
    ),
  ).length
  return { accused, sus: peakSus(citizens, accused), drawn: sure * 2 <= citizens.length }
}

// 출발선 문장 (목업 "검토용 7가지" 표 기준). 화면 겉면에는 수식을 쓰지 않는다.
export function resultBaseline(
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth' | 'outcome' | 'end_reason'>,
  history: Pick<TurnResult, 'turn' | 'cities' | 'vote'>[],
): BaselineReading {
  const n = Object.keys(state.roles).length
  const f = state.config.mafia_count
  const citizens = Object.values(state.roles).filter((r) => r === 'citizen').length
  const need = majority(citizens)
  const won = state.outcome === 'win' || state.outcome === 'perfect_win'
  const last = history.at(-1)
  const topic: 'byz' | 'ring' = state.config.connection === 'ring' ? 'ring' : 'byz'
  const linkTitle = topic === 'ring' ? '연결도 조건' : '비잔틴 장군 문제'
  const linkSub =
    topic === 'ring'
      ? '왜 양옆만 이어지면 주민 방어가 흔들리는지'
      : n < 3 * f + 1
        ? '왜 마피아가 둘이면 보장이 사라지는지'
        : '왜 주민이 유리했는지'

  // 7. 정직했는데 재판
  if (
    state.end_reason === 'caught' &&
    last?.vote?.accused === state.player_city &&
    playerAlwaysHonest(state, history)
  ) {
    return {
      lines: ['진짜 날씨만 말했는데도 재판에 걸렸어요. 하늘을 잘못 본 주민에게는 사실도 거짓말처럼 들리거든요.'],
      topic,
      linkTitle,
      linkSub,
    }
  }

  // 5. 고리 마을 (연결 부족)
  if (state.config.connection === 'ring') {
    const ending = won
      ? '이번엔 전략이 통했어요.'
      : state.end_reason === 'caught'
        ? last && last.turn >= TOTAL_TURNS
          ? '이번엔 마지막 밤 재판에 걸렸어요.'
          : '이번엔 재판에 걸려 일찍 끝났어요.'
        : '이번엔 주민들이 끝까지 버텨 냈어요.'
    return {
      lines: [
        `양옆 이웃하고만 이야기하는 마을은, 어떤 규칙을 써도 주민이 꼭 지켜 낸다는 보장이 없어요. 그렇다고 저절로 무너지는 것은 아니에요. ${ending}`,
      ],
      topic,
      linkTitle,
      linkSub,
    }
  }

  // 6. 마피아 둘 (n < 3f + 1)
  if (n < 3 * f + 1) {
    const head =
      n === 5 && f === 2
        ? '집 다섯에 마피아 둘이면 주민이 반드시 버틴다는 보장이 사라져요.'
        : `집 ${n}채에 마피아 ${f}명이면 주민이 반드시 버틴다는 보장이 사라져요.`
    const trial = state.end_reason === 'caught' ? trialRecord(last) : null
    const who = trial && state.roles[trial.accused] === 'colleague' ? '동료가' : '내 집이'
    const tail = won
      ? ' 이번엔 끝까지 흔들어 놓았어요.'
      : trial
        ? ` 이번 재판에서는 ${who} 의심도 ${trial.sus}에서 지목됐어요${trial.drawn ? '(동점 추첨)' : ''}.`
        : ' 이번엔 마지막 밤 주민 과반을 속이지 못했어요.'
    return { lines: [`${head}${tail}`], topic, linkTitle, linkSub }
  }

  // n >= 3f + 1 && connection === 'all'
  // 4. 하늘 탓 (노트 §1-3 ② 증거 조건: 마지막 턴 주민별 기억 관측 다수 mine의 정답 표 <= 오답 표 + f, 재판 종료 제외)
  if (state.end_reason !== 'caught' && last) {
    const scales = citizenScales(state, history, history.length - 1)
    let rightMine = 0
    let wrongMine = 0
    for (const c of last.cities) {
      if (c.role !== 'citizen' || !c.hint) continue
      const hintScore = scales[c.city]?.parts.find((p) => p.from === 'hint')?.value ?? 0
      if (agrees(state.truth, pick(hintScore, c.hint))) rightMine++
      else wrongMine++
    }
    if (rightMine + wrongMine > 0 && !(rightMine > wrongMine + f)) {
      return {
        lines: [
          won
            ? '주민들이 본 하늘부터 진짜 날씨와 많이 어긋난 판이었어요. 하늘도 당신 편이었어요.'
            : '주민들이 본 하늘부터 진짜 날씨와 많이 어긋난 판이었어요. 누가 마피아였어도 주민이 이긴다고 장담하기 어려웠어요.',
        ],
        topic,
        linkTitle,
        linkSub,
      }
    }
  }

  // 1. 주민 유리, 승리
  if (won) {
    const dec = resultDeceived(history)
    const lastWrong = dec.at(-1) ?? 0
    let streakIdx = dec.length - 1
    while (streakIdx > 0 && dec[streakIdx - 1] >= need) streakIdx--
    const streakDay = history[streakIdx]?.turn ?? last?.turn ?? 0
    const detail =
      streakDay > 0 && lastWrong >= need
        ? `밤마다 한 번에 마음을 정하는 주민들의 빈틈을 파고들어, ${streakDay}일째부터 과반의 마음을 돌려 놓았어요.`
        : '밤마다 한 번에 마음을 정하는 주민들의 빈틈을 잘 파고들었어요.'
    return {
      lines: [`원래 주민에게 유리한 판이었는데도 해냈어요. ${detail}`],
      topic,
      linkTitle,
      linkSub,
    }
  }

  // 2. 15일 버텼지만 패배
  if (state.end_reason === 'turns_done') {
    return {
      lines: [
        '끝까지 정체는 숨겼어요. 다만 마지막 밤, 주민들이 본 하늘이 진짜 날씨 쪽으로 모여 과반의 마음을 돌리지 못했어요.',
      ],
      topic,
      linkTitle,
      linkSub,
    }
  }

  // 3. 재판 패배 (기본)
  const sub =
    n === 5 && f === 1
      ? '다섯 집 중 거짓말하는 집은 하나뿐이라, 주민 넷이 서로 맞춰 보면 가려낼 수 있었거든요.'
      : `집 ${n}채 중 거짓말하는 집은 ${f}곳뿐이라, 주민들이 서로 맞춰 보면 가려낼 수 있었거든요.`
  return {
    lines: ['원래 주민에게 유리한 판이었어요.', sub],
    topic,
    linkTitle,
    linkSub,
  }
}

// 결정타: 기존 판정(재판·모순·과반)을 재사용해 한 문장(필요 시 2줄)으로.
export function resultDecisive(
  state: Pick<GameState, 'player_city' | 'roles' | 'outcome' | 'end_reason'>,
  history: Pick<TurnResult, 'turn' | 'cities' | 'sharing' | 'vote'>[],
): string[] {
  const me = state.player_city
  const last = history.at(-1)
  const day = last?.turn ?? 0
  const citizens = Object.values(state.roles).filter((r) => r === 'citizen').length
  const need = majority(citizens)

  if (state.end_reason === 'caught' && last?.vote) {
    const caughtClash = last.sharing.find((s) => s.contradictions.some((c) => c.city === me))
    if (caughtClash && last.vote.accused === me) {
      const [a, b] = caughtClash.pair
      return [
        `${day}일째 밤, ${a}번 집과 ${b}번 집에 서로 다른 쪽지를 보냈어요.`,
        '그날 쪽지 비교에서 모순이 드러났고, 이어진 재판에서 지목됐어요.',
      ]
    }
    const voters = Object.entries(last.vote.ballots)
      .filter(([, to]) => to === last.vote!.accused)
      .map(([from]) => `${from}번`)
    const who = last.vote.accused === me ? '나를' : `동료 ${last.vote.accused}번을`
    return [`${day}일째 재판에서 ${voters.join(', ')} 집이 ${who} 마피아로 지목했어요 (${voters.length}표, 과반 ${need}표).`]
  }

  if (last) {
    const wrong = last.cities.filter((c) => c.role === 'citizen' && c.correct === false).length
    if (state.outcome === 'perfect_win') {
      return [`마지막 ${day}일째 밤, 주민 ${citizens}명 모두를 끝까지 속여 완승을 거뒀어요.`]
    }
    if (state.outcome === 'win') {
      return [`마지막 ${day}일째 밤, 주민 ${citizens}명 중 ${wrong}명을 속여 과반(${need}명)을 넘겼어요.`]
    }
    return [`마지막 ${day}일째 밤, 주민 ${citizens}명 중 ${wrong}명만 속아 과반(${need}명)에 못 미쳤어요.`]
  }
  return ['이번 판이 끝났어요.']
}

// 해당 턴에서 내 쪽지가 마음을 거짓 쪽으로 뒤집은 주민 수.
function swayedWrong(
  state: Pick<GameState, 'player_city' | 'config'>,
  history: Pick<TurnResult, 'cities'>[],
  i: number,
): number {
  const scales = citizenScales(state, history, i)
  return history[i].cities.filter((c) => c.role === 'citizen' && c.correct === false && scales[c.city]?.swayed).length
}

// 영향력: 판 전체에서 citizenScales().swayed && correct===false인 (턴, 주민) 수. AI 주민이면 null.
export function resultInfluence(
  state: Pick<GameState, 'player_city' | 'config' | 'roles'>,
  history: Pick<TurnResult, 'cities'>[],
): InfluenceSummary | null {
  if (state.config.citizen_type === 'ai') return null
  let count = 0
  for (let i = 0; i < history.length; i++) count += swayedWrong(state, history, i)
  const isDefault =
    Object.keys(state.roles).length === 5 &&
    state.config.mafia_count === 1 &&
    state.config.citizen_type === 'wary' &&
    state.config.connection === 'all' &&
    state.config.share_mode === 'pairs' &&
    state.config.memory === 'turn' &&
    state.config.player === 'human'
  return { count, noNoteWinRate: isDefault ? (NO_NOTE_WIN_RATE[state.config.sensor_error] ?? null) : null }
}

type DetectedTactic = {
  tag: TagKey
  day: number
  text: string
  attachTo?: 'knots' | 'caught'
}

// 꼬리표 판정 (아이디어 노트 A2 표 기준 그대로, 최대 2개, 드문 순서).
// 감사 회피 > 온오프 공격 > 완고한 행위자 > 거짓 양성 > 이중 발언.
export function detectTactics(
  state: Pick<GameState, 'player_city' | 'roles' | 'config' | 'truth'>,
  history: Pick<TurnResult, 'turn' | 'cities' | 'sharing' | 'vote'>[],
): DetectedTactic[] {
  const me = state.player_city
  const detected: DetectedTactic[] = []

  // 각 턴이 이중 발언 턴인지(플레이어가 주민들에게 서로 다른 주장을 2종 이상 보냈는지)
  const equivTurnIndices: number[] = []
  for (let i = 0; i < history.length; i++) {
    const claimsSent = new Set<Claim>()
    for (const c of history[i].cities) {
      if (c.role !== 'citizen') continue
      const msg = c.received?.[me]
      if (msg) claimsSent.add(msg.claim)
    }
    if (claimsSent.size >= 2) equivTurnIndices.push(i)
  }

  const contradictionTurns = playerContradictionTurns(me, history)

  // 1. 감사 회피 (완벽한 알리바이): share_mode !== 'none'이고 비교가 실제 일어난 턴 중 이중 발언 5회 이상 & 판 전체 모순 0회
  if (state.config.share_mode !== 'none' && contradictionTurns.length === 0) {
    const auditedEquivIndices = equivTurnIndices.filter((i) => history[i].sharing.length > 0)
    if (auditedEquivIndices.length >= 5) {
      const lastEquiv = history[auditedEquivIndices.at(-1)!]
      detected.push({
        tag: 'audit',
        day: lastEquiv.turn,
        text: `집마다 다른 쪽지를 ${auditedEquivIndices.length}번이나 보냈지만, 쪽지 비교에서는 모순이 한 번도 드러나지 않았어요.`,
      })
    }
  }

  // 2. 온오프 공격 (의심 세탁): 의심도 >= 40일 때 그 주민이 본 하늘과 같은 쪽지를 보내 <= 20으로 내린 뒤, 거짓 쪽지를 보내 그 주민이 틀림
  const onoffHit = regainTrustProgress(state, history).refooled
  if (onoffHit) {
    const nextWhen = onoffHit.foolDay === onoffHit.washDay + 1 ? '다음 날' : `${onoffHit.foolDay}일째`
    detected.push({
      tag: 'onoff',
      day: onoffHit.washDay,
      text: `나를 의심하던 ${onoffHit.city}번 집(의심도 ${onoffHit.fromSus})에 그 집이 본 하늘과 같은 쪽지를 보내 ${onoffHit.toSus}까지 낮춘 뒤, ${nextWhen} 거짓 쪽지를 보냈고 그 집은 틀렸어요.`,
    })
  }

  // 3. 완고한 행위자 (고집쟁이 동료): f=2 판에서 재판에 동료가 지목됨
  if (state.config.mafia_count === 2) {
    const colleagueCity = colleagueCityOf(state.roles)
    if (colleagueCity != null) {
      const colleagueTrial = history.find((t) => t.vote?.accused === colleagueCity)
      if (colleagueTrial) {
        detected.push({
          tag: 'zealot',
          day: colleagueTrial.turn,
          text: `광장 재판에서 동료(${colleagueCity}번 집)가 의심도 ${trialRecord(colleagueTrial)!.sus}에서 지목됐어요.`,
          attachTo: 'caught',
        })
      }
    }
  }

  // 4. 거짓 양성 (누명 씌우기): 재판에서 무고한 주민이 지목됨
  const falsePosTurn = history.find(
    (t) => t.vote != null && t.vote.accused !== null && !t.vote.caught,
  )
  if (falsePosTurn?.vote?.accused != null) {
    detected.push({
      tag: 'falsepos',
      day: falsePosTurn.turn,
      text: `재판에서 마피아가 아닌 ${falsePosTurn.vote.accused}번 집이 지목됐어요.`,
    })
  }

  // 5. 이중 발언 (두 얼굴): 이중 발언한 턴의 내 쪽지가 오답 쪽으로 흔든 주민이 판 전체에서 3명 이상
  let equivSwayed = 0
  let bestEquivTurn: number | null = null
  let bestEquivCount = 0
  for (const idx of equivTurnIndices) {
    const turnSwayed = swayedWrong(state, history, idx)
    equivSwayed += turnSwayed
    if (turnSwayed > bestEquivCount) {
      bestEquivCount = turnSwayed
      bestEquivTurn = history[idx].turn
    }
  }
  if (equivSwayed >= 3) {
    const targetDay = contradictionTurns.at(-1)?.turn ?? bestEquivTurn ?? history[equivTurnIndices.at(-1)!].turn
    detected.push({
      tag: 'equiv',
      day: targetDay,
      text: `같은 날 집마다 다른 쪽지를 보내, 판 전체에서 주민의 마음을 ${equivSwayed}번 거짓 쪽으로 흔들었어요.`,
      attachTo: contradictionTurns.length > 0 ? 'knots' : undefined,
    })
  }

  return detected.slice(0, 2)
}

const TRUST_BROKEN_SUSPICION = 80

function formatHouseGroup(cities: number[]): string {
  return `${cities.join('·')}번 집`
}

function highSuspicionCitizens(cities: TurnResult['cities'], me: number) {
  return cities
    .filter((c) => c.role === 'citizen' && (c.suspicion?.[me] ?? -1) >= TRUST_BROKEN_SUSPICION)
    .sort((a, b) => a.city - b.city)
}

// 신뢰 끊김: 눈치 주민의 나(플레이어)에 대한 의심도가 처음 80 이상이 된 날. 다수결·AI 주민이면 생략.
// 이후 날이 모두 80 이상일 때만 "N일째부터", 아니면 "N일째에는"으로 적는다.
export function detectTrustBrokenMoment(
  state: Pick<GameState, 'player_city' | 'config'>,
  history: Pick<TurnResult, 'turn' | 'cities'>[],
): Moment | null {
  if (state.config.citizen_type !== 'wary') return null
  const me = state.player_city
  const sus = (t: Pick<TurnResult, 'cities'>, city: number) =>
    t.cities.find((c) => c.city === city)?.suspicion?.[me] ?? -1
  for (let i = 0; i < history.length; i++) {
    const t = history[i]
    const high = highSuspicionCitizens(t.cities, me)
    if (high.length === 0) continue
    const houses = formatHouseGroup(high.map((c) => c.city))
    const stayedHigh = high.every((h) => history.slice(i + 1).every((next) => sus(next, h.city) >= TRUST_BROKEN_SUSPICION))
    const span = stayedHigh ? history.slice(i) : [t]
    const allZeroWeight = high.every((h) => span.every((next) => sus(next, h.city) >= 100))
    const when = stayedHigh ? `${t.turn}일째부터` : `${t.turn}일째에는`
    return {
      day: t.turn,
      text: allZeroWeight
        ? `${when} ${houses}은 내 쪽지를 전혀 믿지 않았어요(의심도 100이면 0표예요)`
        : `${when} ${houses}은 내 쪽지를 거의 믿지 않았어요(의심도 ${TRUST_BROKEN_SUSPICION} 이상이면 1/5표 이하예요)`,
    }
  }
  return null
}

// 한꺼번에 풀림: 속은 주민 수가 전날 과반 이상 → 오늘 과반 미만으로 떨어진 첫날과 그날의 상태. AI 주민이면 생략.
export function detectDeceptionDropMoment(
  state: Pick<GameState, 'player_city' | 'roles' | 'config' | 'truth'>,
  history: Pick<TurnResult, 'turn' | 'cities'>[],
  deceived: number[],
  need: number,
): Moment | null {
  if (state.config.citizen_type === 'ai') return null
  const idx = history.findIndex((_, i) => i > 0 && deceived[i - 1] >= need && deceived[i] < need)
  if (idx < 0) return null
  const me = state.player_city
  const t = history[idx]
  const citizens = t.cities.filter((c) => c.role === 'citizen')
  const total = citizens.length
  const correctHints = citizens.filter((c) => c.hint != null && c.hint === state.truth).length
  const highSus = state.config.citizen_type === 'wary' ? highSuspicionCitizens(t.cities, me) : []

  const parts = [`${t.turn}일째, 속은 주민이 ${deceived[idx - 1]}명에서 ${deceived[idx]}명으로 줄었어요`]
  if (total > 0 && correctHints === total) {
    parts.push(`그날은 주민 ${total}명 모두 관측이 맞았어요`)
  } else if (correctHints > 0) {
    parts.push(`그날은 주민 ${total}명 중 ${correctHints}명은 관측이 맞았어요`)
  } else {
    parts.push('그날은 관측이 맞은 주민이 없었어요')
  }
  if (highSus.length > 0) {
    const houses = formatHouseGroup(highSus.map((c) => c.city))
    const allZeroWeight = highSus.every((c) => (c.suspicion?.[me] ?? 0) >= 100)
    parts.push(
      allZeroWeight
        ? `${houses}은 의심도가 100이라 내 쪽지를 전혀 믿지 않았어요`
        : `${houses}은 의심도가 ${TRUST_BROKEN_SUSPICION} 이상이라 내 쪽지를 거의 믿지 않았어요`,
    )
  }
  return { day: t.turn, text: parts.join('. ') }
}

export function gameSummary(
  state: Pick<GameState, 'player_city' | 'roles' | 'config' | 'truth' | 'outcome' | 'end_reason'>,
  history: Pick<TurnResult, 'turn' | 'cities' | 'sharing' | 'vote'>[],
): Summary {
  const me = state.player_city
  const last = history.at(-1)
  const citizens = Object.values(state.roles).filter((r) => r === 'citizen').length
  const need = majority(citizens)
  const deceived = resultDeceived(history)
  const peaks = history.map((t) => {
    const values = t.cities.map((c) => c.suspicion?.[me]).filter((v): v is number => v != null)
    return values.length ? Math.max(...values) : null
  })
  const vote = state.end_reason === 'caught' ? last?.vote : null
  const day = last?.turn ?? 0
  const headline = vote
    ? `${day}일째 광장 재판에 걸렸어요`
    : state.outcome === 'perfect_win'
      ? '주민 모두를 끝까지 속였어요'
      : state.outcome === 'win'
        ? '주민 과반을 끝까지 속였어요'
        : `${day}일째에 주민 과반이 속지 않았어요`

  const tactics = detectTactics(state, history)

  const momentItems: (Moment & { kind?: 'caught' | 'knots' })[] = []

  const trustBroken = detectTrustBrokenMoment(state, history)
  if (trustBroken) momentItems.push(trustBroken)
  const deceptionDrop = detectDeceptionDropMoment(state, history, deceived, need)
  if (deceptionDrop) momentItems.push(deceptionDrop)

  if (vote) {
    const voters = Object.entries(vote.ballots)
      .filter(([, to]) => to === vote.accused)
      .map(([from]) => `${from}번`)
    const who = vote.accused === me ? '나를' : `동료 ${vote.accused}번을`
    momentItems.push({
      kind: 'caught',
      day,
      text: `${day}일째 재판에서 ${voters.join(', ')}이 ${who} 지목했어요 (${voters.length}표, 과반 ${need}표)`,
    })
  } else if (last) {
    const wrong = last.cities.filter((c) => c.role === 'citizen' && c.correct === false).length
    momentItems.push({
      day,
      text: `마지막 ${day}일째에 주민 ${citizens}명 중 ${wrong}명이 속았어요 (승리에 ${need}명 필요)`,
    })
  }
  const crossed = history.find((_, i) => (peaks[i] ?? 0) >= SUSPICION.threshold)
  if (crossed) {
    const top = crossed.cities.reduce((a, c) => ((c.suspicion?.[me] ?? 0) > (a.suspicion?.[me] ?? 0) ? c : a))
    momentItems.push({
      day: crossed.turn,
      text: `${crossed.turn}일째 ${top.city}번의 의심도가 ${top.suspicion![me]}까지 올라 처음으로 재판 기준 ${SUSPICION.threshold} 이상이 됐어요`,
    })
  }
  const knots = playerContradictionTurns(me, history)
  if (knots.length) {
    momentItems.push({
      kind: 'knots',
      day: knots.at(-1)!.turn,
      text: `쪽지 비교에서 모순이 ${knots.length}번 드러났어요 (${knots.map((t) => `${t.turn}일째`).join(', ')})`,
    })
  }

  // 꼬리표를 기존 장면에 붙이거나 새 장면으로 추가
  for (const t of tactics) {
    const target = t.attachTo ? momentItems.find((m) => m.kind === t.attachTo && !m.tag) : undefined
    if (target) target.tag = t.tag
    else momentItems.push({ day: t.day, text: t.text, tag: t.tag })
  }

  const trials = history.filter((t) => t.vote).length
  if (trials) momentItems.push({ day: null, text: `재판이 ${trials}번 열렸어요` })

  // 날짜 순서대로 정렬 (날짜 없는 항목은 뒤로)
  const moments: Moment[] = momentItems
    .sort((a, b) => (a.day ?? Infinity) - (b.day ?? Infinity))
    .map(({ day: d, text, tag }) => (tag ? { day: d, text, tag } : { day: d, text }))

  // 그래프 핀: 모순("모순 드러남"), 재판("재판"), 꼬리표(화면 꼬리표 이름과 동일)
  const pins: Record<number, ChartPin> = {}
  const addPin = (idx: number, label: string, danger: boolean) => {
    if (idx < 0 || idx >= history.length) return
    const cur = pins[idx] ?? { labels: [], danger: false }
    if (!cur.labels.includes(label)) cur.labels.push(label)
    if (danger) cur.danger = true
    pins[idx] = cur
  }
  history.forEach((t, i) => {
    if (t.sharing.some((s) => s.contradictions.some((c) => c.city === me))) addPin(i, '모순 드러남', true)
    if (t.vote) addPin(i, '재판', true)
  })
  for (const m of moments) {
    if (!m.tag || m.day == null) continue
    const idx = history.findIndex((t) => t.turn === m.day)
    if (idx >= 0) addPin(idx, TAG_LABELS[m.tag], m.tag === 'zealot' || m.tag === 'falsepos')
  }

  return {
    headline,
    chips: resultVillageChips(state),
    baseline: resultBaseline(state, history),
    decisive: resultDecisive(state, history),
    moments,
    influence: resultInfluence(state, history),
    deceived,
    peaks,
    pins,
    majorityNeed: need,
    citizenCount: citizens,
  }
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
  closing?: boolean
  finish?: boolean
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    highlight: 'sky',
    text: '이번 판의 진짜 날씨예요. 주민은 모르고 나(마피아)만 알아요. 마지막 밤에 주민 과반이 날씨와 반대로 움직이면 내가 이겨요.',
  },
  {
    highlight: 'windows',
    text: '주민은 밤마다 날씨를 직접 관측해요. 창문 불이 켜진 집은 오늘 밤 관측이 진짜 날씨와 맞고, 꺼진 집은 틀려요. 집 아래 꼬리표에 오늘 밤 관측이 대피인지 잔류인지 적혀 있어요. 불이 꺼진 집이 속이기 쉬워요.',
  },
  {
    highlight: 'houses',
    wait: 'card',
    text: '집을 눌러 보낼 쪽지를 골라 보세요.',
  },
  {
    highlight: 'suspicion',
    text: '쪽지를 고르면 의심도가 어떻게 바뀔지 미리 보여요. 주민이 본 날씨와 같은 쪽지를 보내면 의심도가 내려가고, 다르면 올라가요. 재판 기준 이상이 되면 재판이 열리고, 거기서 마피아로 지목되면 져요.',
  },
  {
    highlight: 'votes',
    text: "주민은 자기가 본 날씨를 한 표, 받은 쪽지를 각각 한 표로 세어 많은 쪽으로 결정해요. 단, 의심하는 집에서 온 쪽지는 더 적게 반영해요. 어떻게 계산됐는지는 마을 이야기 위 '오늘 밤 저울'에서 볼 수 있어요.",
  },
  {
    highlight: 'share',
    text: '점선으로 이어진 두 집은 오늘 밤 내 쪽지를 서로 비교해요(쪽지 비교). 해당하는 두 집에 다른 쪽지를 보내면 모순이 생겨 의심도가 크게 올라요.',
  },
  {
    highlight: 'submit',
    wait: 'turn',
    text: '주민들에게 보낼 쪽지를 다 골랐으면 밤으로 넘겨 보세요.',
  },
  {
    highlight: 'flags',
    text: '밤에 표가 쌓여 더 많은 쪽으로 깃발(대피·잔류)이 섰어요. 이 깃발은 다음 날 다른 주민에게 보내는 쪽지가 돼요.',
  },
  {
    highlight: null,
    text: '주민 집에 마우스를 올리면 그 주민이 다른 집을 의심하는 선이 보여요. 의심도가 높을수록 선이 굵고, 키보드 초점으로도 볼 수 있어요. 나를 의심하는 집에서만, 내 집으로 가는 선이 보여요.',
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
    closing: true,
    text: '시작 화면에서 다른 주민도 고를 수 있어요. 다수결 주민은 의심도가 없어 모든 쪽지를 똑같이 한 표로 세고 재판도 안 열려요. AI 주민은 규칙 대신 AI가 관측·쪽지·의심도를 보고 스스로 판단해요.',
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
  closing: TUTORIAL_STEPS.findIndex((s) => s.closing),
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
  const { cardWait, day2Start, scaleWait, closing, done } = TUTORIAL_STEP
  if (gameOver || cursor < 0 || cursor >= done || turn > TUTORIAL_END_TURN) return { cursor: done, step: null }

  let next = cursor
  if (turn === 0 && next === cardWait && cardOpen) next = cardWait + 1
  else if (turn === 1 && next < day2Start) next = day2Start
  else if (turn >= 2 && next < closing) next = closing

  if (turn === 1 && !playing && !viewingPast && next === scaleWait && scaleOpen) next = scaleWait + 1

  if (playing || viewingPast) return { cursor: next, step: null }
  if (next >= closing && turn < TUTORIAL_END_TURN) return { cursor: next, step: null }
  return { cursor: next, step: TUTORIAL_STEPS[next] }
}

export type DifficultyStat = {
  key: Difficulty
  label: string
  errorPct: number
  avgWrong: number
  atLeastThreePct: number
  waryBotWinPct: number
  majorityBotWinPct: number
}

// 시작 화면 난이도 ? 설명 표 (근거: frontend/src/gameApi.ts 프리셋, docs/spec.md 7.2).
// 평균 틀린 수(4p)와 3명 이상 함께 틀릴 확률 P(X>=3) = 4p^3(1-p) + p^4는 프리셋 sensor_error에서 계산한다.
export const DIFFICULTY_STATS: readonly DifficultyStat[] = (
  [
    { key: 'easy', waryBotWinPct: 57, majorityBotWinPct: 86 },
    { key: 'normal', waryBotWinPct: 31, majorityBotWinPct: 74 },
    { key: 'hard', waryBotWinPct: 8, majorityBotWinPct: 49 },
  ] as const
).map(({ key, waryBotWinPct, majorityBotWinPct }) => {
  const { label, sensor_error: p } = difficulties[key]
  return {
    key,
    label,
    errorPct: Math.round(p * 100),
    avgWrong: Math.round(4 * p * 10) / 10,
    atLeastThreePct: Math.round((4 * p ** 3 * (1 - p) + p ** 4) * 100),
    waryBotWinPct,
    majorityBotWinPct,
  }
})

const COMPLETED_SCENARIOS_KEY = 'byzantine:completed-scenarios'

// 이번 판에서 내 쪽지 모순이 드러난 턴 목록.
export function playerContradictionTurns<T extends Pick<TurnResult, 'turn' | 'sharing'>>(
  playerCity: number,
  history: T[],
): T[] {
  return history.filter((t) => t.sharing.some((s) => s.contradictions.some((c) => c.city === playerCity)))
}

const REGAIN_PEAK = 40
const REGAIN_LOW = 20

const isWin = (outcome: GameState['outcome']) => outcome === 'win' || outcome === 'perfect_win'

type OnOffWash = {
  city: number
  fromSus: number
  toSus: number
  washDay: number
  washSentLie: boolean
}

type OnOffHit = OnOffWash & {
  foolDay: number
  foolMatchedHint: boolean
}

type OnOffSpiked = OnOffWash & {
  spikeDay: number
  spikeSus: number
}

type RegainTrustProgress = {
  reached40: { city: number; sus: number; day: number } | null
  droppedWithoutSwitch: { city: number; fromSus: number; toSus: number; day: number } | null
  washedActive: OnOffWash | null
  washedThenSpiked: OnOffSpiked | null
  refooled: OnOffHit | null
}

type GoalStep = {
  label: string
  done: boolean
}

const betterWash = (a: OnOffWash, b: OnOffWash | null) => {
  if (!b) return true
  const aHasTime = a.washDay < TOTAL_TURNS
  const bHasTime = b.washDay < TOTAL_TURNS
  if (aHasTime !== bHasTime) return aHasTime
  return (
    Number(a.washSentLie) < Number(b.washSentLie) ||
    (a.washSentLie === b.washSentLie && a.washDay < b.washDay)
  )
}

const betterHit = (a: OnOffHit, b: OnOffHit | null) =>
  !b || betterWash(a, b) || (!betterWash(b, a) && a.foolDay < b.foolDay)

// 시나리오 '신뢰를 되찾는 법' 및 온오프 공격 꼬리표 공용 판정 (experiments/scenario_rates.py has_onoff와 동일).
// 어떤 주민의 의심도가 40 이상이 된 뒤, 연속 관측 일치 구간 안에서 쪽지를 바꿔 20 이하까지 낮추고(washed),
// 다시 40 이상이 되기 전에 거짓 쪽지를 보내 그 주민이 틀리면(refooled) 온오프가 성립한다.
export function regainTrustProgress(
  state: Pick<GameState, 'player_city' | 'roles' | 'truth'>,
  history: Pick<TurnResult, 'turn' | 'cities'>[],
): RegainTrustProgress {
  const me = state.player_city
  const citizenIds = Object.entries(state.roles)
    .filter(([, role]) => role === 'citizen')
    .map(([id]) => Number(id))
    .sort((a, b) => a - b)

  let reached40: RegainTrustProgress['reached40'] = null
  let droppedWithoutSwitch: RegainTrustProgress['droppedWithoutSwitch'] = null
  let washedActive: OnOffWash | null = null
  let washedThenSpiked: OnOffSpiked | null = null
  let refooled: OnOffHit | null = null

  for (const cityId of citizenIds) {
    const rows = history.flatMap((t) => {
      const c = t.cities.find((x) => x.city === cityId)
      const sus = c?.role === 'citizen' ? c.suspicion?.[me] : null
      if (!c || sus == null) return []
      const sent = c.received?.[me]?.claim ?? null
      return [
        {
          turn: t.turn,
          sus,
          sent,
          matchedHint: sent != null && c.hint != null && agrees(c.hint, sent),
          sentLie: sent != null && !agrees(state.truth, sent),
          correct: c.correct,
        },
      ]
    })

    const first40 = rows.find((r) => r.sus >= REGAIN_PEAK)
    if (
      first40 &&
      (!reached40 ||
        first40.turn < reached40.day ||
        (first40.turn === reached40.day && first40.sus > reached40.sus))
    ) {
      reached40 = { city: cityId, sus: first40.sus, day: first40.turn }
    }

    for (let j = 1; j < rows.length; j++) {
      if (!rows[j].matchedHint || rows[j].sus > REGAIN_LOW) continue
      let fromSus = 0
      for (let p = j - 1; p >= 0 && (rows[p].sus >= REGAIN_PEAK || (fromSus === 0 && rows[p].matchedHint)); p--) {
        if (rows[p].sus >= REGAIN_PEAK) fromSus = Math.max(fromSus, rows[p].sus)
      }
      if (fromSus < REGAIN_PEAK) continue

      let q = j
      while (q > 0 && rows[q - 1].matchedHint) q--
      const start = Math.max(1, q)
      const switched = rows.slice(start, j + 1).some((r, idx) => r.sent !== rows[start + idx - 1].sent)
      if (!switched) {
        if (!droppedWithoutSwitch || rows[j].turn < droppedWithoutSwitch.day) {
          droppedWithoutSwitch = { city: cityId, fromSus, toSus: rows[j].sus, day: rows[j].turn }
        }
        continue
      }

      const wash: OnOffWash = {
        city: cityId,
        fromSus,
        toSus: rows[j].sus,
        washDay: rows[j].turn,
        washSentLie: rows[j].sentLie,
      }

      const after = rows.slice(j + 1)
      const k = after.findIndex((r) => (r.sentLie && r.correct === false) || r.sus >= REGAIN_PEAK)
      if (k >= 0 && after[k].sentLie && after[k].correct === false) {
        const hit: OnOffHit = { ...wash, foolDay: after[k].turn, foolMatchedHint: after[k].matchedHint }
        if (betterHit(hit, refooled)) refooled = hit
        break
      }
      if (k >= 0) {
        const spiked: OnOffSpiked = { ...wash, spikeDay: after[k].turn, spikeSus: after[k].sus }
        if (betterWash(spiked, washedThenSpiked)) washedThenSpiked = spiked
      } else if (betterWash(wash, washedActive)) {
        washedActive = wash
      }
    }
  }

  return { reached40, droppedWithoutSwitch, washedActive, washedThenSpiked, refooled }
}

// 시나리오 목표 달성 판정: 신뢰를 되찾는 법은 온오프(40 이상 → 20 이하 전환 → 재기만) + 승리, 나머지는 과반 기만 승리.
export function scenarioGoalMet(
  state: Pick<GameState, 'outcome' | 'player_city' | 'roles' | 'truth'>,
  scenarioId?: string,
  history?: Pick<TurnResult, 'turn' | 'cities'>[],
): boolean {
  if (!isWin(state.outcome)) return false
  if (scenarioId === 'regain-trust') {
    return history != null && regainTrustProgress(state, history).refooled != null
  }
  return true
}

// 시나리오 HUD 단계 진행 배지 (현재 '신뢰를 되찾는 법'만 단계 배지를 쓴다).
export function scenarioGoalSteps(
  scenarioId: string,
  state: Pick<GameState, 'player_city' | 'roles' | 'truth' | 'outcome'>,
  history: Pick<TurnResult, 'turn' | 'cities'>[],
): GoalStep[] | null {
  if (scenarioId !== 'regain-trust') return null
  const p = regainTrustProgress(state, history)
  return [
    { label: '의심 40 이상', done: p.reached40 != null },
    { label: '20 이하로 낮추기', done: p.refooled != null || p.washedActive != null },
    { label: '다시 속이기', done: p.refooled != null },
    { label: '이기기', done: isWin(state.outcome) },
  ]
}

// 시나리오 '감시의 눈' 결과 한 줄 분기: 재판 패배 여부·모순 유무에 따라 한 줄을 안내한다.
export function watchfulEyeClashNote(
  state: Pick<GameState, 'player_city' | 'end_reason'>,
  history: Pick<TurnResult, 'turn' | 'sharing'>[],
): string {
  const days = playerContradictionTurns(state.player_city, history).map((t) => t.turn)
  if (state.end_reason === 'caught') {
    if (days.length > 0) {
      return `${days.join('·')}일째에 모순이 드러났고, 이후 의심도가 쌓여 재판에 걸렸어요.`
    }
    return '모순은 없었지만, 주민이 본 하늘과 다른 쪽지가 쌓여 재판에 걸렸어요.'
  }
  if (days.length > 0) {
    return `${days.join('·')}일째에 집마다 다른 말을 한 게 증명됐지만, 그것만으로 쫓겨나지는 않았어요.`
  }
  return '이번엔 모순이 한 번도 없었어요. 다시 해서 집마다 다르게 보낼 때와 비교해 보세요.'
}

// 시나리오 '고리 마을' 결과 한 줄 분기: 재판 여부와 마지막 밤 먼 집(직접 못 보내는 집)의 관측·판단 기록을 그대로 안내한다.
export function ringVillageOutcomeNote(
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth' | 'outcome' | 'end_reason'>,
  history: Pick<TurnResult, 'turn' | 'cities'>[],
): string {
  const last = history.at(-1)
  const lastDay = last?.turn ?? 0
  if (state.end_reason === 'caught') {
    return lastDay >= TOTAL_TURNS
      ? '마지막 밤 재판에 걸렸어요. 양옆 두 집의 의심도를 살피며 다시 해 보세요.'
      : '마지막 밤까지 가지 못했어요. 다시 할 때는 양옆 두 집의 의심도를 살피면서, 먼 두 집의 깃발이 어떻게 바뀌는지도 지켜보세요.'
  }
  const targets = new Set(claimTargets(state))
  const far = (last?.cities ?? [])
    .filter((c) => c.role === 'citizen' && !targets.has(c.city))
    .sort((a, b) => a.city - b.city)
  const farWrong = far.filter((c) => c.correct === false)
  const won = scenarioGoalMet(state)
  if (farWrong.length === 0) {
    const names = far.length > 0 ? formatHouseGroup(far.map((c) => c.city)) : '먼 집'
    return `마지막 밤, 직접 쪽지를 못 보낸 먼 집(${names})은 모두 진짜 날씨를 지켰어요. 양옆 두 집만으로는 3명을 채울 수 없어요.`
  }
  const hintOk = farWrong.filter((c) => c.hint === state.truth)
  const hintBad = farWrong.filter((c) => c.hint != null && c.hint !== state.truth)
  const suffix = won ? '' : ' 틀린 주민은 모두 합쳐 3명에 못 미쳤어요.'
  if (hintOk.length > 0 && hintBad.length > 0) {
    const okNames = formatHouseGroup(hintOk.map((c) => c.city))
    const badNames = formatHouseGroup(hintBad.map((c) => c.city))
    return `마지막 밤, 먼 ${okNames}은 하늘을 바로 보고도 이웃 쪽지를 따라 틀렸어요. ${badNames}은 그날 하늘도 잘못 보고 틀렸어요.${suffix}`
  }
  if (hintOk.length > 0) {
    const okNames = formatHouseGroup(hintOk.map((c) => c.city))
    return `마지막 밤, 먼 ${okNames}은 하늘을 바로 보고도 이웃 쪽지를 따라 틀렸어요.${suffix}`
  }
  const names = formatHouseGroup(farWrong.map((c) => c.city))
  const subj = farWrong.length > 1 ? '이 집들은' : '이 집은'
  return `마지막 밤, 먼 ${names}은 틀렸어요. ${subj} 그날 하늘도 잘못 봤어요.${suffix}`
}

// 목표 미달 승리 분기용: 어느 주민의 나에 대한 의심도가 60 이상인 밤에 재판이 열렸지만 지목이 갈려(accused===null) 넘어간 첫 기록.
function survivedSplitTrial(
  me: number,
  history: (Pick<TurnResult, 'turn' | 'cities'> & Partial<Pick<TurnResult, 'vote'>>)[],
): { day: number; city: number; sus: number } | null {
  for (const t of history) {
    if (!t.vote || t.vote.accused !== null) continue
    let best: { city: number; sus: number } | null = null
    for (const c of t.cities) {
      if (c.role !== 'citizen') continue
      const sus = c.suspicion?.[me] ?? 0
      if (sus < SUSPICION.threshold) continue
      if (!best || sus > best.sus || (sus === best.sus && c.city < best.city)) {
        best = { city: c.city, sus }
      }
    }
    if (best) return { day: t.turn, ...best }
  }
  return null
}

// 시나리오 '신뢰를 되찾는 법' 결과 한 줄 분기: 실제 의심도·전환·재기만·승패 기록에 따라 한 줄을 안내한다.
export function regainTrustOutcomeNote(
  state: Pick<GameState, 'player_city' | 'roles' | 'truth' | 'outcome' | 'end_reason'>,
  history: (Pick<TurnResult, 'turn' | 'cities'> & Partial<Pick<TurnResult, 'vote'>>)[],
): string {
  const last = history.at(-1)
  const lastDay = last?.turn ?? 0
  const p = regainTrustProgress(state, history)
  const anyWash = p.refooled ?? p.washedActive ?? p.washedThenSpiked
  if (state.end_reason === 'caught') {
    const baseHead = lastDay >= TOTAL_TURNS ? '마지막 밤 재판에 걸렸어요.' : '마지막 밤까지 가지 못했어요.'
    const head = p.refooled
      ? `${p.refooled.washDay}일째에 ${p.refooled.city}번 집 의심도를 낮추고 ${p.refooled.foolDay}일째에 다시 속이는 데까지는 성공했지만, ${baseHead}`
      : anyWash
        ? `${anyWash.washDay}일째에 ${anyWash.city}번 집 의심도를 낮추는 데는 성공했지만, ${baseHead}`
        : baseHead
    const maxSus = Math.max(0, ...(last?.cities ?? []).map((c) => c.suspicion?.[state.player_city] ?? 0))
    return maxSus >= SUSPICION.threshold
      ? `${head} 의심도가 60 이상이 되기 전에 본 하늘과 같은 쪽지로 낮추며 다시 해 보세요.`
      : `${head} 다른 집 의심도로 열린 재판에서 주민 과반이 나를 지목했어요. 집마다 의심도를 더 낮게 유지하며 다시 해 보세요.`
  }
  const won = isWin(state.outcome)
  const split = won && !p.refooled ? survivedSplitTrial(state.player_city, history) : null
  const splitNote = split
    ? ` ${split.day}일째에는 ${split.city}번 집 의심도가 ${split.sus}이라 재판이 열렸지만, 지목이 갈려 넘어갔어요.`
    : ''
  if (!p.reached40) {
    return won
      ? '판은 이겼지만, 의심도가 40 이상까지 오른 주민이 없었어요. 일부러 의심도를 올린 뒤 다시 낮춰 보세요.'
      : '의심도가 40 이상까지 오른 주민이 없었고, 마지막 밤 과반도 속이지 못했어요. 의심도를 올렸다 낮추며 다시 해 보세요.'
  }
  if (!anyWash) {
    if (p.droppedWithoutSwitch) {
      const d = p.droppedWithoutSwitch
      return won
        ? `판은 이겼지만, ${d.city}번 집 의심도가 ${d.fromSus}에서 ${d.toSus}까지 내려갈 때 같은 쪽지만 보냈어요.${splitNote} 쪽지를 바꿔 의심도를 낮춰 보세요.`
        : `${d.city}번 집 의심도가 ${d.fromSus}에서 ${d.toSus}까지 내려갈 때 같은 쪽지만 보냈고, 마지막 밤 과반도 속이지 못했어요. 쪽지를 바꿔 의심도를 낮춰 보세요.`
    }
    const r = p.reached40
    if (r.day >= TOTAL_TURNS) {
      return won
        ? `판은 이겼지만, 마지막 ${r.day}일째에야 ${r.city}번 집 의심도가 ${r.sus}에 닿아 낮출 날이 남지 않았어요.${splitNote}`
        : `마지막 ${r.day}일째에야 ${r.city}번 집 의심도가 ${r.sus}에 닿아 낮출 날이 남지 않았고, 마지막 밤 과반도 속이지 못했어요.`
    }
    return won
      ? `판은 이겼지만, ${r.day}일째에 의심도가 처음 40 이상(${r.sus})이 된 ${r.city}번 집을 20 이하로 낮추지는 못했어요.${splitNote}`
      : `${r.day}일째에 ${r.city}번 집 의심도가 처음 40 이상(${r.sus})이 됐지만 20 이하로 낮추지 못했고, 마지막 밤 과반도 속이지 못했어요.`
  }
  if (!p.refooled) {
    if (p.washedActive && !(p.washedActive.washDay >= TOTAL_TURNS && p.washedThenSpiked)) {
      const w = p.washedActive
      if (w.washDay >= TOTAL_TURNS) {
        return won
          ? `마지막 ${w.washDay}일째에 ${w.city}번 집 의심도를 ${w.toSus}까지 낮추고 판도 이겼지만, 그 뒤 다시 속일 날이 남지 않았어요.${splitNote}`
          : `마지막 ${w.washDay}일째에 ${w.city}번 집 의심도를 ${w.toSus}까지 낮췄지만, 그 뒤 다시 속일 날이 남지 않았고 마지막 밤 과반도 채우지 못했어요.`
      }
      return won
        ? `${w.washDay}일째에 ${w.city}번 집 의심도를 ${w.toSus}까지 낮추고 판도 이겼지만, 그 뒤 ${w.city}번 집에게 거짓 쪽지를 보낸 날 그 집이 틀린 적은 없었어요.${splitNote}`
        : `${w.washDay}일째에 ${w.city}번 집 의심도를 ${w.toSus}까지 낮췄지만, 그 뒤 ${w.city}번 집에게 거짓 쪽지를 보낸 날 그 집이 틀린 적은 없었고 마지막 밤 과반도 채우지 못했어요.`
    }
    const s = p.washedThenSpiked!
    const retry = ' 다시 할 때는 40 이상으로 올랐다면 20 이하로 낮추는 것부터 다시 하세요.'
    return won
      ? `${s.washDay}일째에 ${s.city}번 집 의심도를 ${s.toSus}까지 낮추고 판도 이겼지만, 그 집을 거짓 쪽지로 틀리게 하지 못한 채 ${s.spikeDay}일째에 의심도가 ${s.spikeSus}까지 다시 올랐어요.${splitNote}${retry}`
      : `${s.washDay}일째에 ${s.city}번 집 의심도를 ${s.toSus}까지 낮췄지만, 그 집을 거짓 쪽지로 틀리게 하지 못한 채 ${s.spikeDay}일째에 의심도가 ${s.spikeSus}까지 다시 올랐고 마지막 밤 과반도 채우지 못했어요.${retry}`
  }
  const rf = p.refooled
  if (!won) {
    return `${rf.washDay}일째에 ${rf.city}번 집 의심도를 ${rf.toSus}까지 낮춘 뒤 ${rf.foolDay}일째에 거짓 쪽지를 보냈고 그 집은 틀렸지만, 마지막 밤 과반은 속이지 못했어요.`
  }
  const winEnd = state.outcome === 'perfect_win' ? '주민 모두를 속였어요.' : '과반을 넘겼어요.'
  const misobserved = rf.foolMatchedHint
    ? ` 그날 ${rf.city}번 집은 하늘을 잘못 봐서, 거짓 쪽지가 그 집이 본 하늘과 같았어요.`
    : ''
  return `${rf.washDay}일째에 ${rf.city}번 집 의심도를 ${rf.fromSus}에서 ${rf.toSus}까지 낮춘 뒤 ${rf.foolDay}일째에 거짓 쪽지를 보냈고 그 집은 틀렸어요.${misobserved} 마지막 밤 ${winEnd}`
}

type AllyStatus = { label: string; tone: 'ok' | 'warn' | 'caught' }

function colleagueCityOf(roles: GameState['roles']): number | null {
  const entry = Object.entries(roles).find(([, role]) => role === 'colleague')
  return entry ? Number(entry[0]) : null
}

// 시나리오 '고집쟁이 동료' HUD 동료 상태 배지: 동료 무사 여부와 최신 최고 의심도(또는 재판 발각)를 표시한다.
export function stubbornAllyStatus(
  state: Pick<GameState, 'roles'>,
  history: Pick<TurnResult, 'cities' | 'vote'>[],
): AllyStatus | null {
  const city = colleagueCityOf(state.roles)
  if (city == null) return null
  if (history.some((t) => t.vote?.accused === city)) return { label: '동료 재판에 걸림', tone: 'caught' }
  const maxSus = peakSus(history.at(-1)?.cities ?? [], city)
  const label = maxSus > 0 ? `동료 무사 (지금 의심도 최고 ${maxSus})` : '동료 무사'
  return { label, tone: maxSus >= SUSPICION.threshold ? 'warn' : 'ok' }
}

// 시나리오 '고집쟁이 동료' 결과 한 줄 분기: 동료/내 재판 여부, 최고 의심도, 7일 승패 기록에 따라 한 줄을 안내한다.
export function stubbornAllyOutcomeNote(
  state: Pick<GameState, 'player_city' | 'roles' | 'outcome' | 'end_reason'>,
  history: Pick<TurnResult, 'turn' | 'cities' | 'vote'>[],
): string {
  const col = colleagueCityOf(state.roles)
  const colLabel = col != null ? `동료(${col}번 집)` : '동료'
  const last = history.at(-1)
  const lastDay = last?.turn ?? 0
  const trial = state.end_reason === 'caught' ? trialRecord(last) : null
  if (trial) {
    const when = lastDay >= TOTAL_TURNS ? '마지막 밤 재판' : '재판'
    const drawn = trial.drawn ? '(동점이라 추첨)' : ''
    const low =
      trial.sus < SUSPICION.threshold
        ? ` ${SUSPICION.threshold}에는 못 미쳤지만, 다른 집 의심도 때문에 재판이 열렸어요.`
        : ''
    const voteRule = '주민은 저마다 가장 의심하는 집을 지목하고, 과반이 모인 집이 걸려요.'
    if (trial.accused === col) {
      return `${when}에서 같은 거짓말만 되풀이한 ${colLabel}가 의심도 ${trial.sus}에서 지목돼 판이 끝났어요${drawn}.${low} 동료의 의심도는 내 쪽지로 바뀌지 않아요. ${voteRule}`
    }
    return `${when}에서 ${colLabel}가 아니라 내 집이 의심도 ${trial.sus}에서 지목됐어요${drawn}.${low} ${voteRule} 집마다 나와 동료의 의심도를 비교하며 다시 해 보세요.`
  }
  const citizens = Object.values(state.roles).filter((r) => r === 'citizen').length
  const need = majority(citizens)
  const allCities = history.flatMap((t) => t.cities)
  const colPeak = peakSus(allCities, col)
  const playerPeak = peakSus(allCities, state.player_city)
  const survivedRule =
    colPeak >= SUSPICION.threshold || playerPeak >= SUSPICION.threshold
      ? ' 주민은 저마다 가장 의심하는 집을 지목하고, 과반이 모여야 걸려요.'
      : ''
  if (!isWin(state.outcome)) {
    return colPeak >= SUSPICION.threshold
      ? `${colLabel} 의심도가 최고 ${colPeak}까지 오르는 동안 7일을 버텼지만, 마지막 밤 주민 과반(${need}명)은 속이지 못했어요.${survivedRule}`
      : `${colLabel}도 나도 7일 동안 재판에서 지목되지 않았지만, 마지막 밤 주민 과반(${need}명)은 속이지 못했어요.${survivedRule}`
  }
  const winEnd = state.outcome === 'perfect_win' ? '주민 모두를 속였어요.' : '주민 과반을 넘겼어요.'
  const survived = `동료도 무사히 남아 마지막 밤 ${winEnd}`
  if (playerPeak >= SUSPICION.threshold) {
    return `내 의심도가 최고 ${playerPeak}까지 올랐지만 재판에서 지목되지 않았고, ${survived}${survivedRule}`
  }
  if (colPeak > playerPeak) {
    return `${colLabel} 의심도가 최고 ${colPeak}까지 오르는 동안 내 의심도는 최고 ${playerPeak}이었고, ${survived}${survivedRule}`
  }
  return `${colLabel}도 나도 재판에서 지목되지 않았고, 마지막 밤 ${winEnd}`
}

// 시나리오별 결과 한 줄 분기.
export function scenarioResultNote(
  scenarioId: string,
  state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth' | 'outcome' | 'end_reason'>,
  history: Pick<TurnResult, 'turn' | 'cities' | 'sharing' | 'vote'>[],
): string | null {
  if (scenarioId === 'watchful-eye') return watchfulEyeClashNote(state, history)
  if (scenarioId === 'ring-village') return ringVillageOutcomeNote(state, history)
  if (scenarioId === 'regain-trust') return regainTrustOutcomeNote(state, history)
  if (scenarioId === 'stubborn-ally') return stubbornAllyOutcomeNote(state, history)
  return null
}

export function loadCompletedScenarios(): string[] {
  try {
    const raw = localStorage.getItem(COMPLETED_SCENARIOS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveCompletedScenario(id: string): void {
  const prev = loadCompletedScenarios()
  if (prev.includes(id)) return
  try {
    localStorage.setItem(COMPLETED_SCENARIOS_KEY, JSON.stringify([...prev, id]))
  } catch {
    // 저장소 접근 불가 환경에서는 무시한다.
  }
}
