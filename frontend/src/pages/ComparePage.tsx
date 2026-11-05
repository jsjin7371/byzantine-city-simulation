import { AccuracyPlaceholder } from '../components/AccuracyPlaceholder'
import { PageHeading } from '../components/PageHeading'
import { Panel } from '../components/Panel'

const configLabels = ['턴 수', '센서 오류율', '메시지 누락률', '메시지 조작률', '비잔틴 도시 수 (5개 중)', 'Seed']

function ComparisonSlot({ label }: { label: 'A' | 'B' }) {
  return (
    <Panel title={`실험 ${label}`} aside={<span className="badge">선택 전</span>}>
      <label className="field" htmlFor={`compare-${label}`}>
        <span className="sr-only">실험 {label} 선택</span>
        <select id={`compare-${label}`} disabled defaultValue="" aria-describedby="compare-help"><option value="">완료된 실험을 선택하세요</option></select>
      </label>
      <div className="comparison-accuracy"><span>전체 턴 평균 정확도</span><strong>—</strong></div>
      <AccuracyPlaceholder />
      <h3 className="comparison-config-heading">실험 설정</h3>
      <dl className="config-values">{configLabels.map((label) => <div key={label}><dt>{label}</dt><dd>—</dd></div>)}</dl>
    </Panel>
  )
}

export function ComparePage() {
  return (
    <>
      <PageHeading eyebrow="COMPARISON" title="두 실험 비교" description="설정의 차이가 도시의 판단 정확도에 어떤 영향을 주는지 비교하세요." />
      <div className="comparison-intro" id="compare-help"><span className="badge">비교 준비 중</span><p>완료된 서로 다른 두 실험을 선택하는 영역입니다. 실험 선택과 비교 기능은 준비 중입니다.</p></div>
      <div className="comparison-layout"><ComparisonSlot label="A" /><ComparisonSlot label="B" /></div>
      <p className="quiet-note comparison-note">각 실험의 마지막 턴까지 비교하며, 평균 정확도는 해당 실험의 전체 턴을 기준으로 표시합니다.</p>
    </>
  )
}
