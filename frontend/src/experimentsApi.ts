import type { ExperimentDraft } from './experimentForm'

export type ExperimentConfig = {
  turns: number; byzantine_count: number; sensor_error: number; drop_rate: number; flip_rate: number; seed: number | null
}

export type Experiment = {
  id: number
  name: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  config: ExperimentConfig
  completed_turns: number
  mean_accuracy: number | null
  error: string | null
}

// 화면에서는 백분율(10%)을 입력받고, API에는 확률(0.1)을 보낸다.
// 검증된 입력을 변환하며, 전체 도시 수 5개는 서버 설정이므로 요청에 포함하지 않는다.
export function experimentPayload(draft: ExperimentDraft) {
  return {
    name: draft.name.trim() || null,
    turns: Number(draft.turns),
    byzantine_count: Number(draft.byzantine_count),
    sensor_error: Number(draft.sensor_error) / 100,
    drop_rate: Number(draft.drop_rate) / 100,
    flip_rate: Number(draft.flip_rate) / 100,
    // seed 0도 유효하므로 빈 문자열만 null(랜덤)로 변환한다.
    seed: draft.seed.trim() === '' ? null : Number(draft.seed),
  }
}

// 백엔드의 detail은 문자열 또는 FastAPI 검증 오류 배열(422)이므로 둘 다 표시한다.
export function apiErrorMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => {
      if (!item || typeof item.msg !== 'string') return []
      const field = Array.isArray(item.loc) ? item.loc.filter((part: unknown) => part !== 'body').join('.') : ''
      return [field ? `${field}: ${item.msg}` : item.msg]
    })
    if (messages.length) return messages.join(' / ')
  }
  return '서버가 요청을 처리하지 못했습니다.'
}

