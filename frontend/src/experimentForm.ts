export const settingFields = [
  { name: 'turns', label: '턴 수', value: '10', hint: '1–20턴 · 정수', unit: '턴', min: 1, max: 20, integer: true },
  { name: 'byzantine_count', label: '비잔틴 도시 수', value: '1', hint: '전체 5개 중 0–5개 · 정수', unit: '개', min: 0, max: 5, integer: true },
  { name: 'sensor_error', label: '센서 오류율', value: '10', hint: '0–100% · 소수 입력 가능', unit: '%', min: 0, max: 100, integer: false },
  { name: 'drop_rate', label: '메시지 누락률', value: '0', hint: '0–100% · 소수 입력 가능', unit: '%', min: 0, max: 100, integer: false },
  { name: 'flip_rate', label: '메시지 조작률', value: '0', hint: '0–100% · 소수 입력 가능', unit: '%', min: 0, max: 100, integer: false },
] as const

export type ExperimentField = 'name' | 'seed' | (typeof settingFields)[number]['name']
export type ExperimentDraft = Record<ExperimentField, string>
export type FormErrors = Partial<Record<ExperimentField, string>>

// 입력 중 빈 문자열을 유지한다. API에 보낼 때 숫자로 변환한다.
export function createExperimentDraft(): ExperimentDraft {
  return { name: '', turns: '10', byzantine_count: '1', sensor_error: '10', drop_rate: '0', flip_rate: '0', seed: '' }
}

export function validateExperimentDraft(draft: ExperimentDraft): FormErrors {
  const errors: FormErrors = {}
  // 이모지도 백엔드(Python)와 같은 유니코드 코드 포인트 단위로 세어 50자를 검사한다.
  if (Array.from(draft.name).length > 50) errors.name = '실험 이름은 50자 이하로 입력해 주세요.'
  for (const field of settingFields) {
    const raw = draft[field.name].trim()
    // 빈 값이 Number('')로 0이 되거나, 16진수 등 의도하지 않은 표기가 허용되지 않게 형식부터 검사한다.
    const pattern = field.integer ? /^\d+$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/
    if (!raw) {
      errors[field.name] = `${field.label}을(를) 입력해 주세요.`
    } else if (!pattern.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) < field.min || Number(raw) > field.max) {
      errors[field.name] = `${field.min}–${field.max} 범위의 ${field.integer ? '정수' : '숫자'}를 입력해 주세요.`
    }
  }
  const seed = draft.seed.trim()
  if (seed && (!/^\d+$/.test(seed) || !Number.isSafeInteger(Number(seed)) || Number(seed) > 2147483647)) {
    errors.seed = 'Seed는 0–2,147,483,647 범위의 정수로 입력하거나 비워 주세요.'
  }
  return errors
}
