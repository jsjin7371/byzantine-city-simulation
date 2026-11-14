import { useEffect, useRef, useState, useId } from 'react'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Badge } from './ui/badge'

type Selection = number | 'god'
type Point = { x: number; y: number }
const cities = [1, 2, 3, 4, 5]
const neighbours = (city: number) => ({
  left: city === 1 ? 5 : city - 1,
  right: city === 5 ? 1 : city + 1,
})
const idleText = '연결 구조 미리보기입니다. 이 화면은 연결 구조만 보여줍니다.'

function clip(a: Point, b: Point, halfWidth: number, halfHeight: number): Point {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const t = Math.min(
    halfWidth / Math.max(Math.abs(dx), 0.0001),
    halfHeight / Math.max(Math.abs(dy), 0.0001),
  )
  return { x: a.x + dx * t, y: a.y + dy * t }
}
function RouteArrow({ both = false }: { both?: boolean }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d={both ? 'M3 9h12M6 6 3 9l3 3m6-6 3 3-3 3' : 'M3 9h12m-4-4 4 4-4 4'} />
    </svg>
  )
}

export function NetworkCanvas() {
  const stage = useRef<HTMLDivElement>(null)
  const cityNodes = useRef(new Map<number, HTMLButtonElement>())
  const god = useRef<HTMLButtonElement>(null)
  const markerId = useId()
  const [selected, setSelected] = useState<Selection>('god')
  const [layer, setLayer] = useState('all')
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [status, setStatus] = useState(idleText)
  const [size, setSize] = useState({
    width: 600,
    height: 360,
    nodeWidth: 136,
    nodeHeight: 62,
    sourceWidth: 100,
    sourceHeight: 100,
  })

  function stop(message = idleText) {
    setPlaying(false)
    setStatus(message)
  }
  function select(next: Selection, focus = false) {
    stop()
    setSelected(next)
    if (focus)
      (next === 'god' ? god.current : cityNodes.current.get(next))?.focus({ preventScroll: true })
  }
  useEffect(() => {
    const measure = () => {
      const node = cityNodes.current.get(1)!
      setSize({
        width: stage.current!.clientWidth,
        height: stage.current!.clientHeight,
        nodeWidth: node.offsetWidth,
        nodeHeight: node.offsetHeight,
        sourceWidth: god.current!.offsetWidth,
        sourceHeight: god.current!.offsetHeight,
      })
      setPlaying(false)
      setStatus(idleText)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage.current!)
    observer.observe(cityNodes.current.get(1)!)
    observer.observe(god.current!)
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const stopMotion = () => {
      setPlaying(false)
      setStatus(idleText)
    }
    const hide = () => {
      if (document.hidden) stopMotion()
    }
    motion.addEventListener('change', stopMotion)
    document.addEventListener('visibilitychange', hide)
    return () => {
      observer.disconnect()
      motion.removeEventListener('change', stopMotion)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [])
  useEffect(() => {
    if (!playing) return
    const start = performance.now()
    let frame = 0
    function tick(now: number) {
      const time = now - start
      setElapsed(time)
      if (time < (selected === 'god' ? 1200 : 2700)) frame = requestAnimationFrame(tick)
      else {
        setPlaying(false)
        setStatus('전달 과정을 확인했습니다. 이 화면은 연결 구조만 보여줍니다.')
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, selected])

  function play() {
    if (playing) {
      stop('재생을 멈췄습니다. 도시나 경로를 선택해 다시 확인할 수 있습니다.')
      return
    }
    setLayer('all')
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStatus(
        selected === 'god'
          ? 'God은 현재 턴에 다섯 도시 모두에게 힌트를 줍니다. 각 도시의 메시지는 다음 턴에 양쪽 이웃에게 도착합니다.'
          : '현재 턴에 God의 힌트를 받고, 이웃에게 보낸 메시지는 다음 턴에 도착합니다. 동작 줄이기 설정으로 이동 효과를 생략했습니다.',
      )
      return
    }
    setElapsed(0)
    setPlaying(true)
  }
  const origin = { x: size.width / 2, y: size.height / 2 + 8 }
  const radius = Math.min((size.height - 76) / 2, (size.width - 230) / 2, 274)
  const points = cities.map((_, i) => ({
    x: origin.x + radius * Math.cos(((-90 + i * 72) * Math.PI) / 180),
    y: origin.y + radius * Math.sin(((-90 + i * 72) * Math.PI) / 180),
  }))
  // 힌트는 God→도시, 메시지는 원형으로 연결된 양쪽 이웃 사이의 경로다.
  const messages = points.map((p, i) => ({
    start: clip(p, points[(i + 1) % 5], size.nodeWidth / 2 + 5, size.nodeHeight / 2 + 5),
    end: clip(points[(i + 1) % 5], p, size.nodeWidth / 2 + 5, size.nodeHeight / 2 + 5),
  }))
  const hints = points.map((p) => ({
    start: clip(origin, p, size.sourceWidth / 2 + 1, size.sourceHeight / 2 + 1),
    end: clip(p, origin, size.nodeWidth / 2 + 5, size.nodeHeight / 2 + 5),
  }))
  const packets =
    selected === 'god'
      ? hints.map((path) => ({ ...path, from: 0, to: 1000, hint: true }))
      : [
          { ...hints[selected - 1], from: 0, to: 1000, hint: true },
          { ...messages[selected - 1], from: 1200, to: 2500, hint: false },
          {
            start: messages[neighbours(selected).left - 1].end,
            end: messages[neighbours(selected).left - 1].start,
            from: 1200,
            to: 2500,
            hint: false,
          },
        ]
  const playbackText = !playing
    ? status
    : elapsed < 1200
      ? selected === 'god'
        ? '현재 턴 · God이 각 도시에 힌트를 전달합니다.'
        : `현재 턴 · God의 힌트가 도시 ${selected}에 도착합니다.`
      : `다음 턴 · 도시 ${selected}이 보낸 메시지가 양쪽 이웃에 도착합니다.`
  const pathLink = (city: Selection) => (
    <button
      type="button"
      className="path-link"
      data-select={city}
      onClick={() => select(city, true)}
    >
      {city === 'god' ? 'God' : `도시 0${city}`}
    </button>
  )

  return (
    <section className="network-pane" aria-labelledby="network-heading">
      <div className="network-toolbar">
        <div className="network-heading">
          <h2 id="network-heading">도시 네트워크</h2>
          <Badge variant="outline">5개 도시</Badge>
        </div>
        <ToggleGroup
          type="single"
          value={layer}
          onValueChange={(value) => {
            if (value) {
              stop()
              setLayer(value)
            }
          }}
          className="network-filters"
          aria-label="표시할 경로"
        >
          <ToggleGroupItem value="all" aria-label="전체 경로">
            전체
          </ToggleGroupItem>
          <ToggleGroupItem value="hint" aria-label="힌트 경로">
            <i className="key-hint" />
            힌트
          </ToggleGroupItem>
          <ToggleGroupItem value="message" aria-label="메시지 경로">
            <i className="key-message" />
            메시지
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="network-body">
        <div
          className="network-stage"
          id="network-stage"
          ref={stage}
          data-layer={layer}
          aria-describedby="network-instruction"
        >
          <p className="canvas-caption" id="network-instruction">
            도시 또는 God을 선택해 정보가 전달되는 경로를 확인하세요.
          </p>
          <svg id="edges" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
            <defs>
              {['ring', 'active', 'hint'].map((kind) => (
                <marker
                  key={kind}
                  id={`${markerId}-${kind}`}
                  data-network-marker={kind}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth={kind === 'ring' ? 5.5 : 5}
                  markerHeight={kind === 'ring' ? 5.5 : 5}
                  orient={kind === 'hint' ? 'auto' : 'auto-start-reverse'}
                >
                  <path
                    d="m2 2 6 3-6 3"
                    fill="none"
                    stroke={kind === 'ring' ? '#7a8795' : kind === 'active' ? '#3758b5' : '#93632c'}
                    strokeWidth="1.4"
                  />
                </marker>
              ))}
            </defs>
            {messages.map((path, i) => {
              const active = selected === i + 1 || selected === neighbours(i + 1).right
              return (
                <path
                  key={i}
                  id={`message-${i + 1}`}
                  data-from={i + 1}
                  data-to={neighbours(i + 1).right}
                  className={`edge message${active ? ' active' : ''}`}
                  d={`M ${path.start.x} ${path.start.y} L ${path.end.x} ${path.end.y}`}
                  markerStart={`url(#${markerId}-${active ? 'active' : 'ring'})`}
                  markerEnd={`url(#${markerId}-${active ? 'active' : 'ring'})`}
                />
              )
            })}
            {hints.map((path, i) => (
              <path
                key={i}
                id={`hint-${i + 1}`}
                data-from="god"
                data-to={i + 1}
                className={`edge hint${selected === 'god' || selected === i + 1 ? ' active' : ''}`}
                d={`M ${path.start.x} ${path.start.y} L ${path.end.x} ${path.end.y}`}
                markerEnd={`url(#${markerId}-hint)`}
              />
            ))}
            <g id="packets">
              {playing &&
                packets.map((packet, i) => {
                  if (elapsed < packet.from || elapsed > packet.to) return null
                  const progress = (elapsed - packet.from) / (packet.to - packet.from)
                  return (
                    <circle
                      key={i}
                      r="4.5"
                      className={`packet${packet.hint ? ' hint-packet' : ''}`}
                      cx={packet.start.x + (packet.end.x - packet.start.x) * progress}
                      cy={packet.start.y + (packet.end.y - packet.start.y) * progress}
                    />
                  )
                })}
            </g>
          </svg>
          <div id="city-nodes">
            {cities.map((city, i) => (
              <button
                ref={(node) => {
                  if (node) cityNodes.current.set(city, node)
                  else cityNodes.current.delete(city)
                }}
                key={city}
                className="city-node"
                type="button"
                data-city={city}
                style={{ left: points[i].x, top: points[i].y }}
                aria-label={`도시 ${city} 연결 보기`}
                aria-pressed={selected === city}
                aria-describedby="keyboard-help"
                onClick={() => select(city)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  select(
                    event.key === 'Home'
                      ? 1
                      : event.key === 'End'
                        ? 5
                        : event.key === 'ArrowRight'
                          ? neighbours(city).right
                          : neighbours(city).left,
                    true,
                  )
                }}
              >
                <span className="node-index">0{city}</span>
                <span className="node-copy">
                  <span className="city-label">도시 {city}</span>
                  <span className="node-subtitle">
                    {selected === city ? '선택됨' : '이웃 2개 연결'}
                  </span>
                </span>
                <span className="node-port" />
                <svg className="node-tick" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m3 8 3 3 7-7" />
                </svg>
              </button>
            ))}
            <span id="keyboard-help" className="sr-only">
              Tab으로 이동하고 Enter로 선택하세요. 선택 후 좌우 방향키로 다른 도시를 탐색할 수
              있습니다.
            </span>
          </div>
          <button
            className="god-node"
            id="god-node"
            ref={god}
            type="button"
            style={{ left: origin.x, top: origin.y }}
            aria-label="God 역할과 연결 보기"
            aria-pressed={selected === 'god'}
            onClick={() => select('god')}
          >
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <path d="M18 3 32.266 13.365 26.817 30.135 9.183 30.135 3.734 13.365Z" />
              <circle cx="18" cy="18" r="4" />
            </svg>
            <strong>God</strong>
            <span>실제 상태의 출처</span>
          </button>
        </div>
        <div className="network-legend" aria-label="경로의 의미">
          <span>
            <i className="key-hint" aria-hidden="true" />
            <strong>힌트</strong> God → 도시 <span className="timing">현재 턴</span>
          </span>
          <span>
            <i className="key-message" aria-hidden="true" />
            <strong>메시지</strong> 이웃 도시끼리 <span className="timing">다음 턴 수신</span>
          </span>
        </div>
        <section className="connection-inspector" aria-labelledby="selection-title">
          <div className="selection-heading">
            <div>
              <span className="selection-caption">
                {selected === 'god' ? '정보의 출처' : '선택한 도시'}
              </span>
              <h3 id="selection-title">{selected === 'god' ? 'God' : `도시 0${selected}`}</h3>
            </div>
            <span className="selection-status">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m3 8 3 3 7-7" />
              </svg>
              선택됨
            </span>
          </div>
          <div className="connection-content" id="connection-content" aria-live="polite">
            {selected === 'god' ? (
              <p className="god-description">
                실제 상태는 실험 시작 시 한 번 정해집니다.
                <br />
                God은 매 턴 각 도시에 개별 힌트를 전달합니다.
              </p>
            ) : (
              <>
                <div className="connection-row">
                  <span>힌트 수신</span>
                  <div className="route-parts">
                    {pathLink('god')}
                    <RouteArrow />
                    <span className="current-city">도시 0{selected}</span>
                  </div>
                </div>
                <div className="connection-row">
                  <span>메시지 교환</span>
                  <div className="route-parts">
                    {pathLink(neighbours(selected).left)}
                    <RouteArrow both />
                    <span className="current-city">도시 0{selected}</span>
                    <RouteArrow both />
                    {pathLink(neighbours(selected).right)}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className="button preview-button"
            id="preview-button"
            aria-pressed={playing}
            onClick={play}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d={playing ? 'M5 5h10v10H5Z' : 'm7 4 8 6-8 6Z'} />
            </svg>
            <span>{playing ? '재생 멈추기' : '전달 과정 보기'}</span>
          </button>
        </section>
        <p
          className={`playback-status${playing ? ' playing' : ''}`}
          id="playback-status"
          role="status"
        >
          {playbackText}
        </p>
      </div>
    </section>
  )
}