export class HttpError extends Error {
  status: number
  detail: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

async function request(url: string, options: RequestInit) {
  let response: Response
  try {
    // 화면 전환에 의한 취소와 HTTP 요청당 15초 제한을 함께 적용한다.
    // 이 제한은 실험 전체 실행 시간이나 백엔드의 God 대기 시간(120초)과 별개다.
    response = await fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
  } catch {
    throw new Error('서버 응답을 확인하지 못했습니다. 백엔드 실행 상태와 연결을 확인해 주세요.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new HttpError(response.status, data ? apiErrorMessage(data.detail) : `서버 연결 오류 (${response.status})`, data?.detail)
  return data
}

// 화면에 필요한 자료형·상태만 검사한다. 설정 범위와 업무 규칙은 백엔드에서 검증한다.
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const nullableText = (value: unknown) => value === null || typeof value === 'string'
const truth = (value: unknown) => value === 'safe' || value === 'danger'
const decision = (value: unknown) => value === 'stay' || value === 'evacuate'
const sendStatus = (value: unknown) => value === 'normal' || value === 'dropped' || value === 'flipped'
function validConfig(value: unknown): value is ExperimentConfig {
  return record(value) && integer(value.turns) && integer(value.byzantine_count)
    && numeric(value.sensor_error) && numeric(value.drop_rate) && numeric(value.flip_rate)
    && (value.seed === null || integer(value.seed))
}
function validExperiment(value: unknown): value is Experiment {
  return record(value) && integer(value.id) && nullableText(value.name)
    && ['pending', 'running', 'completed', 'failed'].includes(String(value.status))
    && validConfig(value.config) && integer(value.completed_turns)
    && (value.mean_accuracy === null || numeric(value.mean_accuracy)) && nullableText(value.error)
}
function validSummary(value: unknown): value is TurnSummary {
  return record(value) && integer(value.turn) && truth(value.truth) && numeric(value.accuracy)
}
function validSummaries(value: unknown): value is TurnSummary[] {
  return Array.isArray(value) && value.every(validSummary)
}
function validCity(value: unknown): value is CityResult {
  return record(value) && integer(value.city) && typeof value.is_byzantine === 'boolean'
    && typeof value.correct === 'boolean' && truth(value.hint) && decision(value.decision)
    && (value.from_left === null || decision(value.from_left)) && (value.from_right === null || decision(value.from_right))
    && sendStatus(value.to_left) && sendStatus(value.to_right)
}
function validDetail(value: unknown): value is TurnDetail {
  if (!record(value)) return false
  return integer(value.experiment_id) && validSummary({ turn: value.turn, truth: value.truth, accuracy: value.accuracy })
    && Array.isArray(value.cities) && value.cities.every(validCity)
}
function validComparison(value: unknown): value is ComparisonExperiment {
  return record(value) && integer(value.id) && nullableText(value.name) && validConfig(value.config)
    && (value.mean_accuracy === null || numeric(value.mean_accuracy)) && validSummaries(value.accuracy)
}

async function requestExperiment(url: string, options: RequestInit): Promise<Experiment> {
  const data = await request(url, options)
  if (!validExperiment(data)) throw new Error('서버 응답 형식이 올바르지 않습니다.')
  return data
}

// 프론트는 항상 백엔드 API만 호출한다. Mock/실제 엔진 선택은 백엔드 GOD_MODE가 담당한다.
// 개발 중 /api 접두사는 Vite 프록시에서 제거되어 백엔드로 전달된다.
export async function createExperiment(draft: ExperimentDraft, signal: AbortSignal) {
  try {
    return await requestExperiment('/api/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(experimentPayload(draft)), signal })
  } catch (cause) {
    // 409(실행 중)·422(입력 오류)는 생성 전 거절이므로 서버 안내만 표시한다.
    if (cause instanceof HttpError && [409, 422].includes(cause.status)) throw cause
    // 연결 끊김·서버 오류·잘못된 성공 응답에서는 생성 여부를 확정할 수 없다.
    // 중복 생성을 피하도록 안내하고 POST를 자동 재전송하지 않는다.
    const message = cause instanceof Error ? cause.message : '실행 요청에 실패했습니다.'
    throw new Error(`${message} 실험이 생성되었을 수 있으므로 실험 목록을 확인한 뒤 다시 실행해 주세요.`)
  }
}

export async function getExperiment(id: number, signal: AbortSignal) {
  const experiment = await requestExperiment(`/api/experiments/${id}`, { signal })
  // 다른 실험의 응답으로 현재 진행률이나 상태가 덮어써지는 것을 방지한다.
  if (experiment.id !== id) throw new Error('서버 응답의 실험 ID가 요청과 다릅니다.')
  return experiment
}

export type TurnSummary = { turn: number; truth: 'danger' | 'safe'; accuracy: number }
export type CityResult = {
  city: number; is_byzantine: boolean; hint: 'danger' | 'safe'; correct: boolean
  decision: 'evacuate' | 'stay'
  from_left: 'evacuate' | 'stay' | null; from_right: 'evacuate' | 'stay' | null
  to_left: 'normal' | 'dropped' | 'flipped'; to_right: 'normal' | 'dropped' | 'flipped'
}
export type TurnList = { experiment_id: number; turns: TurnSummary[] }
export type TurnDetail = TurnSummary & { experiment_id: number; cities: CityResult[] }

export async function listExperiments(offset: number, signal: AbortSignal): Promise<Experiment[]> {
  const data = await request(`/api/experiments?limit=50&offset=${offset}`, { signal })
  if (!Array.isArray(data) || !data.every(validExperiment)) throw new Error('실험 목록 응답 형식이 올바르지 않습니다.')
  return data
}
export async function listTurns(id: number, signal: AbortSignal): Promise<TurnList> {
  const data = await request(`/api/experiments/${id}/turns`, { signal })
  if (data?.experiment_id !== id || !validSummaries(data.turns)) throw new Error('턴 목록 응답 형식이 올바르지 않습니다.')
  return data
}
export async function getTurn(id: number, turn: number, signal: AbortSignal): Promise<TurnDetail> {
  const data = await request(`/api/experiments/${id}/turns/${turn}`, { signal })
  if (!validDetail(data) || data.experiment_id !== id || data.turn !== turn) throw new Error('도시 결과 응답 형식이 올바르지 않습니다.')
  return data
}

export type ComparisonExperiment = {
  id: number; name: string | null; config: ExperimentConfig; mean_accuracy: number | null; accuracy: TurnSummary[]
}

export async function compareExperiments(first: number, second: number, signal: AbortSignal): Promise<ComparisonExperiment[]> {
  // 화면에서 막더라도 호출부에서 한 번 더 검사한다. 백엔드는 서로 다른 ID 2~5개를 요구한다.
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first <= 0 || second <= 0 || first === second) {
    throw new Error('서로 다른 두 실험을 선택해 주세요.')
  }
  // ids=1,2가 아니라 같은 쿼리 키를 반복하는 백엔드 규격을 사용한다.
  const query = new URLSearchParams([['ids', String(first)], ['ids', String(second)]])
  const data = await request(`/api/experiments/compare?${query}`, { signal })
  const rows: ComparisonExperiment[] = data?.experiments
  if (!Array.isArray(rows) || rows.length !== 2 || ![first, second].every((id) => rows.filter((row) => row?.id === id).length === 1) || rows.some((row) => !validComparison(row))) {
    throw new Error('실험 비교 응답 형식이 올바르지 않습니다.')
  }
  // 응답 배열의 순서가 달라도 화면 A/B는 사용자가 선택한 ID에 맞춰 표시한다.
  return [rows.find((row) => row.id === first)!, rows.find((row) => row.id === second)!]
}
