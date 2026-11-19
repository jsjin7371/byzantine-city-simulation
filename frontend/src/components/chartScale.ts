// 결과 탐색과 비교 화면의 턴별 정확도 그래프가 함께 쓰는 좌표·눈금 계산.

// 실제 턴 번호를 X 좌표로 바꾼다. 턴이 하나뿐이면 그래프 가운데에 둔다.
export const turnScale = (first: number, last: number, left: number, right: number) => (turn: number) =>
  first === last ? (left + right) / 2 : left + ((turn - first) / (last - first)) * (right - left)

// 턴이 많으면 숫자가 겹치므로 첫 턴·마지막 턴·짝수 턴에만 눈금 숫자를 표시한다.
export const showTurnLabel = (turn: number, first: number, last: number, count: number) =>
  count <= 10 || turn === first || turn === last || turn % 2 === 0
