import { useEffect, useRef, useState } from 'react'
import template from './network-template.html?raw'
import { mountNetwork } from './network-renderer.js'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Badge } from './ui/badge'

export function NetworkCanvas() {
  const root = useRef<HTMLDivElement>(null)
  const renderer = useRef<ReturnType<typeof mountNetwork> | null>(null)
  const [layer, setLayer] = useState('all')
  useEffect(() => {
    const host = root.current!
    // 번들에 포함된 정적 템플릿만 삽입한다. 서버 응답이나 사용자 입력을 HTML로 넣지 않는다.
    host.innerHTML = template
    renderer.current = mountNetwork(host, setLayer)
    // 페이지 이동 시 렌더러의 관찰자·이벤트·애니메이션을 함께 정리한다.
    return () => { renderer.current?.destroy(); renderer.current = null }
  }, [])
  return <section className="network-pane" aria-labelledby="network-heading">
    <div className="network-toolbar"><div className="network-heading"><h2 id="network-heading">도시 네트워크</h2><Badge variant="outline">5개 도시</Badge></div>
      <ToggleGroup type="single" value={layer} onValueChange={value => { if (value) { setLayer(value); renderer.current?.setLayer(value) } }} className="network-filters" aria-label="표시할 경로">
        <ToggleGroupItem value="all" aria-label="전체 경로">전체</ToggleGroupItem><ToggleGroupItem value="hint" aria-label="힌트 경로"><i className="key-hint"/>힌트</ToggleGroupItem><ToggleGroupItem value="message" aria-label="메시지 경로"><i className="key-message"/>메시지</ToggleGroupItem>
      </ToggleGroup>
    </div>
    <div className="network-body" ref={root}/>
  </section>
}
