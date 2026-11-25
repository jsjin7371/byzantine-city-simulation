import type { ReactElement } from 'react'
import { CONDORCET_NS, CONDORCET_PS, ONOFF_SAMPLE_ACTIONS, condorcetMajorityProb, onOffTrajectory } from './theoryBook'
import type { TopicKey } from './village'

type FigureMeta = {
  caption: string
  render: () => ReactElement
}

function ArrowDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <marker id={`${prefix}-leave`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 1 L9 5 L0 9 Z" fill="var(--leave)" />
      </marker>
      <marker id={`${prefix}-rust`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 1 L9 5 L0 9 Z" fill="var(--rust)" />
      </marker>
      <marker id={`${prefix}-forest`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 1 L9 5 L0 9 Z" fill="var(--forest)" />
      </marker>
      <marker id={`${prefix}-wood`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 1 L9 5 L0 9 Z" fill="var(--wood)" />
      </marker>
    </defs>
  )
}

// 그림 1: LSP 1982 Figs. 1-2 구조 (장군 셋, 구두 메시지 불가능성)
function ByzFigure() {
  return (
    <svg
      viewBox="0 0 560 322"
      role="img"
      aria-label="장군 셋 두 장면 비교: 왼쪽은 충성 사령관이 공격을 보내고 배신자 부관 2가 부관 1에게 후퇴로 바꿔 전한 장면, 오른쪽은 배신자 사령관이 부관 1에게 공격, 부관 2에게 후퇴를 보내고 충성 부관 2가 후퇴를 그대로 전한 장면. 두 장면 모두 부관 1이 받는 메시지가 공격과 후퇴로 같아 구별할 수 없다."
    >
      <ArrowDefs prefix="tf-byz" />

      {/* (가) 부관 2가 배신자 */}
      <rect x="8" y="8" width="264" height="256" rx="6" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="140" y="32" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        (가) 부관 2가 배신자
      </text>

      {/* 화살표 (가) */}
      <line x1="120" y1="100" x2="80" y2="159" stroke="var(--leave)" strokeWidth="2.2" markerEnd="url(#tf-byz-leave)" />
      <text x="68" y="128" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--leave)">
        공격
      </text>
      <line x1="160" y1="100" x2="200" y2="159" stroke="var(--leave)" strokeWidth="2.2" markerEnd="url(#tf-byz-leave)" />
      <text x="212" y="128" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--leave)">
        공격
      </text>
      <line
        x1="186"
        y1="186"
        x2="96"
        y2="186"
        stroke="var(--rust)"
        strokeWidth="2.2"
        strokeDasharray="6 4"
        markerEnd="url(#tf-byz-rust)"
      />
      <text x="140" y="177" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        후퇴 (변조)
      </text>

      {/* 노드 (가) */}
      <circle cx="140" cy="76" r="27" fill="var(--parch)" stroke="var(--forest)" strokeWidth="2.2" />
      <text x="140" y="81" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        사령관
      </text>
      <circle cx="64" cy="186" r="27" fill="var(--parch)" stroke="var(--forest)" strokeWidth="2.2" />
      <text x="64" y="191" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        부관 1
      </text>
      <circle cx="216" cy="186" r="27" fill="var(--cream)" stroke="var(--rust)" strokeWidth="2.2" strokeDasharray="5 3" />
      <text x="216" y="191" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        부관 2
      </text>
      <text x="216" y="230" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        (배신)
      </text>
      <text x="140" y="253" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        부관 1 수신: 공격, 후퇴
      </text>

      {/* (나) 사령관이 배신자 */}
      <rect x="288" y="8" width="264" height="256" rx="6" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="420" y="32" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        (나) 사령관이 배신자
      </text>

      {/* 화살표 (나) */}
      <line
        x1="400"
        y1="100"
        x2="360"
        y2="159"
        stroke="var(--rust)"
        strokeWidth="2.2"
        strokeDasharray="6 4"
        markerEnd="url(#tf-byz-rust)"
      />
      <text x="348" y="128" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        공격
      </text>
      <line
        x1="440"
        y1="100"
        x2="480"
        y2="159"
        stroke="var(--rust)"
        strokeWidth="2.2"
        strokeDasharray="6 4"
        markerEnd="url(#tf-byz-rust)"
      />
      <text x="492" y="128" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        후퇴
      </text>
      <line x1="466" y1="186" x2="376" y2="186" stroke="var(--leave)" strokeWidth="2.2" markerEnd="url(#tf-byz-leave)" />
      <text x="420" y="177" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--leave)">
        후퇴 (전달)
      </text>

      {/* 노드 (나) */}
      <circle cx="420" cy="76" r="27" fill="var(--cream)" stroke="var(--rust)" strokeWidth="2.2" strokeDasharray="5 3" />
      <text x="420" y="81" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        사령관
      </text>
      <text x="478" y="81" fontSize="15" fontWeight="700" textAnchor="start" fill="var(--rust)">
        (배신)
      </text>
      <circle cx="344" cy="186" r="27" fill="var(--parch)" stroke="var(--forest)" strokeWidth="2.2" />
      <text x="344" y="191" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        부관 1
      </text>
      <circle cx="496" cy="186" r="27" fill="var(--parch)" stroke="var(--forest)" strokeWidth="2.2" />
      <text x="496" y="191" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        부관 2
      </text>
      <text x="420" y="253" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        부관 1 수신: 공격, 후퇴
      </text>

      {/* 하단 요약 */}
      <rect x="8" y="276" width="544" height="38" rx="5" fill="var(--parch)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="280" y="300" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        부관 1은 두 장면을 구별 못 함 → (나)에서 부관 1은 공격, 부관 2는 후퇴 (IC1 깨짐)
      </text>
    </svg>
  )
}

