import type { ComparisonExperiment, ExperimentConfig } from '../../experimentsApi'
import { percent } from '../results/resultLabels'

const configFields: [keyof ExperimentConfig, string][] = [['turns','턴 수'],['byzantine_count','비잔틴 도시 수'],['sensor_error','센서 오류율'],['drop_rate','메시지 누락률'],['flip_rate','메시지 조작률'],['seed','Seed']]
const configValue = (config: ExperimentConfig, key: keyof ExperimentConfig) => ['sensor_error','drop_rate','flip_rate'].includes(key) ? percent(config[key]!) : config[key] === null ? '무작위' : String(config[key])

export function CompareConditions({ visible }: { visible: ComparisonExperiment[] | null }) {
  const delta = visible?.every(row => row.mean_accuracy != null) ? Number(((visible[1].mean_accuracy! - visible[0].mean_accuracy!) * 100).toFixed(2)) : null
  const differences = visible ? configFields.filter(([key]) => visible[0].config[key] !== visible[1].config[key]) : []
  return <>
    <div className="cp-summary-row"><div className="cp-delta"><span>평균 차이 · B − A</span><strong data-testid="mean-delta">{delta===null?'—':`${delta>0?'+':''}${delta}%p`}</strong></div></div>
    <div className="cp-conditions"><span>{visible ? differences.length ? `다른 조건 ${differences.length}개: ${differences.map(([,label])=>label).join(', ')}`:'모든 설정값이 같습니다.':'실험 조건을 비교할 수 있습니다.'}</span><details><summary>설정 나란히 보기</summary><div className="cp-config"><table><thead><tr><th>설정</th><th>실험 A</th><th>실험 B</th><th>차이</th></tr></thead><tbody>{configFields.map(([key,label])=><tr key={key} data-different={visible?visible[0].config[key]!==visible[1].config[key]:false}><th>{label}</th>{[0,1].map(i=><td key={i}>{visible?configValue(visible[i].config,key):'—'}</td>)}<td>{visible?visible[0].config[key]!==visible[1].config[key]?'다름':'같음':'—'}</td></tr>)}</tbody></table><p>같은 Seed도 조건에 따라 난수 사용 과정이 달라질 수 있습니다.</p></div></details></div>
    <p className="cp-caution">정확도 차이는 관측된 결과입니다. 조건·Seed가 다르면 특정 설정의 효과로 단정할 수 없습니다.</p>
  </>
}
