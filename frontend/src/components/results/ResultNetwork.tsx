import { useEffect, useRef, useState, useId } from 'react'
import type { TurnDetail } from '../../experimentsApi'
import { decisions, sends, truths } from './resultLabels'
import { clip, neighbours, pentagonPoints } from '../networkGeometry'
import { onActivateKey } from '../../lib/keyboard'

// 노드 크기(px). 연결선은 노드 테두리에서 조금 떨어진 곳에서 끝난다.
const NODE_HEIGHT = 58
const GOD_WIDTH = 84
const GOD_HEIGHT = 74
// 한 연결의 양방향 메시지를 나란히 그리기 위해 중심선에서 벌리는 거리와, 상태 표시를 받는 쪽으로 미는 거리.
const LANE_OFFSET = 3.5
const BADGE_SHIFT = 9
const BADGE_RADIUS = 6.5
const sendMarks = { dropped: '×', flipped: '!' }

export function ResultNetwork({
  data,
  city,
  onCity,
}: {
  data: TurnDetail | null
  city: number | null
  onCity: (city: number | null) => void
}) {
  const markerId = useId()
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 600, height: 360 })
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(stage.current!)
    return () => observer.disconnect()
  }, [])
  // 실제 픽셀 좌표로 정오각형을 계산해 작은 창에서도 글자 크기를 축소하지 않는다.
  const radius = Math.max(80, Math.min((size.height - 70) / 1.81, (size.width - 150) / 1.91, 230))
  const nodeWidth = size.height < 300 ? 106 : 118
  const center = { x: size.width / 2, y: (size.height - radius * 1.81) / 2 + radius }
  const points = pentagonPoints(center, radius)
  const arrow = `url(#${markerId}-arrow)`
  // 선택 턴에 도시가 왼쪽·오른쪽 이웃에게 보낸 메시지의 전송 상태. 결과가 없으면 정상으로 그린다.
  const sendStatus = (sender: number, side: 'to_left' | 'to_right') =>
    data?.cities.find((c) => c.city === sender)?.[side] ?? 'normal'
  // 한 연결에는 메시지가 양방향으로 오간다. from→to는 from의 오른쪽 발신, to→from은 to의 왼쪽 발신이다.
  const messages = points.flatMap((p, i) => {
    const from = i + 1,
      to = neighbours(from).right
    const q = points[to - 1]
    const a = clip(p, q, nodeWidth / 2 + 4, NODE_HEIGHT / 2 + 3),
      b = clip(q, p, nodeWidth / 2 + 4, NODE_HEIGHT / 2 + 3)
    const directions = [
      { sender: from, receiver: to, start: a, end: b, status: sendStatus(from, 'to_right') },
      { sender: to, receiver: from, start: b, end: a, status: sendStatus(to, 'to_left') },
    ]
    return directions.map(({ sender, receiver, start, end, status }) => {
      const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
      const ux = (end.x - start.x) / length,
        uy = (end.y - start.y) / length
      // 진행 방향의 오른쪽으로 비켜 그리면 반대 방향 선은 자연히 반대쪽에 놓인다.
      const ox = -uy * LANE_OFFSET,
        oy = ux * LANE_OFFSET
      // 상태 표시는 받는 쪽으로 조금 민다. 선이 짧은 작은 화면에서는 선 밖(노드 위)으로 나가지 않게 줄인다.
      const shift = Math.max(0, Math.min(BADGE_SHIFT, length / 2 - BADGE_RADIUS - 1))
      // 양방향 표시는 서로 반대로 움직인다. 중심에서 반지름 이상 떨어지도록, 덜 민 만큼 선 옆으로 더 비킨다.
      const gap = BADGE_RADIUS + 0.5
      const side = Math.max(LANE_OFFSET, Math.sqrt(Math.max(0, gap * gap - shift * shift))) / LANE_OFFSET
      return {
        sender,
        receiver,
        status,
        active: city === from || city === to,
        line: { x1: start.x + ox, y1: start.y + oy, x2: end.x + ox, y2: end.y + oy },
        badge: {
          x: (start.x + end.x) / 2 + ox * side + ux * shift,
          y: (start.y + end.y) / 2 + oy * side + uy * shift,
        },
      }
    })
  })
  // 연결선은 논리적인 통신 경로다. 이전 턴의 수신과 현재 턴의 발신을 구분한다.
  return (
    <div className="rs-network" data-turn={data?.turn} aria-label="선택 턴의 도시 네트워크">
      <div className="rs-section-heading">
        <h2>도시 네트워크</h2>
        <span>
          {data
            ? `${data.turn}턴 · 실제 상태 ${truths[data.truth]}`
            : '도시를 선택해 판단 살펴보기'}
        </span>
      </div>
      <div className="rs-network-stage" ref={stage}>
        {/* 선택 전·로딩 중에는 SVG 자체를 만들지 않아 노드가 노출되거나 키보드로 선택되는 것을 막는다. */}
        {data && (
          <svg
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="group"
            aria-label="God과 다섯 도시의 연결 관계"
          >
            <defs>
              <marker
                id={`${markerId}-arrow`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M2 2 8 5 2 8" fill="none" stroke="context-stroke" strokeWidth="1.4" />
              </marker>
            </defs>
            {messages.map((m) => (
              <line
                key={`${m.sender}-${m.receiver}`}
                className={`rs-message ${m.active ? 'is-active' : ''}`}
                data-send={m.status}
                {...m.line}
                markerEnd={arrow}
              />
            ))}
            {points.map((p, i) => {
              const start = clip(center, p, GOD_WIDTH / 2 + 2, GOD_HEIGHT / 2 + 2),
                end = clip(p, center, nodeWidth / 2 + 4, NODE_HEIGHT / 2 + 4)
              return (
                <line
                  key={i}
                  className={`rs-hint ${city === null || city === i + 1 ? 'is-active' : ''}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  markerEnd={arrow}
                />
              )
            })}
            <g
              transform={`translate(${center.x} ${center.y})`}
              className="rs-god"
              role="button"
              tabIndex={0}
              aria-label="God 실제 상태 보기"
              aria-pressed={city === null}
              onClick={() => onCity(null)}
              onKeyDown={onActivateKey(() => onCity(null))}
            >
              <rect
                x={-GOD_WIDTH / 2}
                y={-GOD_HEIGHT / 2}
                width={GOD_WIDTH}
                height={GOD_HEIGHT}
                rx="7"
              />
              <path d="m0 -29 9 7-3 10h-12l-3-10Z" />
              <text y="7" textAnchor="middle">
                God
              </text>
              <text className="rs-node-caption" y="25" textAnchor="middle">
                {data ? truths[data.truth] : '실제 상태'}
              </text>
            </g>
            {points.map((p, i) => {
              const row = data?.cities.find((c) => c.city === i + 1)
              return (
                <g
                  key={i}
                  transform={`translate(${p.x - nodeWidth / 2} ${p.y - NODE_HEIGHT / 2})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`도시 ${i + 1} 상세 보기`}
                  aria-pressed={city === i + 1}
                  className={`rs-result-node ${city === i + 1 ? 'is-selected' : ''} ${row?.is_byzantine ? 'is-byzantine' : ''}`}
                  onClick={() => onCity(i + 1)}
                  onKeyDown={onActivateKey(() => onCity(i + 1))}
                >
                  <rect width={nodeWidth} height={NODE_HEIGHT} rx="6" />
                  <text x="10" y="22">
                    도시 {i + 1}
                  </text>
                  <text
                    x={nodeWidth - 10}
                    y="22"
                    textAnchor="end"
                    className={`rs-node-caption ${row?.is_byzantine ? 'rs-byzantine' : ''}`}
                  >
                    {row?.is_byzantine ? '비잔틴' : row ? '정상' : ''}
                  </text>
                  <text
                    x="10"
                    y="44"
                    className={
                      row?.correct ? 'rs-correct' : row ? 'rs-incorrect' : 'rs-node-caption'
                    }
                  >
                    {row
                      ? `${decisions[row.decision]} · ${row.correct ? '정답' : '오답'}`
                      : '결과 대기'}
                  </text>
                </g>
              )
            })}
            {/* 누락·조작 표시는 노드보다 나중에 그려 작은 화면에서 노드에 가려지지 않게 한다. */}
            {messages
              .filter((m) => m.status !== 'normal')
              .map((m) => (
                <g
                  key={`${m.sender}-${m.receiver}`}
                  className="rs-send-badge"
                  data-send={m.status}
                  transform={`translate(${m.badge.x} ${m.badge.y})`}
                >
                  <title>{`도시 ${m.sender} → 도시 ${m.receiver} 메시지 ${sends[m.status]}`}</title>
                  <circle r={BADGE_RADIUS} />
                  <text textAnchor="middle" dominantBaseline="central">
                    {sendMarks[m.status as keyof typeof sendMarks]}
                  </text>
                </g>
              ))}
          </svg>
        )}
      </div>
      <div className="rs-legend">
        <span>
          <i className="hint" />
          God → 도시 힌트
        </span>
        <span>
          <i />
          이웃 도시 간 메시지
        </span>
        <span>
          <i className="dropped" />
          발신 누락
        </span>
        <span>
          <i className="flipped" />
          발신 조작
        </span>
        <span>
          <i className="byzantine" />
          비잔틴 도시
        </span>
        <span>수신: 이전 턴 · 발신: 현재 턴</span>
      </div>
    </div>
  )
}