// 그림 2: 이중 발언과 맞대조로 드러나는 모순
function EquivFigure() {
  return (
    <svg
      viewBox="0 0 560 248"
      role="img"
      aria-label="한 발신자가 상대 A에게 대피, 상대 B에게 잔류로 서로 다른 메시지를 보내고, 상대 A와 상대 B가 메시지를 맞대어 보면 같은 시점의 모순이 드러나는 그림."
    >
      <ArrowDefs prefix="tf-equiv" />

      {/* 발신자 */}
      <rect
        x="16"
        y="78"
        width="116"
        height="68"
        rx="34"
        fill="var(--cream)"
        stroke="var(--rust)"
        strokeWidth="2.4"
        strokeDasharray="6 4"
      />
      <text x="74" y="107" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        발신자
      </text>
      <text x="74" y="129" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        (이중 발언)
      </text>

      {/* 화살표: 대피 (실선) / 잔류 (점선) */}
      <line x1="136" y1="98" x2="274" y2="60" stroke="var(--leave)" strokeWidth="2.4" markerEnd="url(#tf-equiv-leave)" />
      <rect x="172" y="40" width="66" height="26" rx="13" fill="var(--parch)" stroke="var(--leave)" strokeWidth="1.5" />
      <text x="205" y="58" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--leave)">
        “대피”
      </text>

      <line
        x1="136"
        y1="126"
        x2="274"
        y2="164"
        stroke="var(--rust)"
        strokeWidth="2.4"
        strokeDasharray="7 4"
        markerEnd="url(#tf-equiv-rust)"
      />
      <rect x="172" y="158" width="66" height="26" rx="13" fill="var(--cream)" stroke="var(--rust)" strokeWidth="1.5" strokeDasharray="4 2" />
      <text x="205" y="176" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        “잔류”
      </text>

      {/* 수신자 A, B */}
      <rect x="282" y="34" width="102" height="48" rx="8" fill="var(--parch)" stroke="var(--forest)" strokeWidth="2" />
      <text x="333" y="63" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        상대 A
      </text>

      <rect x="282" y="142" width="102" height="48" rx="8" fill="var(--parch)" stroke="var(--forest)" strokeWidth="2" />
      <text x="333" y="171" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        상대 B
      </text>

      {/* 맞대조 연결선 */}
      <path
        d="M386 58 H414 V166 H386"
        fill="none"
        stroke="var(--wood)"
        strokeWidth="2"
        strokeDasharray="4 3"
      />
      <line x1="414" y1="112" x2="432" y2="112" stroke="var(--wood)" strokeWidth="2" />

      {/* 모순 상자 */}
      <rect x="434" y="80" width="118" height="64" rx="6" fill="var(--cream)" stroke="var(--rust)" strokeWidth="2.2" />
      <text x="493" y="106" fontSize="16" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        ✕ 모순 확인
      </text>
      <text x="493" y="130" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        대피 ≠ 잔류
      </text>

      {/* 하단 설명 */}
      <line x1="12" y1="208" x2="548" y2="208" stroke="var(--wood)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <text x="280" y="233" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        단독 수신: 거짓 여부 모름  |  맞대조: 같은 날 서로 다른 말 증명
      </text>
    </svg>
  )
}

