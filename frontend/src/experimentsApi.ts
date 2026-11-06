import type { ExperimentDraft } from './experimentForm'

export type Experiment = {
  id: number
  name: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  config: { turns: number }
  completed_turns: number
  mean_accuracy: number | null
  error: string | null
}

export function experimentPayload(draft: ExperimentDraft) {
  return {
    name: draft.name.trim() || null,
    turns: Number(draft.turns),
    byzantine_count: Number(draft.byzantine_count),
    sensor_error: Number(draft.sensor_error) / 100,
    drop_rate: Number(draft.drop_rate) / 100,
    flip_rate: Number(draft.flip_rate) / 100,
    seed: draft.seed.trim() === '' ? null : Number(draft.seed),
  }
}

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

async function request(url: string, options: RequestInit) {
  let response: Response
  try {
    response = await fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
  } catch {
    throw new Error('서버 응답을 확인하지 못했습니다. 백엔드 실행 상태와 연결을 확인해 주세요.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data ? apiErrorMessage(data.detail) : `서버 연결 오류 (${response.status})`)
  return data
}

async function requestExperiment(url: string, options: RequestInit): Promise<Experiment> {
  const data = await request(url, options)
  if (!data || !Number.isInteger(data.id) || !['pending', 'running', 'completed', 'failed'].includes(data.status) || !Number.isInteger(data.config?.turns) || !Number.isInteger(data.completed_turns)) {
    throw new Error('서버 응답 형식이 올바르지 않습니다.')
  }
  return data as Experiment
}

export function createExperiment(draft: ExperimentDraft, signal: AbortSignal) {
  return requestExperiment('/api/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(experimentPayload(draft)), signal })
}

export function getExperiment(id: number, signal: AbortSignal) {
  return requestExperiment(`/api/experiments/${id}`, { signal })
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
  if (!Array.isArray(data)) throw new Error('실험 목록 응답 형식이 올바르지 않습니다.')
  return data
}
export async function listTurns(id: number, signal: AbortSignal): Promise<TurnList> {
  const data = await request(`/api/experiments/${id}/turns`, { signal })
  if (data?.experiment_id !== id || !Array.isArray(data.turns)) throw new Error('턴 목록 응답 형식이 올바르지 않습니다.')
  return data
}
export async function getTurn(id: number, turn: number, signal: AbortSignal): Promise<TurnDetail> {
  const data = await request(`/api/experiments/${id}/turns/${turn}`, { signal })
  if (data?.experiment_id !== id || data?.turn !== turn || !Array.isArray(data.cities)) throw new Error('도시 결과 응답 형식이 올바르지 않습니다.')
  return data
}
