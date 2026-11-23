import { request } from './experimentsApi.ts'

// docs/spec.md 7절(마피아 게임) 형식을 그대로 쓴다. 도시 id는 JSON 키일 때 문자열, 값일 때 정수.
export type Truth = 'danger' | 'safe'
export type Claim = 'evacuate' | 'stay'
export type Role = 'player' | 'colleague' | 'citizen'
export type Message = { claim: Claim; note: string }
export type Outcome = 'perfect_win' | 'win' | 'loss'

export type GameConfig = {
  connection: 'all' | 'ring'
  citizen_type: 'majority' | 'wary' | 'ai'
  memory: 'turn' | 'recent' | 'full'
  share_mode: 'all' | 'pairs' | 'none'
  share_pairs: number
  mafia_count: 1 | 2
  player: 'human' | 'bot'
  sensor_error: number
  seed: number | null
}

export type GameState = {
  game_id: number
  config: GameConfig
  truth: Truth
  roles: Record<string, Role>
  player_city: number
  turn: number
  game_over: boolean
  outcome: Outcome | null
  end_reason: 'caught' | 'turns_done' | null
  next_hints: Record<string, Truth> | null
  next_share_pairs?: [number, number][] | null
  bot_win_rate?: number | null
}

export type CityTurn = {
  city: number
  role: Role
  hint: Truth | null
  received: Record<string, Message | null> | null
  decision: Claim | null
  correct: boolean | null
  suspicion: Record<string, number> | null
  reason: string | null
}

export type TurnResult = {
  game_id: number
  turn: number
  truth: Truth
  accuracy: number
  cities: CityTurn[]
  sharing: { pair: [number, number]; contradictions: { city: number; told: Record<string, Message> }[] }[]
  vote: { ballots: Record<string, number>; accused: number | null; caught: boolean } | null
  game_over: boolean
  outcome: Outcome | null
  end_reason: 'caught' | 'turns_done' | null
  next_hints: Record<string, Truth> | null
  next_share_pairs?: [number, number][] | null
}

export const TOTAL_TURNS = 15
// 7.6 의심도 규칙 (눈치 시민). engine/city/logic.py와 같은 값.
export const SUSPICION = { agree: -20, disagree: 20, contradiction: 20, threshold: 60 }

// 시민 과반 (4명이면 3, 3명이면 2). 15턴에 이만큼 오답이면 승리.
export const majority = (citizens: number) => Math.floor(citizens / 2) + 1

// 7.2 난이도 표. 나머지 값은 백엔드 기본값을 쓴다.
export const difficulties = {
  easy: { label: '쉬움', mafia_count: 1, sensor_error: 0.48, citizen_type: 'wary' },
  normal: { label: '보통', mafia_count: 1, sensor_error: 0.4, citizen_type: 'wary' },
  hard: { label: '어려움', mafia_count: 1, sensor_error: 0.3, citizen_type: 'wary' },
} as const
export type Difficulty = keyof typeof difficulties

export type CitizenType = GameConfig['citizen_type']
export const citizenTypes: Record<CitizenType, { label: string }> = {
  majority: { label: '다수결' },
  wary: { label: '눈치' },
  ai: { label: 'AI' },
}

// 플레이어가 주장을 보내야 하는 시민: 플레이어와 이웃인 시민 전부 (7.8 claims 키).
export function claimTargets(state: Pick<GameState, 'config' | 'roles' | 'player_city'>): number[] {
  const p = state.player_city
  const ring = [((p + 3) % 5) + 1, (p % 5) + 1]
  return [1, 2, 3, 4, 5].filter(
    (city) =>
      state.roles[city] === 'citizen' && (state.config.connection === 'all' || ring.includes(city)),
  )
}

// 처음 고르는 값은 정답의 반대(기준 봇 전략). 플레이어가 시민마다 바꾼다.
export function defaultClaims(state: Pick<GameState, 'config' | 'roles' | 'player_city' | 'truth'>) {
  const lie: Claim = state.truth === 'danger' ? 'stay' : 'evacuate'
  return Object.fromEntries(claimTargets(state).map((city) => [String(city), lie])) as Record<
    string,
    Claim
  >
}

export const outcomeLabels: Record<Outcome, string> = {
  perfect_win: '완승',
  win: '승리',
  loss: '패배',
}
export const endReasonLabels = { caught: '재판으로 발각', turns_done: `${TOTAL_TURNS}턴 종료` }

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function validState(data: unknown, id?: number): data is GameState {
  return (
    record(data) &&
    Number.isSafeInteger(data.game_id) &&
    (id === undefined || data.game_id === id) &&
    record(data.config) &&
    record(data.roles) &&
    Number.isSafeInteger(data.player_city) &&
    Number.isSafeInteger(data.turn)
  )
}

export async function createGame(
  difficulty: Difficulty,
  citizenType: CitizenType = 'wary',
  signal?: AbortSignal): Promise<GameState> {
  const { label: _label, ...preset } = difficulties[difficulty]
  const payload = { ...preset, citizen_type: citizenType }
  const data = await request('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  if (!validState(data)) throw new Error('게임 응답 형식이 올바르지 않습니다.')
  return data
}

export async function getGame(id: number, signal?: AbortSignal): Promise<GameState> {
  const data = await request(`/api/games/${id}`, { signal })
  if (!validState(data, id)) throw new Error('게임 응답 형식이 올바르지 않습니다.')
  return data
}

export async function playTurn(
  id: number,
  turn: number,
  claims: Record<string, Claim>,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const body = {
    turn,
    claims: Object.fromEntries(
      Object.entries(claims).map(([city, claim]) => [city, { claim, note: '' }]),
    ),
  }
  const data = await request(`/api/games/${id}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!record(data) || data.game_id !== id || data.turn !== turn || !Array.isArray(data.cities))
    throw new Error('턴 결과 응답 형식이 올바르지 않습니다.')
  return data as TurnResult
}
