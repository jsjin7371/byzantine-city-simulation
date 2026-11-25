import { SUSPICION, claimTargets, difficulties, majority } from '../gameApi.ts'
import type { Claim, Difficulty, GameState, Role, Truth, TurnResult } from '../gameApi.ts'

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
// 각 선과 숫자 꼬리표는 게이지·깃발·점선 이름표·광장 글자를 피하는 빈 통로에 놓는다.
type LinkGeom = { a: [number, number]; b: [number, number]; c: [number, number]; tag: [number, number] }
const SUSPICION_EDGE: Record<string, LinkGeom> = {
  '0-1': { a: [412, 494], b: [282, 462], c: [352, 466], tag: [352, 474] },
  '0-2': { a: [428, 480], b: [266, 260], c: [332, 396], tag: [344, 392] },
  '0-3': { a: [472, 480], b: [634, 260], c: [568, 396], tag: [556, 392] },
  '0-4': { a: [488, 494], b: [618, 462], c: [548, 466], tag: [548, 474] },
  '1-2': { a: [178, 412], b: [178, 252], c: [70, 344], tag: [140, 374] },
  '1-3': { a: [280, 418], b: [620, 246], c: [450, 434], tag: [420, 388] }, // 2-4와 곡선이 교차하므로 꼬리표를 좌우로 나눈다 (광장 글씨 y<=355, 도장 y>=399 사이)
  '1-4': { a: [282, 424], b: [618, 424], c: [450, 438], tag: [450, 431] },
  '2-3': { a: [282, 204], b: [618, 204], c: [450, 152], tag: [450, 178] },
  '2-4': { a: [280, 246], b: [620, 418], c: [450, 434], tag: [480, 388] },
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

// 광장 재판 투표 화살표 표시 규칙:
// - 밤 연출(투표·판정) 동안은 항상 보인다.
// - 낮 상태에서는 의심 선·튜토리얼 강조·쪽지 카드가 없을 때, 광장(도장·표 꼬리표)에 마우스나 초점이 올라간 경우에만 보인다.
export function trialArrowsVisible({
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
}): boolean {
  if (isNight) return true
  if (hasSuspicionLines || hasHighlight || hasOpenCard) return false
  return trialInspect
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

export const TAG_PIN_LABELS: Record<TagKey, string> = {
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
  tags: TagKey[]
  influence: InfluenceSummary | null
  deceived: number[]
  peaks: (number | null)[]
  pins: Record<number, ChartPin>
  majorityNeed: number
  citizenCount: number
  lesson: string
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
      ? '왜 양옆만 이어지면 불리한지'
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
    return {
      lines: [
        `양옆 이웃하고만 이야기하는 마을은, 어떤 규칙을 써도 주민이 꼭 지켜 낸다는 보장이 없어요. 그래도 저절로 무너지진 않아서, ${
          won ? '이번엔 전략이 통했어요.' : '이번엔 주민들이 끝까지 버텨 냈어요.'
        }`,
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
    const tail = won
      ? ' 수적 우위를 잘 살려 끝까지 흔들어 놓았어요.'
      : ' 그런데도 어려웠다면, 같은 거짓말만 되풀이한 동료가 먼저 의심받았기 때문이에요.'
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
      streakDay > 0 && lastWrong > 0
        ? `밤마다 한 번에 마음을 정하는 주민들의 빈틈을 파고들어, ${streakDay}일째부터 ${lastWrong}집의 마음을 돌렸어요.`
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
        '그날 두 집이 쪽지를 비교하면서 들켰어요.',
      ]
    }
    const voters = Object.entries(last.vote.ballots)
      .filter(([, to]) => to === last.vote!.accused)
      .map(([from]) => `${from}번`)
    const who = last.vote.accused === me ? '나를' : `동료 ${last.vote.accused}번을`
    return [`${day}일째 재판에서 ${voters.join(', ')} 집이 ${who} 지목해 들켰어요 (${voters.length}표, 과반 ${need}표).`]
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

  const contradictionTurns = history.filter((t) =>
    t.sharing.some((s) => s.contradictions.some((c) => c.city === me)),
  )

  // 1. 감사 회피 (완벽한 알리바이): share_mode !== 'none'이고 비교가 실제 일어난 턴 중 이중 발언 5회 이상 & 판 전체 모순 0회
  if (state.config.share_mode !== 'none' && contradictionTurns.length === 0) {
    const auditedEquivIndices = equivTurnIndices.filter((i) => history[i].sharing.length > 0)
    if (auditedEquivIndices.length >= 5) {
      const lastEquiv = history[auditedEquivIndices.at(-1)!]
      detected.push({
        tag: 'audit',
        day: lastEquiv.turn,
        text: `집마다 다른 쪽지를 ${auditedEquivIndices.length}번이나 보냈지만, 쪽지 비교에서는 한 번도 들키지 않았어요.`,
      })
    }
  }

  // 2. 온오프 공격 (의심 세탁): 의심도 >= 40일 때 진실을 보내 <= 20으로 내린 뒤, 다시 거짓을 보내 그 주민이 틀림
  const citizenIds = Object.entries(state.roles)
    .filter(([, role]) => role === 'citizen')
    .map(([id]) => Number(id))
    .sort((a, b) => a - b)

  let onoffHit: { city: number; fromSus: number; toSus: number; washDay: number; foolDay: number } | null = null
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
          sentTruth: sent != null && agrees(state.truth, sent),
          sentLie: sent != null && !agrees(state.truth, sent),
          correct: c.correct,
        },
      ]
    })
    for (let j = 1; j < rows.length; j++) {
      if (!rows[j].sentTruth || rows[j].sus > 20) continue
      let fromSus = 0
      for (let p = j - 1; p >= 0 && (rows[p].sus >= 40 || (fromSus === 0 && rows[p].sentTruth)); p--) {
        if (rows[p].sus >= 40) fromSus = Math.max(fromSus, rows[p].sus)
      }
      if (fromSus < 40) continue
      const after = rows.slice(j + 1)
      const k = after.findIndex((r) => (r.sentLie && r.correct === false) || r.sus >= 40)
      if (k >= 0 && after[k].sentLie && after[k].correct === false) {
        const hit = { city: cityId, fromSus, toSus: rows[j].sus, washDay: rows[j].turn, foolDay: after[k].turn }
        if (!onoffHit || hit.washDay < onoffHit.washDay) onoffHit = hit
        break
      }
    }
  }
  if (onoffHit) {
    const nextWhen = onoffHit.foolDay === onoffHit.washDay + 1 ? '다음 날' : `${onoffHit.foolDay}일째`
    detected.push({
      tag: 'onoff',
      day: onoffHit.washDay,
      text: `나를 의심하던 ${onoffHit.city}번 집(의심도 ${onoffHit.fromSus})에 진짜 날씨를 보내 ${onoffHit.toSus}까지 낮춘 뒤, ${nextWhen} 다시 속였어요.`,
    })
  }

  // 3. 완고한 행위자 (고집쟁이 동료): f=2 판에서 재판에 동료가 지목됨
  if (state.config.mafia_count === 2) {
    const colleagueEntry = Object.entries(state.roles).find(([, role]) => role === 'colleague')
    const colleagueCity = colleagueEntry ? Number(colleagueEntry[0]) : null
    if (colleagueCity != null) {
      const colleagueTrial = history.find((t) => t.vote?.accused === colleagueCity)
      if (colleagueTrial) {
        detected.push({
          tag: 'zealot',
          day: colleagueTrial.turn,
          text: `같은 거짓말만 되풀이한 동료(${colleagueCity}번 집) 때문에 광장 재판이 열렸어요.`,
          attachTo: colleagueTrial.vote?.caught ? 'caught' : undefined,
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
    ? `${day}일째 광장 재판에서 들켰어요`
    : state.outcome === 'perfect_win'
      ? '주민 모두를 끝까지 속였어요'
      : state.outcome === 'win'
        ? '주민 과반을 끝까지 속였어요'
        : `${day}일째에 주민 과반이 속지 않았어요`

  const tactics = detectTactics(state, history)
  const tags = tactics.map((t) => t.tag)

  const momentItems: (Moment & { kind?: 'caught' | 'knots' })[] = []

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
      text: `${crossed.turn}일째 ${top.city}번의 의심도가 ${top.suspicion![me]}까지 올라 처음으로 재판 기준 ${SUSPICION.threshold}을 넘었어요`,
    })
  }
  const knots = history.filter((t) => t.sharing.some((s) => s.contradictions.some((c) => c.city === me)))
  if (knots.length) {
    momentItems.push({
      kind: 'knots',
      day: knots.at(-1)!.turn,
      text: `쪽지 비교에서 다른 쪽지를 보냈다가 ${knots.length}번 들켰어요 (${knots.map((t) => `${t.turn}일째`).join(', ')})`,
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

  // 그래프 핀: 모순("쪽지 들킴"), 재판("재판"), 꼬리표(화면 꼬리표 이름과 동일)
  const pins: Record<number, ChartPin> = {}
  const addPin = (idx: number, label: string, danger: boolean) => {
    if (idx < 0 || idx >= history.length) return
    const cur = pins[idx] ?? { labels: [], danger: false }
    if (!cur.labels.includes(label)) cur.labels.push(label)
    if (danger) cur.danger = true
    pins[idx] = cur
  }
  history.forEach((t, i) => {
    if (t.sharing.some((s) => s.contradictions.some((c) => c.city === me))) addPin(i, '쪽지 들킴', true)
    if (t.vote) addPin(i, '재판', true)
  })
  for (const m of moments) {
    if (!m.tag || m.day == null) continue
    const idx = history.findIndex((t) => t.turn === m.day)
    if (idx >= 0) addPin(idx, TAG_PIN_LABELS[m.tag], m.tag === 'zealot' || m.tag === 'falsepos')
  }

  const lesson = knots.length
    ? '쪽지 비교로 이어진 두 집에 다른 쪽지를 보내면 모순으로 의심도가 크게 올라요. 같은 쪽지를 보내 보세요.'
    : crossed
      ? '관측과 다른 쪽지를 계속 받으면 의심도가 쌓여요. 의심도가 높은 집에는 가끔 관측에 맞는 쪽지를 보내 낮춰 보세요.'
      : state.outcome === 'loss'
        ? '들키지는 않았지만 주민 과반을 속이지 못했어요. 창문 불이 꺼진 집은 관측이 틀려 속이기 쉬워요.'
        : peaks.some((v) => v != null)
          ? '의심도가 재판 기준을 넘지 않게 조절하며 끝까지 버텼어요.'
          : '다수결 주민은 의심하지 않아요. 눈치 주민은 의심도가 쌓이면 재판을 열어요.'

  return {
    headline,
    chips: resultVillageChips(state),
    baseline: resultBaseline(state, history),
    decisive: resultDecisive(state, history),
    moments,
    tags,
    influence: resultInfluence(state, history),
    deceived,
    peaks,
    pins,
    majorityNeed: need,
    citizenCount: citizens,
    lesson,
  }
}

export type ChartPinLayout = {
  index: number
  cx: number
  textX: number
  lane: number
  width: number
  text: string
  danger: boolean
}

function estimatePinWidth(text: string): number {
  let w = 0
  for (const ch of text) {
    if (/[\u1100-\uFFFF]/.test(ch)) w += 15
    else if (/[ ,.·]/.test(ch)) w += 6.5
    else w += 9
  }
  return w
}

// 결과 그래프 핀 배치:
// 1) 짧은 라벨을 아래 줄(lane 0)에 두고 긴 라벨을 위 줄에 올려 다른 핀의 수직 점선이 라벨 글자를 가로지르지 않게 한다.
// 2) 같은 줄의 라벨끼리 겹치지 않게 올리고, 인접한 긴 라벨이 아래 줄에 걸리면 아래 줄 글자를 옆으로 밀어 점선과 떼어 놓는다.
export function layoutChartPins(
  pins: Record<number, ChartPin>,
  { x0, step, bw }: { x0: number; step: number; bw: number },
): { items: ChartPinLayout[]; laneCount: number } {
  const entries = Object.entries(pins)
    .map(([k, pin]) => {
      const index = Number(k)
      const text = pin.labels.join(', ')
      const cx = x0 + index * step + bw / 2
      return { index, cx, text, width: estimatePinWidth(text), danger: pin.danger }
    })
    .sort((a, b) => a.width - b.width || a.index - b.index)

  const gap = 10
  const stemPad = 8
  const placed: ChartPinLayout[] = []

  for (const entry of entries) {
    const half = entry.width / 2
    let lane = 0
    for (const p of placed) {
      if (p.cx >= entry.cx - half - stemPad && p.cx <= entry.cx + half + stemPad) {
        lane = Math.max(lane, p.lane + 1)
      }
    }
    while (
      placed.some(
        (p) =>
          p.lane === lane &&
          entry.cx - half - gap < p.textX + p.width / 2 &&
          entry.cx + half + gap > p.textX - p.width / 2,
      )
    ) {
      lane++
    }
    for (const p of placed) {
      if (p.lane >= lane) continue
      const pHalf = p.width / 2
      if (entry.cx >= p.textX - pHalf - stemPad && entry.cx <= p.textX + pHalf + stemPad) {
        const candidate = p.cx < entry.cx ? entry.cx - stemPad - pHalf : entry.cx + stemPad + pHalf
        const keepsOwnStem = p.cx >= candidate - pHalf + 4 && p.cx <= candidate + pHalf - 4
        const collidesSameLane = placed.some(
          (other) =>
            other !== p &&
            other.lane === p.lane &&
            candidate - pHalf - gap < other.textX + other.width / 2 &&
            candidate + pHalf + gap > other.textX - other.width / 2,
        )
        if (keepsOwnStem && !collidesSameLane) {
          p.textX = candidate
        }
      }
    }
    placed.push({ ...entry, textX: entry.cx, lane })
  }

  placed.sort((a, b) => a.index - b.index)
  const laneCount = placed.reduce((max, p) => Math.max(max, p.lane + 1), 0)
  return { items: placed, laneCount }
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
    text: '주민은 관측 한 표와 받은 쪽지들로 결정을 내려요. 의심하는 집 쪽지일수록 덜 믿어서 저울에 적게 반영돼요. 마을 이야기 위에서 오늘 밤 저울을 볼 수 있어요.',
  },
  {
    highlight: 'share',
    text: '점선으로 이어진 두 집은 오늘 밤 내 쪽지를 서로 비교해요(쪽지 비교). 해당하는 두 집에 다른 쪽지를 보내면 모순이 생겨 의심도가 크게 올라요.',
  },
  {
    highlight: 'submit',
    wait: 'turn',
    text: '다 골랐으면 밤으로 넘겨 보세요.',
  },
  {
    highlight: 'flags',
    text: '밤에 표가 쌓여 더 많은 쪽으로 깃발(대피·잔류)이 섰어요. 이 깃발은 다음 날 다른 주민에게 보내는 쪽지가 돼요.',
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
    { key: 'easy', waryBotWinPct: 32, majorityBotWinPct: 87 },
    { key: 'normal', waryBotWinPct: 10, majorityBotWinPct: 75 },
    { key: 'hard', waryBotWinPct: 1, majorityBotWinPct: 48 },
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
