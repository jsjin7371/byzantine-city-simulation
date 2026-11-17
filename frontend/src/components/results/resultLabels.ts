import type { ExperimentConfig } from '../../experimentsApi'
import { isRateField } from '../../experimentForm'

// API의 0~1 값을 백분율 문구로 바꾼다. 기본은 소수 둘째 자리까지 반올림한다.
export const percent = (value: number, digits = 2) =>
  `${Number((value * 100).toFixed(digits))}%`
// 평균 정확도가 아직 없으면(실행 전·실패) '—'로 표시한다.
export const meanPercent = (value: number | null | undefined) =>
  value == null ? '—' : percent(value)
export const SEED_RANDOM_TEXT = '무작위'
export const UNNAMED_EXPERIMENT = '이름 없는 실험'
// 결과 탐색과 비교 화면이 설정값을 같은 형식으로 보여준다.
// 확률(0~1)은 입력 화면과 같은 백분율로, seed는 0도 유효하므로 null일 때만 무작위로 표시한다.
export function configValueText(config: ExperimentConfig, key: keyof ExperimentConfig) {
  const value = config[key]
  if (value === null) return SEED_RANDOM_TEXT
  return isRateField(key) ? percent(value) : String(value)
}
export const truths = { danger: '위험', safe: '안전' }
export const decisions = { evacuate: '대피', stay: '잔류' }
export const sends = { normal: '정상', dropped: '누락', flipped: '조작' }
export const statuses = { pending: '준비 중', running: '진행 중', completed: '완료', failed: '실패' }
export const received = (value: keyof typeof decisions | null) => value === null ? '없음' : decisions[value]
// 값의 의미를 나타내는 색 이름. 결과 표와 비교 표가 같은 색을 쓴다(CSS의 data-tone).
export const truthTones = { danger: 'error', safe: 'success' }
export const sendTones: Record<keyof typeof sends, string | undefined> = {
  normal: undefined,
  dropped: 'dropped',
  flipped: 'flipped',
}
