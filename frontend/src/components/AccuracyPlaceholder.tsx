export function AccuracyPlaceholder() {
  // 결과가 없을 때는 축과 안내만 표시한다. 실제 선과 수치는 그래프 기능에서 추가한다.
  return (
    <div className="accuracy-placeholder" role="img" aria-label="턴별 정확도 그래프. 아직 표시할 결과가 없습니다.">
      <span className="axis-caption">정확도 (%)</span>
      <div className="chart-placeholder">
        <div className="chart-guide"><span>100</span><i /></div>
        <div className="chart-guide"><span>50</span><i /></div>
        <div className="chart-guide"><span>0</span><i /></div>
        <p className="chart-empty-label">결과가 준비되면 그래프가 표시됩니다.</p>
      </div>
      <span className="axis-caption axis-caption--bottom">턴</span>
    </div>
  )
}
