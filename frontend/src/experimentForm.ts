// 전체 도시 수는 서버 설정이다. 화면의 안내 문구·네트워크·입력 범위가 이 값을 함께 쓴다.
export const CITY_COUNT = 5
export const NAME_MAX_LENGTH = 50
export const SEED_MAX = 2147483647
export const seedMaxText = SEED_MAX.toLocaleString('en-US')

// 입력 항목의 라벨·기본값·범위·단위는 여기서만 정의한다. 설정·결과·비교 화면이 같은 값을 쓴다.
export const countFields = [
  { name: 'turns', label: '턴 수', value: '10', hint: '1–20턴 · 정수', unit: '턴', min: 1, max: 20, integer: true },
  { name: 'byzantine_count', label: '비잔틴 도시 수', value: '1', hint: `전체 ${CITY_COUNT}개 중 0–${CITY_COUNT}개 · 정수`, unit: `/ ${CITY_COUNT}개`, min: 0, max: CITY_COUNT, integer: true },
] as const
// 화면에서는 백분율(0–100)로 입력받는 확률 항목이다.
export const rateFields = [
  { name: 'sensor_error', label: '센서 오류율', value: '10', hint: '0–100% · 소수 입력 가능', unit: '%', min: 0, max: 100, integer: false, help: 'God의 힌트가 실제 상태와 다를 확률' },
  { name: 'drop_rate', label: '메시지 누락률', value: '0', hint: '0–100% · 소수 입력 가능', unit: '%', min: 0, max: 100, integer: false, help: '이웃에게 보낸 메시지가 사라질 확률' },
  { name: 'flip_rate', label: '메시지 조작률', value: '0', hint: '0–100% · 소수 입력 가능', unit: '%', min: 0, max: 100, integer: false, help: '이웃에게 보낸 메시지의 판단이 뒤집힐 확률' },
] as const
export const settingFields = [...countFields, ...rateFields] as const

export type ExperimentField = 'name' | 'seed' | (typeof settingFields)[number]['name']
export type ExperimentDraft = Record<ExperimentField, string>
export type FormErrors = Partial<Record<ExperimentField, string>>

export const fieldLabels = {
  name: '실험 이름',
  seed: 'Seed',
  ...Object.fromEntries(settingFields.map((field) => [field.name, field.label])),
} as Record<ExperimentField, string>
export const isRateField = (name: string) => rateFields.some((field) => field.name === name)

// 입력 중 빈 문자열을 유지한다. API에 보낼 때 숫자로 변환한다.
export function createExperimentDraft(): ExperimentDraft {
  return {
    name: '',
    seed: '',
    ...Object.fromEntries(settingFields.map((field) => [field.name, field.value])),
  } as ExperimentDraft
}

export function validateExperimentDraft(draft: ExperimentDraft): FormErrors {
  const errors: FormErrors = {}
  // 이모지도 백엔드(Python)와 같은 유니코드 코드 포인트 단위로 세어 길이를 검사한다.
  if (Array.from(draft.name).length > NAME_MAX_LENGTH) errors.name = `실험 이름은 ${NAME_MAX_LENGTH}자 이하로 입력해 주세요.`
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
  if (seed && (!/^\d+$/.test(seed) || !Number.isSafeInteger(Number(seed)) || Number(seed) > SEED_MAX)) {
    errors.seed = `Seed는 0–${seedMaxText} 범위의 정수로 입력하거나 비워 주세요.`
  }
  return errors
}
