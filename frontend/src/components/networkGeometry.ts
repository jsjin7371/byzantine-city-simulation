// 설정 화면과 결과·비교 화면의 도시 네트워크가 함께 쓰는 도시 번호와 좌표 계산.
import { CITY_COUNT } from '../experimentForm'

export type Point = { x: number; y: number }

export const cityIds = Array.from({ length: CITY_COUNT }, (_, i) => i + 1)

// 도시는 원형으로 연결된다. 왼쪽은 앞 번호, 오른쪽은 다음 번호이며 양 끝은 서로 이어진다.
export const neighbours = (city: number) => ({
  left: city === 1 ? CITY_COUNT : city - 1,
  right: city === CITY_COUNT ? 1 : city + 1,
})

// 1번 도시를 맨 위에 두고 시계 방향으로 정다각형 꼭짓점을 도시 수만큼 만든다.
export function pentagonPoints(center: Point, radius: number): Point[] {
  const step = 360 / CITY_COUNT
  return cityIds.map((_, i) => ({
    x: center.x + radius * Math.cos(((-90 + i * step) * Math.PI) / 180),
    y: center.y + radius * Math.sin(((-90 + i * step) * Math.PI) / 180),
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
