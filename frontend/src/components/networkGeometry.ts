// 설정 화면과 결과·비교 화면의 도시 네트워크가 함께 쓰는 좌표 계산.
export type Point = { x: number; y: number }

// 1번 도시를 맨 위에 두고 시계 방향으로 정오각형 꼭짓점 5개를 만든다.
export function pentagonPoints(center: Point, radius: number): Point[] {
  return Array.from({ length: 5 }, (_, i) => ({
    x: center.x + radius * Math.cos(((-90 + i * 72) * Math.PI) / 180),
    y: center.y + radius * Math.sin(((-90 + i * 72) * Math.PI) / 180),
  }))
}

// a에서 b로 가는 선이 a를 중심으로 한 사각형(반너비·반높이) 경계를 나가는 지점.
export function clip(a: Point, b: Point, halfWidth: number, halfHeight: number): Point {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const t = Math.min(
    halfWidth / Math.max(Math.abs(dx), 0.0001),
    halfHeight / Math.max(Math.abs(dy), 0.0001),
  )
  return { x: a.x + dx * t, y: a.y + dy * t }
}
