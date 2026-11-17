import type { ExperimentConfig } from '../experimentsApi'

const labels = ['턴 수', '센서 오류율', '메시지 누락률', '메시지 조작률', '비잔틴 도시 수 (5개 중)', 'Seed']
// API의 확률(0~1)을 입력 화면과 같은 백분율로 표시한다.
const percent = (value: number) => `${Number((value * 100).toFixed(2))}%`

export function ExperimentConfigValues({ config }: { config?: ExperimentConfig }) {
  // 결과 탐색과 비교 화면에서 같은 항목 순서와 표시 형식을 사용한다.
  // 비교할 실험을 아직 선택하지 않았으면 빈 배열로 두고 아래에서 '—'를 표시한다.
  const values = config ? [
    String(config.turns),
    percent(config.sensor_error),
    percent(config.drop_rate),
    percent(config.flip_rate),
    String(config.byzantine_count),
    // seed 0도 유효하므로 null일 때만 '랜덤'으로 표시한다.
    config.seed === null ? '랜덤' : String(config.seed),
  ] : []

  return (
    <dl className="config-values">
      {labels.map((label, index) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{values[index] ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