// 그림 3: 온오프 공격의 날짜별 의심도 톱니 그래프 (실제 ±20 계산)
function OnOffFigure() {
  const pts = onOffTrajectory(ONOFF_SAMPLE_ACTIONS)
  const x0 = 64
  const stepX = 46
  const yBot = 216
  const scaleY = 2 // 0..80 -> 160px (yTop=56)
  const xOf = (day: number) => x0 + day * stepX
  const yOf = (val: number) => yBot - val * scaleY
  const trialY = yOf(60)

  return (
    <svg
      viewBox="0 0 560 282"
      role="img"
      aria-label={`날짜별 의심도 톱니 그래프: 0일 의심도 0에서 시작해 거짓(+20)과 정직(-20)을 번갈아 하며 ${pts
        .slice(1)
        .map((p) => `${p.day}일 ${p.suspicion}`)
        .join(', ')}으로 재판 기준선 60 아래를 오르내린다.`}
    >
      {/* 범례 */}
      <line x1="22" y1="22" x2="52" y2="22" stroke="var(--rust)" strokeWidth="2.8" />
      <circle cx="37" cy="22" r="4.5" fill="var(--rust)" />
      <text x="60" y="27" fontSize="15" fontWeight="700" fill="var(--rust)">
        거짓 (+20)
      </text>

      <line x1="168" y1="22" x2="198" y2="22" stroke="var(--forest)" strokeWidth="2.8" strokeDasharray="6 3" />
      <rect x="179" y="18" width="8" height="8" fill="var(--cream)" stroke="var(--forest)" strokeWidth="2" />
      <text x="206" y="27" fontSize="15" fontWeight="700" fill="var(--forest)">
        정직 (−20)
      </text>

      <line x1="316" y1="22" x2="346" y2="22" stroke="var(--rust)" strokeWidth="1.8" strokeDasharray="5 4" />
      <text x="354" y="27" fontSize="15" fontWeight="700" fill="var(--wood)">
        재판 기준 60
      </text>

      {/* 수평 보조선 및 Y축 눈금 */}
      {[0, 20, 40, 60, 80].map((v) => {
        const y = yOf(v)
        const isTrial = v === 60
        return (
          <g key={v}>
            <line
              x1={x0}
              y1={y}
              x2={xOf(10) + 12}
              y2={y}
              stroke={isTrial ? 'var(--rust)' : 'var(--wood)'}
              strokeWidth={isTrial ? 2 : 1}
              strokeDasharray={isTrial ? '6 4' : v === 0 ? undefined : '2 4'}
              opacity={isTrial ? 0.9 : v === 0 ? 0.8 : 0.35}
            />
            <text x={x0 - 10} y={y + 5} fontSize="15" fontWeight="700" textAnchor="end" fill={isTrial ? 'var(--rust)' : 'var(--ink)'}>
              {v}
            </text>
          </g>
        )
      })}
      <text x={xOf(10) + 8} y={trialY - 8} fontSize="15" fontWeight="700" textAnchor="end" fill="var(--rust)">
        재판 기준 (60)
      </text>

      {/* Y축 */}
      <line x1={x0} y1={yOf(80)} x2={x0} y2={yBot} stroke="var(--wood)" strokeWidth="1.5" />

      {/* 톱니 선분 (거짓: 실선 rust, 정직: 점선 forest) */}
      {pts.slice(1).map((p, i) => {
        const prev = pts[i]
        const lie = p.action === 'lie'
        return (
          <line
            key={p.day}
            x1={xOf(prev.day)}
            y1={yOf(prev.suspicion)}
            x2={xOf(p.day)}
            y2={yOf(p.suspicion)}
            stroke={lie ? 'var(--rust)' : 'var(--forest)'}
            strokeWidth="2.8"
            strokeDasharray={lie ? undefined : '6 3'}
          />
        )
      })}

      {/* 꼭짓점 표식 및 X축 날짜 */}
      {pts.map((p) => {
        const cx = xOf(p.day)
        const cy = yOf(p.suspicion)
        return (
          <g key={p.day}>
            {p.action === 'start' ? (
              <circle cx={cx} cy={cy} r="4.5" fill="var(--wood)" />
            ) : p.action === 'lie' ? (
              <circle cx={cx} cy={cy} r="5" fill="var(--rust)" />
            ) : (
              <rect x={cx - 4.5} y={cy - 4.5} width="9" height="9" fill="var(--cream)" stroke="var(--forest)" strokeWidth="2.2" />
            )}
            <text x={cx} y={yBot + 22} fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
              {p.day}
            </text>
          </g>
        )
      })}
      <text x={xOf(10) + 26} y={yBot + 22} fontSize="15" fontWeight="700" fill="var(--wood)">
        일
      </text>

      {/* 하단 요약 */}
      <text x="280" y="268" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        의심도는 0 아래로 안 내려가며, 기준선 60 아래에서 오르내려 탐지를 피함
      </text>
    </svg>
  )
}

