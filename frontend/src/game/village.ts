import { claimTargets } from '../gameApi.ts'
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

// 마을 이야기 (명세 3번): 턴 결과를 규칙 대사로 바꾼다. LLM 없이 방향_제안.html 3절 템플릿.
export type Line =
  | { kind: 'when'; text: string }
  | { kind: 'say'; who: number; text: string }
  | { kind: 'event'; text: string }

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
  const lines: Line[] = [{ kind: 'when', text: `${result.turn}일째 밤${met ? `, ${met}이 만났다` : ''}` }]

  // 모순 발견: 만난 두 주민이 내가 한 말을 맞춰 봤다
  for (const { pair, contradictions } of result.sharing) {
    const told = contradictions.find((c) => c.city === me)?.told
    if (!told) continue
    const [a, b] = pair
    lines.push({
      kind: 'say',
      who: a,
      text: `잠깐, ${me}번이 나한텐 ${said[told[a].claim]}라더니 ${b}번한텐 ${said[told[b].claim]}라고 했대?`,
    })
  }

  for (const c of result.cities) {
    if (c.role !== 'citizen') continue
    const mine = c.received?.[me]
    if (ai && c.reason) lines.push({ kind: 'say', who: c.city, text: c.reason })
    else if (mine && c.hint)
      lines.push({
        kind: 'say',
        who: c.city,
        text: agrees(c.hint, mine.claim)
          ? `그치, 나도 ${saw[c.hint]}이라고 봤어`
          : `음… 내가 본 건 ${saw[c.hint]}인데, ${me}번은 ${said[mine.claim]}래`,
      })
    if (!wary || !c.suspicion) continue
    const onMe = c.suspicion[me] ?? 0
    if (onMe >= 40 && onMe < 60)
      lines.push({ kind: 'say', who: c.city, text: `${me}번 좀 수상한데. 한 번만 더 그러면 재판이야` })
    const [top, value] = Object.entries(c.suspicion).sort((x, y) => y[1] - x[1])[0] ?? []
    if (top && value > 0 && state.roles[top] === 'citizen')
      lines.push({ kind: 'event', text: `${c.city}번이 ${top}번을 의심하고 있다` })
  }

  if (result.vote) {
    lines.push({ kind: 'when', text: '광장 재판' })
    for (const [from, to] of Object.entries(result.vote.ballots))
      lines.push({ kind: 'say', who: Number(from), text: `나는 ${to}번을 지목한다` })
    const a = result.vote.accused
    lines.push({
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
