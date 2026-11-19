import type { ExperimentConfig } from '../experimentsApi'
import { CITY_COUNT, fieldLabels } from '../experimentForm'
import { configValueText } from './results/resultLabels'

// 결과 탐색의 상세 설정에 보여주는 항목과 순서.
const fields: { key: keyof ExperimentConfig; label: string }[] = [
  { key: 'turns', label: fieldLabels.turns },
  { key: 'sensor_error', label: fieldLabels.sensor_error },
  { key: 'drop_rate', label: fieldLabels.drop_rate },
  { key: 'flip_rate', label: fieldLabels.flip_rate },
  { key: 'byzantine_count', label: `${fieldLabels.byzantine_count} (${CITY_COUNT}개 중)` },
  { key: 'seed', label: fieldLabels.seed },
]

export function ExperimentConfigValues({ config }: { config?: ExperimentConfig }) {
  // 실험을 아직 선택하지 않았으면 값 대신 '—'를 표시한다.
  return (
    <dl className="config-values">
      {fields.map(({ key, label }) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{config ? configValueText(config, key) : '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