// 그림 4: 집 5채 완전 연결 vs 고리 연결 (연결도 4 vs 2, f=1에 2f+1=3 필요)
function RingFigure() {
  const pentagon = (cx: number, cy: number, r: number) =>
    [0, 1, 2, 3, 4].map((i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
      return { id: i + 1, x: Number((cx + r * Math.cos(angle)).toFixed(1)), y: Number((cy + r * Math.sin(angle)).toFixed(1)) }
    })

  const fullNodes = pentagon(140, 130, 64)
  const ringNodes = pentagon(420, 130, 64)
  const fullEdges: [number, number][] = []
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) fullEdges.push([i, j])
  }
  const ringEdges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 0],
  ]

  return (
    <svg
      viewBox="0 0 560 288"
      role="img"
      aria-label="집 5채 통신 그래프 비교: 왼쪽 완전 연결은 모든 집이 서로 이어져 연결도 4로 f=1일 때 필요한 2f+1=3을 충족한다. 오른쪽 고리 연결은 양옆 두 집만 이어져 연결도 2로 필요한 3에 못 미친다."
    >
      {/* 왼쪽: 완전 연결 */}
      <rect x="8" y="8" width="264" height="224" rx="6" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="140" y="33" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        완전 연결 (집 5채)
      </text>
      {fullEdges.map(([i, j]) => (
        <line
          key={`f-${i}-${j}`}
          x1={fullNodes[i].x}
          y1={fullNodes[i].y}
          x2={fullNodes[j].x}
          y2={fullNodes[j].y}
          stroke="var(--forest)"
          strokeWidth="1.8"
          opacity="0.72"
        />
      ))}
      {fullNodes.map((n) => (
        <g key={`fn-${n.id}`}>
          <circle cx={n.x} cy={n.y} r="15" fill="var(--parch)" stroke="var(--forest)" strokeWidth="2" />
          <text x={n.x} y={n.y + 5} fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
            {n.id}
          </text>
        </g>
      ))}
      <text x="140" y="220" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--forest)">
        연결도 = 4 (≥ 3 충족 ✓)
      </text>

      {/* 오른쪽: 고리 연결 */}
      <rect x="288" y="8" width="264" height="224" rx="6" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="420" y="33" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        고리 연결 (집 5채)
      </text>
      {ringEdges.map(([i, j]) => {
        const throughTraitor = i === 0 || j === 0
        return (
          <line
            key={`r-${i}-${j}`}
            x1={ringNodes[i].x}
            y1={ringNodes[i].y}
            x2={ringNodes[j].x}
            y2={ringNodes[j].y}
            stroke={throughTraitor ? 'var(--rust)' : 'var(--leave)'}
            strokeWidth="2.4"
            strokeDasharray={throughTraitor ? '6 4' : undefined}
          />
        )
      })}
      {ringNodes.map((n) => {
        const isTraitor = n.id === 1
        return (
          <g key={`rn-${n.id}`}>
            <circle
              cx={n.x}
              cy={n.y}
              r="15"
              fill={isTraitor ? 'var(--cream)' : 'var(--parch)'}
              stroke={isTraitor ? 'var(--rust)' : 'var(--leave)'}
              strokeWidth="2.2"
              strokeDasharray={isTraitor ? '4 2' : undefined}
            />
            <text x={n.x} y={n.y + 5} fontSize="15" fontWeight="700" textAnchor="middle" fill={isTraitor ? 'var(--rust)' : 'var(--ink)'}>
              {n.id}
            </text>
          </g>
        )
      })}
      <text x="478" y="68" fontSize="15" fontWeight="700" fill="var(--rust)">
        배신 (f=1)
      </text>
      <text x="420" y="220" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        연결도 = 2 (&lt; 3 부족 ✕)
      </text>

      {/* 하단 조건 공식 */}
      <rect x="8" y="244" width="544" height="36" rx="5" fill="var(--parch)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="280" y="267" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        서명 없는 합의 필요 연결도: 2f + 1  (f = 1일 때 2f + 1 = 3)
      </text>
    </svg>
  )
}

// 그림 5: 콩도르세 배심원 정리 (이항분포 실계산 곡선)
function CondorcetFigure() {
  const x0 = 64
  const plotW = 360
  const yTop = 44
  const plotH = 180
  const yBot = yTop + plotH
  const xOf = (n: number) => x0 + ((n - 1) / 24) * plotW
  const yOf = (prob: number) => yBot - ((prob - 0.5) / 0.5) * plotH

  const styles = {
    0.7: { color: 'var(--forest)', dash: undefined, shape: 'circle' as const, label: 'p = 0.7' },
    0.6: { color: 'var(--leave)', dash: '8 4', shape: 'square' as const, label: 'p = 0.6' },
    0.52: { color: 'var(--rust)', dash: '3 3', shape: 'diamond' as const, label: 'p = 0.52' },
  }

  const curves = CONDORCET_PS.map((p) => {
    const pts = CONDORCET_NS.map((n) => ({ n, prob: condorcetMajorityProb(n, p) }))
    return { p, pts, style: styles[p] }
  })

  const ariaSummary = curves
    .map(({ p, pts }) => {
      const end = pts.at(-1)!
      return `p=${p}일 때 n=1에서 ${(pts[0].prob * 100).toFixed(0)}%, n=25에서 ${(end.prob * 100).toFixed(0)}%`
    })
    .join(', ')

  return (
    <svg
      viewBox="0 0 560 288"
      role="img"
      aria-label={`홀수 투표자 수 n=1부터 25까지의 다수결 정답 확률 곡선(이항분포 계산): ${ariaSummary}.`}
    >
      <text x="14" y="24" fontSize="15" fontWeight="700" fill="var(--wood)">
        다수결 정답 확률
      </text>

      {/* Y축 보조선 및 눈금 */}
      {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((v) => {
        const y = yOf(v)
        return (
          <g key={v}>
            <line
              x1={x0}
              y1={y}
              x2={x0 + plotW}
              y2={y}
              stroke="var(--wood)"
              strokeWidth={v === 0.5 ? 1.5 : 1}
              strokeDasharray={v === 0.5 ? undefined : '2 4'}
              opacity={v === 0.5 ? 0.8 : 0.32}
            />
            <text x={x0 - 10} y={y + 5} fontSize="15" fontWeight="700" textAnchor="end" fill="var(--ink)">
              {v.toFixed(1)}
            </text>
          </g>
        )
      })}
      <line x1={x0} y1={yTop} x2={x0} y2={yBot} stroke="var(--wood)" strokeWidth="1.5" />

      {/* X축 눈금 */}
      {[1, 5, 9, 13, 17, 21, 25].map((n) => {
        const x = xOf(n)
        return (
          <g key={n}>
            <line x1={x} y1={yBot} x2={x} y2={yBot + 5} stroke="var(--wood)" strokeWidth="1.5" />
            <text x={x} y={yBot + 22} fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
              {n}
            </text>
          </g>
        )
      })}
      <text x={x0 + plotW / 2} y="274" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        투표자 수 n (홀수)
      </text>

      {/* 곡선 + 마커 + 우측 직접 라벨 */}
      {curves.map(({ p, pts, style }) => {
        const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${xOf(pt.n).toFixed(1)} ${yOf(pt.prob).toFixed(1)}`).join(' ')
        const last = pts.at(-1)!
        const endY = yOf(last.prob)
        return (
          <g key={p}>
            <path d={d} fill="none" stroke={style.color} strokeWidth="2.6" strokeDasharray={style.dash} />
            {pts.map((pt) => {
              const cx = xOf(pt.n)
              const cy = yOf(pt.prob)
              if (style.shape === 'circle') {
                return <circle key={pt.n} cx={cx} cy={cy} r="3.6" fill={style.color} />
              }
              if (style.shape === 'square') {
                return (
                  <rect
                    key={pt.n}
                    x={cx - 3.2}
                    y={cy - 3.2}
                    width="6.4"
                    height="6.4"
                    fill="var(--cream)"
                    stroke={style.color}
                    strokeWidth="2"
                  />
                )
              }
              return (
                <polygon
                  key={pt.n}
                  points={`${cx},${cy - 4.2} ${cx + 4.2},${cy} ${cx},${cy + 4.2} ${cx - 4.2},${cy}`}
                  fill={style.color}
                />
              )
            })}
            <text x={x0 + plotW + 10} y={endY + 5} fontSize="15" fontWeight="700" fill={style.color}>
              {style.label} ({Math.round(last.prob * 100)}%)
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// 그림 6: 완고한 행위자 개념도 (차원 조건 및 양쪽 완고 포함, 과장 없음)
function ZealotFigure() {
  const grid = [
    [76, 80], [140, 80], [204, 80],
    [76, 134], [140, 134], [204, 134],
    [76, 188], [140, 188], [204, 188],
  ] as const

  return (
    <svg
      viewBox="0 0 560 284"
      role="img"
      aria-label="투표자 모형에서 완고한 행위자의 영향 개념도: 왼쪽은 1·2차원 격자에서 한쪽 의견을 유지하는 완고한 행위자 한 명의 영향이 주변으로 번져 전체가 통일되는 모습, 오른쪽 위는 3차원 이상에서 거리가 멀수록 영향이 줄어 전체가 통일되지 않는 모습, 오른쪽 아래는 양쪽 진영에 완고한 행위자가 함께 있어 합의가 영구히 막히는 모습."
    >
      <ArrowDefs prefix="tf-zealot" />

      {/* 왼쪽: 1·2차원 격자 */}
      <rect x="8" y="8" width="264" height="268" rx="6" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="140" y="33" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        1·2차원 격자 (완고 1명)
      </text>

      {/* 격자 연결선 */}
      {[80, 134, 188].map((y) => (
        <line key={`h-${y}`} x1="76" y1={y} x2="204" y2={y} stroke="var(--wood)" strokeWidth="1.4" opacity="0.45" />
      ))}
      {[76, 140, 204].map((x) => (
        <line key={`v-${x}`} x1={x} y1="80" x2={x} y2="188" stroke="var(--wood)" strokeWidth="1.4" opacity="0.45" />
      ))}

      {/* 중앙에서 상하좌우로 끌어당기는 화살표 */}
      <line x1="140" y1="112" x2="140" y2="97" stroke="var(--rust)" strokeWidth="2.2" markerEnd="url(#tf-zealot-rust)" />
      <line x1="140" y1="156" x2="140" y2="171" stroke="var(--rust)" strokeWidth="2.2" markerEnd="url(#tf-zealot-rust)" />
      <line x1="118" y1="134" x2="94" y2="134" stroke="var(--rust)" strokeWidth="2.2" markerEnd="url(#tf-zealot-rust)" />
      <line x1="162" y1="134" x2="186" y2="134" stroke="var(--rust)" strokeWidth="2.2" markerEnd="url(#tf-zealot-rust)" />

      {grid.map(([x, y], idx) => {
        const isCenter = idx === 4
        const isCorner = idx === 0 || idx === 2 || idx === 6 || idx === 8
        return (
          <g key={idx}>
            {isCenter && (
              <circle cx={x} cy={y} r="22" fill="none" stroke="var(--rust)" strokeWidth="2" strokeDasharray="4 2" />
            )}
            <circle
              cx={x}
              cy={y}
              r={isCenter ? 17 : 13}
              fill={isCenter ? 'var(--parch)' : 'var(--cream)'}
              stroke={isCenter ? 'var(--rust)' : isCorner ? 'var(--wood)' : 'var(--rust)'}
              strokeWidth={isCenter ? 2.4 : 1.8}
              strokeDasharray={isCorner ? '3 3' : undefined}
            />
            <text
              x={x}
              y={y + 5}
              fontSize="15"
              fontWeight="700"
              textAnchor="middle"
              fill={isCorner ? 'var(--wood)' : 'var(--rust)'}
            >
              A
            </text>
          </g>
        )
      })}
      <text x="140" y="232" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        영향이 끝까지 번져
      </text>
      <text x="140" y="254" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        시간이 지나면 전체 통일
      </text>

      {/* 오른쪽 위: 3차원 이상 */}
      <rect x="288" y="8" width="264" height="128" rx="6" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="420" y="31" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        3차원 이상 (거리 감쇠)
      </text>
      <circle cx="364" cy="76" r="32" fill="none" stroke="var(--rust)" strokeWidth="1.3" strokeDasharray="3 3" opacity="0.45" />
      <circle cx="364" cy="76" r="20" fill="none" stroke="var(--rust)" strokeWidth="1.6" strokeDasharray="4 2" />
      <circle cx="364" cy="76" r="14" fill="var(--parch)" stroke="var(--rust)" strokeWidth="2.2" />
      <text x="364" y="81" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        A
      </text>
      {[
        [434, 62],
        [480, 74],
        [454, 94],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="12" fill="var(--parch)" stroke="var(--leave)" strokeWidth="1.8" />
          <text x={x} y={y + 5} fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--leave)">
            B
          </text>
        </g>
      ))}
      <text x="420" y="124" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        멀수록 영향 약화 → 통일 불가
      </text>

      {/* 오른쪽 아래: 양쪽 완고 */}
      <rect x="288" y="148" width="264" height="128" rx="6" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.2" />
      <text x="420" y="171" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        양쪽 진영에 모두 완고
      </text>
      <circle cx="332" cy="214" r="19" fill="none" stroke="var(--rust)" strokeWidth="1.6" strokeDasharray="4 2" />
      <circle cx="332" cy="214" r="14" fill="var(--parch)" stroke="var(--rust)" strokeWidth="2.2" />
      <text x="332" y="219" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        A
      </text>

      <line x1="354" y1="214" x2="394" y2="214" stroke="var(--rust)" strokeWidth="2" markerEnd="url(#tf-zealot-rust)" />
      <circle cx="420" cy="214" r="15" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.8" strokeDasharray="4 3" />
      <text x="420" y="219" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        ?
      </text>
      <line x1="486" y1="214" x2="446" y2="214" stroke="var(--leave)" strokeWidth="2" markerEnd="url(#tf-zealot-leave)" />

      <circle cx="508" cy="214" r="19" fill="none" stroke="var(--leave)" strokeWidth="1.6" strokeDasharray="4 2" />
      <circle cx="508" cy="214" r="14" fill="var(--parch)" stroke="var(--leave)" strokeWidth="2.2" />
      <text x="508" y="219" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--leave)">
        B
      </text>

      <text x="420" y="264" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        n이 커져도 합의 차단 (폭 ∝ 1/√f)
      </text>
    </svg>
  )
}

// 그림 7: 거짓 양성 흐름도 (진짜 날씨 -> 잘못 본 하늘 -> 의심도 +20)
function FalsePosFigure() {
  return (
    <svg
      viewBox="0 0 560 258"
      role="img"
      aria-label="거짓 양성 발생 흐름도: 진짜 날씨가 태풍일 때 발신자가 정직하게 대피 쪽지를 보내더라도, 주민이 하늘을 맑음으로 잘못 보면 자기 관측과 다른 말로 판정해 의심도가 20 오른다."
    >
      <ArrowDefs prefix="tf-fp" />

      {/* 1단계: 진짜 날씨 */}
      <rect x="8" y="76" width="98" height="68" rx="8" fill="var(--parch)" stroke="var(--leave)" strokeWidth="2.2" />
      <text x="57" y="104" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--leave)">
        진짜 날씨
      </text>
      <text x="57" y="128" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        태풍
      </text>

      {/* 분기 화살표 */}
      <path d="M106 96 L132 54" fill="none" stroke="var(--forest)" strokeWidth="2.2" markerEnd="url(#tf-fp-forest)" />
      <path d="M106 124 L132 166" fill="none" stroke="var(--rust)" strokeWidth="2.2" strokeDasharray="6 4" markerEnd="url(#tf-fp-rust)" />

      {/* 2단계 위: 정직한 쪽지 */}
      <rect x="136" y="18" width="146" height="68" rx="8" fill="var(--cream)" stroke="var(--forest)" strokeWidth="2.2" />
      <text x="209" y="46" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--forest)">
        정직한 쪽지
      </text>
      <text x="209" y="70" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        “대피” (사실)
      </text>

      {/* 2단계 아래: 잘못 본 하늘 */}
      <rect
        x="136"
        y="134"
        width="146"
        height="68"
        rx="8"
        fill="var(--cream)"
        stroke="var(--rust)"
        strokeWidth="2.2"
        strokeDasharray="6 4"
      />
      <text x="209" y="162" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        잘못 본 하늘
      </text>
      <text x="209" y="186" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        “맑음” (오차)
      </text>

      {/* 합류 화살표 */}
      <path d="M282 54 L308 94" fill="none" stroke="var(--forest)" strokeWidth="2.2" markerEnd="url(#tf-fp-forest)" />
      <path d="M282 166 L308 126" fill="none" stroke="var(--rust)" strokeWidth="2.2" strokeDasharray="6 4" markerEnd="url(#tf-fp-rust)" />

      {/* 3단계: 주민 판단 */}
      <rect x="312" y="76" width="104" height="68" rx="8" fill="var(--parch)" stroke="var(--wood)" strokeWidth="2" />
      <text x="364" y="104" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        주민 판단
      </text>
      <text x="364" y="128" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        다른 말!
      </text>

      {/* 최종 화살표 */}
      <line x1="416" y1="110" x2="438" y2="110" stroke="var(--rust)" strokeWidth="2.4" markerEnd="url(#tf-fp-rust)" />

      {/* 4단계: 의심도 +20 */}
      <rect x="442" y="76" width="110" height="68" rx="8" fill="var(--cream)" stroke="var(--rust)" strokeWidth="2.4" />
      <rect x="446" y="80" width="102" height="60" rx="5" fill="none" stroke="var(--rust)" strokeWidth="1" />
      <text x="497" y="105" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        의심도 +20
      </text>
      <text x="497" y="129" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--ink)">
        거짓 양성
      </text>

      {/* 하단 요약 */}
      <line x1="12" y1="220" x2="548" y2="220" stroke="var(--wood)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <text x="280" y="244" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        정직한 쪽지도 주민의 관측이 틀리면 의심이 쌓여 억울한 재판으로 이어짐
      </text>
    </svg>
  )
}

// 그림 8: 예고된 비교 짝을 피하는 감사 회피
function AuditFigure() {
  return (
    <svg
      viewBox="0 0 560 302"
      role="img"
      aria-label="감사 회피 개념도: 1번 집과 2번 집이 오늘 밤 비교 짝임을 미리 알면, 마피아가 두 집에는 같은 말 대피를 보내 모순을 피하고, 비교 대상이 아닌 3번 집과 4번 집에는 다른 말 잔류를 보내 들키지 않는다."
    >
      <ArrowDefs prefix="tf-audit" />

      {/* 비교 짝 표시 (1번 - 2번) */}
      <path d="M74 74 Q140 54 206 74" fill="none" stroke="var(--forest)" strokeWidth="2.2" strokeDasharray="6 4" />
      <rect x="76" y="8" width="128" height="26" rx="13" fill="var(--parch)" stroke="var(--forest)" strokeWidth="1.5" />
      <text x="140" y="26" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--forest)">
        예고된 비교 짝
      </text>
      <text x="140" y="53" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--forest)">
        일치 (모순 0)
      </text>

      {/* 비교 안 함 표시 (3번 - 4번) */}
      <rect x="362" y="8" width="116" height="26" rx="13" fill="var(--cream)" stroke="var(--wood)" strokeWidth="1.4" strokeDasharray="3 3" />
      <text x="420" y="26" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        비교 안 함
      </text>
      <text x="420" y="53" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        검사 없음 (미적발)
      </text>

      {/* 집 4채 */}
      {[
        { label: '1번 집', x: 28, audited: true },
        { label: '2번 집', x: 160, audited: true },
        { label: '3번 집', x: 308, audited: false },
        { label: '4번 집', x: 440, audited: false },
      ].map((h) => (
        <g key={h.label}>
          <rect
            x={h.x}
            y="74"
            width="92"
            height="46"
            rx="8"
            fill={h.audited ? 'var(--parch)' : 'var(--cream)'}
            stroke={h.audited ? 'var(--forest)' : 'var(--wood)'}
            strokeWidth="2"
            strokeDasharray={h.audited ? undefined : '4 3'}
          />
          <text x={h.x + 46} y="102" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--ink)">
            {h.label}
          </text>
        </g>
      ))}

      {/* 마피아 → 1, 2번 집 (같은 말: 실선 leave) */}
      <line x1="252" y1="216" x2="84" y2="124" stroke="var(--leave)" strokeWidth="2.3" markerEnd="url(#tf-audit-leave)" />
      <line x1="268" y1="212" x2="210" y2="124" stroke="var(--leave)" strokeWidth="2.3" markerEnd="url(#tf-audit-leave)" />
      <rect x="92" y="152" width="116" height="26" rx="13" fill="var(--parch)" stroke="var(--leave)" strokeWidth="1.5" />
      <text x="150" y="170" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--leave)">
        같은 말 “대피”
      </text>

      {/* 마피아 → 3, 4번 집 (다른 말: 점선 rust) */}
      <line
        x1="292"
        y1="212"
        x2="350"
        y2="124"
        stroke="var(--rust)"
        strokeWidth="2.3"
        strokeDasharray="6 4"
        markerEnd="url(#tf-audit-rust)"
      />
      <line
        x1="308"
        y1="216"
        x2="476"
        y2="124"
        stroke="var(--rust)"
        strokeWidth="2.3"
        strokeDasharray="6 4"
        markerEnd="url(#tf-audit-rust)"
      />
      <rect x="352" y="152" width="116" height="26" rx="13" fill="var(--cream)" stroke="var(--rust)" strokeWidth="1.5" strokeDasharray="4 2" />
      <text x="410" y="170" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        다른 말 “잔류”
      </text>

      {/* 마피아 노드 */}
      <rect
        x="228"
        y="214"
        width="104"
        height="42"
        rx="21"
        fill="var(--cream)"
        stroke="var(--rust)"
        strokeWidth="2.2"
        strokeDasharray="5 3"
      />
      <text x="280" y="240" fontSize="15.5" fontWeight="700" textAnchor="middle" fill="var(--rust)">
        마피아
      </text>

      {/* 하단 요약 */}
      <text x="280" y="288" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--wood)">
        비교 짝을 미리 알면 짝 밖으로만 이중 발언해 적발 확률이 0이 됨
      </text>
    </svg>
  )
}

const THEORY_FIGURES: Record<TopicKey, FigureMeta> = {
  byz: {
    caption: '그림 1. 장군 셋 불가능성: 부관 1은 두 장면을 구별할 수 없다(LSP 1982 Figs. 1–2 구조).',
    render: ByzFigure,
  },
  equiv: {
    caption: '그림 2. 이중 발언: 두 상대에게 서로 다른 메시지를 보냈을 때 맞대조로 모순이 드러난다.',
    render: EquivFigure,
  },
  onoff: {
    caption: '그림 3. 온오프 공격의 의심도 톱니 그래프(거짓 +20, 정직 −20, 기준선 60 아래 유지).',
    render: OnOffFigure,
  },
  ring: {
    caption: '그림 4. 집 5채 완전 연결(연결도 4)과 고리 연결(연결도 2) 비교(f = 1이면 2f + 1 = 3 필요).',
    render: RingFigure,
  },
  condorcet: {
    caption: '그림 5. 개별 정답 확률 p별 홀수 투표자 수 n(1~25)에 따른 다수결 정답 확률(이항분포 계산).',
    render: CondorcetFigure,
  },
  zealot: {
    caption: '그림 6. 투표자 모형에서 완고한 행위자의 영향과 차원·양측 대립 조건.',
    render: ZealotFigure,
  },
  falsepos: {
    caption: '그림 7. 관측 오차가 있는 환경에서 정직한 쪽지가 의심도 상승(거짓 양성)으로 이어지는 흐름.',
    render: FalsePosFigure,
  },
  audit: {
    caption: '그림 8. 예고된 비교 짝에는 같은 말을, 비교되지 않는 집에만 다른 말을 보내는 감사 회피.',
    render: AuditFigure,
  },
}

export function TheoryFigure({ topic }: { topic: TopicKey }) {
  const fig = THEORY_FIGURES[topic]
  const Graphic = fig.render
  return (
    <figure className="tb-figure">
      <Graphic />
      <figcaption className="tb-figcaption">{fig.caption}</figcaption>
    </figure>
  )
}
