import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { TOTAL_TURNS, citizenTypes, difficulties } from '../gameApi'
import type { CitizenType, Difficulty } from '../gameApi'
import { onActivateKey } from '../lib/keyboard'

const DIFF_LAYOUT: Record<Difficulty, { x: number; w: number; cx: number; rx: number }> = {
  easy: { x: 546, w: 112, cx: 602, rx: 44 },
  normal: { x: 698, w: 112, cx: 754, rx: 44 },
  hard: { x: 850, w: 120, cx: 910, rx: 48 },
}

const CITIZEN_LAYOUT: Record<CitizenType, { x: number; w: number; cx: number; rx: number }> = {
  majority: { x: 546, w: 112, cx: 602, rx: 46 },
  wary: { x: 698, w: 112, cx: 754, rx: 44 },
  ai: { x: 850, w: 120, cx: 910, rx: 42 },
}

type RoleCardSpec = {
  key: CitizenType
  clip: string
  icon: string
  x: number
  cx: number
  rotate: number
  stampRotate: number
  tag: string
  tagClass: 'vb-muted' | 'vb-rust'
  tagX: number
  tagSize: number
  lines: [string, string]
  ariaLabel: string
}

const ROLE_CARDS: RoleCardSpec[] = [
  {
    key: 'majority',
    clip: 'vs-clip-role-1',
    icon: '#vs-icon-majority',
    x: 277,
    cx: 420,
    rotate: -0.9,
    stampRotate: -13,
    tag: '· 입문용',
    tagClass: 'vb-muted',
    tagX: 402,
    tagSize: 17,
    lines: ['보고 들은 것 중 많은 쪽을 따라요.', '아무도 의심하지 않아 재판이 없어요.'],
    ariaLabel: '다수결 주민 선택 (입문용): 본 날씨와 들은 말 중 많은 쪽을 따라요. 아무도 의심하지 않아 재판이 없어요.',
  },
  {
    key: 'wary',
    clip: 'vs-clip-role-2',
    icon: '#vs-icon-wary',
    x: 577,
    cx: 720,
    rotate: 0.4,
    stampRotate: -11,
    tag: '· 기본',
    tagClass: 'vb-rust',
    tagX: 683,
    tagSize: 17,
    lines: ['본 날씨와 내 말이 다르거나 엇갈리면', '의심이 쌓여 광장 재판이 열려요.'],
    ariaLabel: '눈치 주민 선택 (기본): 본 날씨와 내 말이 다르거나 엇갈리면 의심이 쌓여 광장 재판이 열려요.',
  },
  {
    key: 'ai',
    clip: 'vs-clip-role-3',
    icon: '#vs-icon-ai',
    x: 877,
    cx: 1020,
    rotate: 0.8,
    stampRotate: -13,
    tag: '· 못 쓰면 눈치로',
    tagClass: 'vb-muted',
    tagX: 960,
    tagSize: 16.5,
    lines: ['상황을 살피며 스스로 판단해요 (AI)', '의심 많은 주민, 잘 믿는 주민이 섞여요.'],
    ariaLabel: 'AI 주민 선택 (못 쓰면 눈치로): 상황을 살피며 AI가 스스로 판단해요. 의심 많은 주민, 잘 믿는 주민이 섞여요.',
  },
]

const BACK_TREES: [number, number, number][] = [
  [88, 370, 0.85], [148, 355, 0.75], [222, 378, 0.78], [382, 392, 0.72],
  [1055, 392, 0.74], [1235, 378, 0.82], [1312, 360, 0.78], [1378, 385, 0.9],
  [60, 468, 0.95], [234, 544, 0.88], [1196, 548, 0.88], [1386, 528, 1.0],
]

const FRONT_TREES: [number, number, number][] = [
  [72, 650, 1.15], [94, 756, 1.22], [342, 746, 1.02],
  [1118, 728, 1.05], [1214, 748, 1.14], [1352, 716, 1.25], [1396, 636, 1.08],
]

const STARS: [number, number, number][] = [
  [278, 72, 0.95], [362, 118, 0.68], [1098, 78, 0.9], [1284, 116, 0.75], [1352, 68, 0.62],
]

const START_TRAILS = [
  'M720 870 Q685 755 720 650 Q750 560 720 468',
  'M720 558 Q480 540 198 518',
  'M720 562 Q980 572 1255 595',
  'M720 470 Q510 448 312 426',
  'M720 470 Q940 450 1138 426',
]

function onRadioKey<T extends string>(
  e: KeyboardEvent,
  keys: readonly T[],
  index: number,
  select: (val: T) => void,
  nodes: (SVGGElement | null)[],
) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select(keys[index])
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    const next = (index + 1) % keys.length
    select(keys[next])
    nodes[next]?.focus()
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    const next = (index - 1 + keys.length) % keys.length
    select(keys[next])
    nodes[next]?.focus()
  }
}

function StartDefs() {
  return (
    <defs>
      <filter id="vs-rough" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="vs-rough-sm" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={2} seed={9} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={2.2} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="vs-mottle" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves={3} seed={11} />
        <feColorMatrix values="0 0 0 0 .17  0 0 0 0 .29  0 0 0 0 .1  1.5 0 0 0 -.6" />
      </filter>
      <filter id="vs-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} />
        <feColorMatrix values="0 0 0 0 .25  0 0 0 0 .18  0 0 0 0 .08  .5 0 0 0 -.2" />
      </filter>
      <radialGradient id="vs-lamp">
        <stop offset="0" stopColor="#ffe27a" stopOpacity=".95" />
        <stop offset="1" stopColor="#ffd35a" stopOpacity="0" />
      </radialGradient>

      <g id="vs-tree">
        <ellipse cx="3" cy="16" rx="20" ry="6" fill="#2a3d1d" opacity=".35" />
        <circle r="19" fill="#2f4a28" />
        <circle cx="-7" cy="-6" r="10" fill="#46652f" />
        <circle cx="6" cy="-9" r="6" fill="#5e8040" />
      </g>
      <g id="vs-hut">
        <ellipse cx="2" cy="4" rx="50" ry="9" fill="#3a2a14" opacity=".28" />
        <path d="M-35 2 L-35 -32 L35 -32 L35 2 Z" fill="#e8cf9c" stroke="#3b2a1a" strokeWidth="2.2" />
        <path d="M-6 2 V-16 Q0 -23 6 -16 V2 Z" fill="#6b4a2a" stroke="#3b2a1a" strokeWidth="1.5" />
        <path d="M-46 -28 Q-26 -66 0 -70 Q26 -66 46 -28 Q0 -36 -46 -28 Z" fill="#b5763d" stroke="#3b2a1a" strokeWidth="2.2" />
        <path d="M-30 -36 L-18 -58 M-14 -34 L-6 -64 M2 -34 L6 -65 M16 -35 L20 -60 M30 -34 L32 -48" stroke="#7e4d22" strokeWidth="1.6" fill="none" />
      </g>
      <g id="vs-hut-dark">
        <ellipse cx="2" cy="4" rx="50" ry="9" fill="#3a2a14" opacity=".28" />
        <path d="M-35 2 L-35 -32 L35 -32 L35 2 Z" fill="#cdbb98" stroke="#3b2a1a" strokeWidth="2.4" />
        <path d="M-46 -28 Q-26 -66 0 -70 Q26 -66 46 -28 Q0 -36 -46 -28 Z" fill="#4e3f35" stroke="#2a1f17" strokeWidth="2.4" />
        <rect x="-8" y="-24" width="16" height="13" fill="#3e352c" stroke="#3b2a1a" strokeWidth="2" />
      </g>
      <g id="vs-win-on">
        <circle r="22" fill="url(#vs-lamp)" />
        <rect x="-8" y="-7" width="16" height="14" fill="#ffd35a" stroke="#3b2a1a" strokeWidth="2" />
        <path d="M0 -7 V7 M-8 0 H8" stroke="#3b2a1a" strokeWidth="1.3" />
      </g>
      <g id="vs-win-off">
        <rect x="-8" y="-7" width="16" height="14" fill="#3e352c" stroke="#3b2a1a" strokeWidth="2" />
        <path d="M0 -7 V7 M-8 0 H8" stroke="#6b5d4b" strokeWidth="1.3" />
      </g>
      <path
        id="vs-spark-star"
        d="M0 -8 L2.2 -2.2 L8 0 L2.2 2.2 L0 8 L-2.2 2.2 L-8 0 L-2.2 -2.2 Z"
        fill="#ffd35a"
        stroke="#e0a72a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* 주민 종류 손그림 아이콘 */}
      <g id="vs-icon-majority" filter="url(#vs-rough-sm)">
        <path
          d="M-6 11 C-10 11 -12 7 -12 3 L-12 -2 C-12 -4 -9.5 -4 -9.5 -2 L-9.5 1 L-8.5 -9 C-8.5 -11.5 -5 -11.5 -5 -9 L-4.5 -1 L-3.5 -11.5 C-3.5 -14 0.5 -14 0.5 -11.5 L0.5 -1 L2 -9.5 C2 -12 5.5 -12 5.5 -9.5 L5 0 L6.5 -4.5 C7.5 -6.5 10.5 -5.5 9.8 -3 L7.5 6 C6.5 10 3.5 11 0 11 Z"
          fill="#f2d5a7"
          stroke="#3b2a1a"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d="M-5 4 Q0 6 4 4" fill="none" stroke="#8a6a3e" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <g id="vs-icon-wary" filter="url(#vs-rough-sm)">
        <path d="M-12 -8 Q-2 -14 11 -7" fill="none" stroke="#3b2a1a" strokeWidth="2.2" strokeLinecap="round" />
        <path
          d="M-13 2 Q0 -8 13 2 Q0 11 -13 2 Z"
          fill="#fff8e7"
          stroke="#3b2a1a"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <circle cx="4.5" cy="2" r="4.3" fill="#3b2a1a" />
        <circle cx="6" cy="0.5" r="1.4" fill="#fff8e7" />
      </g>
      <g id="vs-icon-ai" filter="url(#vs-rough-sm)">
        <path
          d="M-8 5 C-13 5 -15 0 -12 -4 C-13 -9 -7 -13 -2 -10 C2 -14 10 -12 11 -6 C15 -5 15 2 10 4 C9 6 6 6 3 5 Z"
          fill="#fff8e7"
          stroke="#3b2a1a"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="-6" cy="9.5" r="2.1" fill="#fff8e7" stroke="#3b2a1a" strokeWidth="1.6" />
        <circle cx="-10" cy="13" r="1.4" fill="#fff8e7" stroke="#3b2a1a" strokeWidth="1.4" />
        <path
          d="M1 -8.5 L2.6 -4.5 L6.6 -3 L2.6 -1.5 L1 2.5 L-0.6 -1.5 L-4.6 -3 L-0.6 -4.5 Z"
          fill="#ffd35a"
          stroke="#a8361f"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>
      <g id="vs-red-stamp" filter="url(#vs-rough-sm)">
        <circle cx="0" cy="0" r="22" fill="#f9f0d4" fillOpacity="0.72" stroke="#a8361f" strokeWidth="3" />
        <circle cx="0" cy="0" r="17.5" fill="none" stroke="#a8361f" strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="0" y="6" fontSize="18" fontWeight="700" textAnchor="middle" className="vb-rust">
          선택
        </text>
      </g>

      <clipPath id="vs-clip-title-plank">
        <rect x="424" y="80" width="592" height="96" rx="4" />
      </clipPath>
      <clipPath id="vs-clip-goal-note">
        <path d="M366 190 H1056 L1074 208 V258 H366 Z" />
      </clipPath>
      <clipPath id="vs-clip-plank-1">
        <path d="M404 272 H1004 L1036 305 L1004 338 H404 Z" />
      </clipPath>
      <clipPath id="vs-clip-plank-2">
        <path d="M404 354 H1004 L1036 387 L1004 420 H404 Z" />
      </clipPath>
      <clipPath id="vs-clip-role-1">
        <path d="M277 440 H545 L563 458 V578 H277 Z" />
      </clipPath>
      <clipPath id="vs-clip-role-2">
        <path d="M577 440 H845 L863 458 V578 H577 Z" />
      </clipPath>
      <clipPath id="vs-clip-role-3">
        <path d="M877 440 H1145 L1163 458 V578 H877 Z" />
      </clipPath>
      <clipPath id="vs-clip-enter-btn">
        <rect x="530" y="610" width="380" height="72" rx="4" />
      </clipPath>
      <clipPath id="vs-clip-exit-sign">
        <path d="M50 26 H208 V64 H50 L28 45 Z" />
      </clipPath>
      <clipPath id="vs-clip-hill-mid">
        <path d="M-240 432 Q200 398 440 438 Q720 482 1000 434 Q1240 392 1680 426 V920 H-240 Z" />
      </clipPath>
    </defs>
  )
}

function StartBackdrop() {
  return (
    <g aria-hidden="true">
      <rect x="-240" y="-20" width="1920" height="470" fill="#e6ba7a" />
      <g filter="url(#vs-rough)">
        <path
          d="M-240 -20 H1680 V272 Q1560 292 1460 272 Q1370 294 1275 274 Q1180 298 1085 276 Q980 296 880 278 Q780 300 680 278 Q580 298 480 276 Q380 296 280 274 Q180 292 80 274 Q-40 292 -240 272 Z"
          fill="#d28b5e"
        />
      </g>
      <g filter="url(#vs-rough)">
        <path
          d="M-240 -20 H1680 V142 Q1560 162 1460 142 Q1365 162 1265 144 Q1160 168 1055 146 Q950 166 845 148 Q740 168 635 146 Q530 166 425 146 Q320 164 215 144 Q110 162 -240 144 Z"
          fill="#687488"
        />
      </g>

      <g filter="url(#vs-rough)">
        <circle cx="1195" cy="282" r="46" fill="#ffd35a" stroke="#c98f1e" strokeWidth="2.5" />
        <g stroke="#ffd35a" strokeWidth="3.6" strokeLinecap="round">
          <path d="M1195 212 v14 M1125 282 h14 M1251 282 h14 M1146 233 l10 10 M1234 233 l-10 10 M1138 320 l11 -7 M1252 320 l-11 -7" />
        </g>
      </g>

      <g filter="url(#vs-rough)">
        {STARS.map(([x, y, s]) => (
          <use key={`${x}-${y}`} href="#vs-spark-star" transform={`translate(${x}, ${y}) scale(${s})`} />
        ))}
      </g>

      <g filter="url(#vs-rough)">
        <g fill="#efc89d">
          <ellipse cx="220" cy="212" rx="68" ry="20" />
          <ellipse cx="268" cy="198" rx="46" ry="20" />
          <ellipse cx="322" cy="212" rx="48" ry="15" />
        </g>
        <g fill="#dfa981">
          <ellipse cx="265" cy="222" rx="74" ry="11" />
        </g>
        <g fill="#efc89d">
          <ellipse cx="1055" cy="218" rx="54" ry="16" />
          <ellipse cx="1095" cy="208" rx="34" ry="15" />
        </g>
        <g fill="#f3d6b4">
          <ellipse cx="1325" cy="252" rx="62" ry="17" />
          <ellipse cx="1368" cy="242" rx="40" ry="15" />
        </g>
      </g>

      <g filter="url(#vs-rough)">
        <path
          d="M-240 358 Q180 318 395 366 Q645 418 890 388 Q1145 352 1680 330 V560 H-240 Z"
          fill="#6e8249"
          stroke="#4c5e31"
          strokeWidth="2"
        />
      </g>
      <g filter="url(#vs-rough)">
        <path
          d="M-240 432 Q200 398 440 438 Q720 482 1000 434 Q1240 392 1680 426 V920 H-240 Z"
          fill="#859a53"
          stroke="#596d36"
          strokeWidth="2"
        />
      </g>
      <rect x="-240" y="390" width="1920" height="510" filter="url(#vs-mottle)" clipPath="url(#vs-clip-hill-mid)" opacity="0.85" />

      <g filter="url(#vs-rough)" fill="none" strokeLinecap="round">
        <g stroke="#9c7442" strokeWidth="24">
          {START_TRAILS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g stroke="#c9a068" strokeWidth="15">
          {START_TRAILS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>

      <g filter="url(#vs-rough)">
        <path
          d="M-240 638 Q165 604 355 668 Q520 722 720 728 Q940 732 1120 666 Q1295 602 1680 638 V920 H-240 Z"
          fill="#62783e"
          stroke="#435629"
          strokeWidth="2"
        />
        <path
          d="M-240 772 Q260 744 540 778 Q860 806 1160 762 Q1325 740 1680 766 V920 H-240 Z"
          fill="#495d2f"
          stroke="#354621"
          strokeWidth="2"
        />
      </g>

      <g filter="url(#vs-rough)" fill="#d4b678" stroke="#9e7f48" strokeWidth="2">
        <ellipse cx="298" cy="422" rx="56" ry="20" />
        <ellipse cx="148" cy="516" rx="70" ry="25" />
        <ellipse cx="1142" cy="422" rx="58" ry="20" />
        <ellipse cx="1276" cy="596" rx="76" ry="28" />
        <ellipse cx="212" cy="712" rx="76" ry="28" />
      </g>

      <g filter="url(#vs-rough)">
        {BACK_TREES.map(([x, y, s]) => (
          <use key={`${x}-${y}`} href="#vs-tree" transform={`translate(${x}, ${y}) scale(${s})`} />
        ))}
      </g>

      <g transform="translate(298, 422) scale(0.86)" filter="url(#vs-rough)">
        <use href="#vs-hut" />
        <use href="#vs-win-off" x="-18" y="-20" />
      </g>
      <g transform="translate(148, 516) scale(1.06)" filter="url(#vs-rough)">
        <use href="#vs-hut" />
        <use href="#vs-win-on" x="-18" y="-20" />
      </g>
      <g transform="translate(1142, 422) scale(0.9)" filter="url(#vs-rough)">
        <use href="#vs-hut-dark" />
      </g>
      <g transform="translate(1276, 596) scale(1.16)" filter="url(#vs-rough)">
        <use href="#vs-hut" />
        <use href="#vs-win-on" x="-18" y="-20" />
      </g>
      <g transform="translate(212, 712) scale(1.18)" filter="url(#vs-rough)">
        <use href="#vs-hut" />
        <use href="#vs-win-on" x="-18" y="-20" />
      </g>

      <g filter="url(#vs-rough)">
        {FRONT_TREES.map(([x, y, s]) => (
          <use key={`${x}-${y}`} href="#vs-tree" transform={`translate(${x}, ${y}) scale(${s})`} />
        ))}
      </g>
    </g>
  )
}

export function GameStart({
  difficulty,
  citizenType,
  busy,
  error,
  onDifficulty,
  onCitizenType,
  onStart,
}: {
  difficulty: Difficulty
  citizenType: CitizenType
  busy: boolean
  error: string
  onDifficulty: (value: Difficulty) => void
  onCitizenType: (value: CitizenType) => void
  onStart: () => void
}) {
  const diffKeys = Object.keys(difficulties) as Difficulty[]
  const citizenKeys = Object.keys(citizenTypes) as CitizenType[]
  const diffRefs = useRef<(SVGGElement | null)[]>([])
  const citizenRefs = useRef<(SVGGElement | null)[]>([])

  return (
    <div className="gm-workspace gm-start">
      <h1 className="sr-only">AI 시민을 속여라</h1>
      <svg
        className="gm-start-scene"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="AI 시민을 속여라 시작 화면"
      >
        <StartDefs />
        <StartBackdrop />

        {/* 왼쪽 위 "← 실험 설정" 나무 화살표 표지 */}
        <a
          href="#/setup"
          className={busy ? 'gs-exit is-busy' : 'vb-clickable gs-exit'}
          aria-disabled={busy || undefined}
          aria-label="실험 설정으로 돌아가기"
          onClick={(e) => {
            if (busy) e.preventDefault()
          }}
        >
          <rect x="178" y="18" width="9" height="68" fill="#5a3d22" stroke="#3b2a1a" strokeWidth="1.6" filter="url(#vs-rough)" />
          <path
            d="M50 26 H208 V64 H50 L28 45 Z"
            fill="#c99a5b"
            stroke="#4a3119"
            strokeWidth="2"
            filter="url(#vs-rough)"
          />
          <rect x="26" y="24" width="184" height="42" filter="url(#vs-grain)" clipPath="url(#vs-clip-exit-sign)" />
          <circle cx="184" cy="45" r="2.8" fill="#4a3119" />
          <text x="112" y="52" fontSize="21" fontWeight="700" textAnchor="middle" className="vb-pencil">
            ← 실험 설정
          </text>
        </a>

        {/* 제목 나무 간판 */}
        <g aria-hidden="true">
          <text
            x="720"
            y="62"
            fontSize="24"
            fontWeight="700"
            letterSpacing="3"
            textAnchor="middle"
            className="vb-sign-title vb-pencil"
          >
            열다섯 밤의 거짓말
          </text>

          <g filter="url(#vs-rough)" fill="#5a3d22" stroke="#3b2a1a" strokeWidth="2">
            <rect x="496" y="168" width="14" height="38" />
            <rect x="930" y="168" width="14" height="38" />
          </g>

          <rect
            x="424"
            y="80"
            width="592"
            height="96"
            rx="4"
            fill="#7a5530"
            stroke="#4a3119"
            strokeWidth="3.5"
            filter="url(#vs-rough)"
          />
          <rect x="424" y="80" width="592" height="96" filter="url(#vs-grain)" clipPath="url(#vs-clip-title-plank)" />

          <g filter="url(#vs-rough)" fill="none">
            <rect x="435" y="90" width="570" height="76" rx="2" stroke="#c99a5b" strokeWidth="1.5" opacity="0.65" />
            <path d="M446 108 Q590 104 740 109 Q880 112 994 106" stroke="#5a3d22" strokeWidth="1.3" opacity="0.45" />
            <path d="M448 154 Q610 158 790 152 Q910 150 992 155" stroke="#5a3d22" strokeWidth="1.3" opacity="0.45" />
          </g>
          <g fill="#3b2a1a" stroke="#c99a5b" strokeWidth="1.2">
            <circle cx="448" cy="100" r="3.8" />
            <circle cx="992" cy="100" r="3.8" />
            <circle cx="448" cy="158" r="3.8" />
            <circle cx="992" cy="158" r="3.8" />
          </g>

          <text
            x="720"
            y="148"
            fontSize="64"
            fontWeight="700"
            letterSpacing="1.5"
            textAnchor="middle"
            className="vb-cream vb-pencil"
          >
            AI 시민을 속여라
          </text>
        </g>

        {/* 목표 종이 쪽지 */}
        <g aria-label={`목표: 마피아로 숨어 ${TOTAL_TURNS}일째 밤에 주민 반 넘게 틀린 결정을 내리게 해요. 재판에 걸리면 바로 져요.`}>
          <path
            d="M366 190 H1056 L1074 208 V258 H366 Z"
            fill="#f6ebcd"
            stroke="#8a6a3e"
            strokeWidth="2.2"
            filter="url(#vs-rough)"
          />
          <rect x="366" y="190" width="708" height="68" filter="url(#vs-grain)" clipPath="url(#vs-clip-goal-note)" />
          <path d="M1056 190 V208 H1074" fill="#e4d2a6" stroke="#8a6a3e" strokeWidth="1.6" filter="url(#vs-rough)" />
          <circle cx="384" cy="206" r="5.5" fill="#a8361f" stroke="#4a1a10" strokeWidth="1.5" filter="url(#vs-rough)" />
          <text x="720" y="218" fontSize="20" fontWeight="700" textAnchor="middle" className="vb-pencil">
            마피아로 숨어 {TOTAL_TURNS}일째 밤에 주민 반 넘게 틀린 결정을 내리게 해요.
          </text>
          <text x="720" y="245" fontSize="20" fontWeight="700" textAnchor="middle" className="vb-pencil">
            재판에 걸리면 바로 져요.
          </text>
        </g>

        {/* 선택 표지판 (난이도 / 주민) + 주민 설명 쪽지 3장 */}
        <g role="group" aria-label="게임 설정 표지판">
          <ellipse cx="720" cy="596" rx="34" ry="8" fill="#2a3d1d" opacity="0.38" filter="url(#vs-rough)" />
          <rect
            x="711"
            y="258"
            width="18"
            height="340"
            fill="#5a3d22"
            stroke="#3b2a1a"
            strokeWidth="2"
            filter="url(#vs-rough)"
          />

          {/* 첫 번째 화살표 판자: 난이도 */}
          <g transform="rotate(-0.5, 720, 305)" role="radiogroup" aria-label="난이도">
            <path
              d="M404 272 H1004 L1036 305 L1004 338 H404 Z"
              fill="#c99a5b"
              stroke="#4a3119"
              strokeWidth="2.4"
              filter="url(#vs-rough)"
            />
            <rect x="404" y="272" width="632" height="66" filter="url(#vs-grain)" clipPath="url(#vs-clip-plank-1)" />
            <circle cx="418" cy="284" r="2.8" fill="#4a3119" />
            <circle cx="418" cy="326" r="2.8" fill="#4a3119" />

            <text x="444" y="313" fontSize="25" fontWeight="700" className="vb-pencil">
              난이도:
            </text>

            {diffKeys.map((key, i) => {
              const slot = DIFF_LAYOUT[key]
              const selected = difficulty === key
              return (
                <g key={key}>
                  <g
                    ref={(el) => {
                      diffRefs.current[i] = el
                    }}
                    className={selected ? 'vb-clickable vb-opt-item is-selected' : 'vb-clickable vb-opt-item'}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => onDifficulty(key)}
                    onKeyDown={(e) => onRadioKey(e, diffKeys, i, onDifficulty, diffRefs.current)}
                  >
                    <rect
                      className="opt-bg"
                      x={slot.x}
                      y="280"
                      width={slot.w}
                      height="50"
                      rx="3"
                      fill="#f6ebcd"
                      stroke="#8a6a3e"
                      strokeWidth="1.6"
                      filter="url(#vs-rough)"
                    />
                    <ellipse
                      className="opt-stamp"
                      cx={slot.cx}
                      cy="305"
                      rx={slot.rx}
                      ry="19"
                      fill="none"
                      stroke="#a8361f"
                      strokeWidth="3"
                      filter="url(#vs-rough)"
                    />
                    <text className="opt-label vb-pencil" x={slot.cx} y="313" fontSize="24" textAnchor="middle">
                      {difficulties[key].label}
                    </text>
                  </g>
                  {i < diffKeys.length - 1 && (
                    <text
                      x={i === 0 ? 678 : 830}
                      y="312"
                      fontSize="22"
                      fontWeight="700"
                      textAnchor="middle"
                      className="vb-slash"
                      aria-hidden="true"
                    >
                      /
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* 두 번째 화살표 판자: 주민 */}
          <g transform="rotate(0.4, 720, 387)" role="radiogroup" aria-label="주민 종류">
            <path
              d="M404 354 H1004 L1036 387 L1004 420 H404 Z"
              fill="#c99a5b"
              stroke="#4a3119"
              strokeWidth="2.4"
              filter="url(#vs-rough)"
            />
            <rect x="404" y="354" width="632" height="66" filter="url(#vs-grain)" clipPath="url(#vs-clip-plank-2)" />
            <circle cx="418" cy="366" r="2.8" fill="#4a3119" />
            <circle cx="418" cy="408" r="2.8" fill="#4a3119" />

            <text x="444" y="395" fontSize="25" fontWeight="700" className="vb-pencil">
              주민:
            </text>

            {citizenKeys.map((key, i) => {
              const slot = CITIZEN_LAYOUT[key]
              const selected = citizenType === key
              const card = ROLE_CARDS.find((c) => c.key === key)
              return (
                <g key={key}>
                  <g
                    ref={(el) => {
                      citizenRefs.current[i] = el
                    }}
                    className={selected ? 'vb-clickable vb-opt-item is-selected' : 'vb-clickable vb-opt-item'}
                    role="radio"
                    aria-checked={selected}
                    aria-label={card?.ariaLabel}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => onCitizenType(key)}
                    onKeyDown={(e) => onRadioKey(e, citizenKeys, i, onCitizenType, citizenRefs.current)}
                  >
                    <rect
                      className="opt-bg"
                      x={slot.x}
                      y="362"
                      width={slot.w}
                      height="50"
                      rx="3"
                      fill="#f6ebcd"
                      stroke="#8a6a3e"
                      strokeWidth="1.6"
                      filter="url(#vs-rough)"
                    />
                    <ellipse
                      className="opt-stamp"
                      cx={slot.cx}
                      cy="387"
                      rx={slot.rx}
                      ry="19"
                      fill="none"
                      stroke="#a8361f"
                      strokeWidth="3"
                      filter="url(#vs-rough)"
                    />
                    <text className="opt-label vb-pencil" x={slot.cx} y="395" fontSize="24" textAnchor="middle">
                      {citizenTypes[key].label}
                    </text>
                  </g>
                  {i < citizenKeys.length - 1 && (
                    <text
                      x={i === 0 ? 678 : 830}
                      y="394"
                      fontSize="22"
                      fontWeight="700"
                      textAnchor="middle"
                      className="vb-slash"
                      aria-hidden="true"
                    >
                      /
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* 표지판과 아래 쪽지 3장을 잇는 작은 끈 */}
          <g stroke="#5a3d22" strokeWidth="2" strokeDasharray="3 3" opacity="0.75" filter="url(#vs-rough-sm)" aria-hidden="true">
            <line x1="432" y1="420" x2="420" y2="449" />
            <line x1="720" y1="420" x2="720" y2="449" />
            <line x1="994" y1="420" x2="1020" y2="449" />
          </g>

          {/* 주민 종류 설명 쪽지 3장 */}
          {ROLE_CARDS.map((card) => {
            const selected = citizenType === card.key
            const right = card.x + 286
            const fold = right - 18
            return (
              <g
                key={card.key}
                className={selected ? 'vb-clickable vb-role-card is-selected' : 'vb-clickable vb-role-card'}
                transform={`rotate(${card.rotate}, ${card.cx}, 509)`}
                aria-hidden="true"
                onClick={() => {
                  onCitizenType(card.key)
                  const index = citizenKeys.indexOf(card.key)
                  if (index >= 0) citizenRefs.current[index]?.focus()
                }}
              >
                <path className="card-paper" d={`M${card.x} 440 H${fold} L${right} 458 V578 H${card.x} Z`} filter="url(#vs-rough)" />
                <rect x={card.x} y="440" width="286" height="138" filter="url(#vs-grain)" clipPath={`url(#${card.clip})`} />
                <path d={`M${fold} 440 V458 H${right}`} fill="#dfcca0" stroke="#8a6a3e" strokeWidth="1.5" filter="url(#vs-rough)" />
                <circle className="card-pin" cx={card.cx} cy="449" r="4.2" strokeWidth="1.3" filter="url(#vs-rough-sm)" />

                <use href={card.icon} transform={`translate(${card.x + 31}, 476)`} />
                <text className="card-title vb-pencil" x={card.x + 55} y="484" fontSize="25">
                  {citizenTypes[card.key].label}
                </text>
                <text className={card.tagClass} x={card.tagX} y="483" fontSize={card.tagSize} fontWeight="700">
                  {card.tag}
                </text>

                <path
                  d={`M${card.x + 20} 498 Q${card.cx} 501 ${right - 20} 497`}
                  fill="none"
                  stroke="#b99c6b"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  filter="url(#vs-rough-sm)"
                />

                <text className="card-desc vb-pencil-sm" x={card.cx} y="527" fontSize="17.2" textAnchor="middle">
                  {card.lines[0]}
                </text>
                <text className="card-desc vb-pencil-sm" x={card.cx} y="555" fontSize="17.2" textAnchor="middle">
                  {card.lines[1]}
                </text>

                <g className="card-stamp" transform={`translate(${card.x + 246}, 474) rotate(${card.stampRotate})`} aria-hidden="true">
                  <use href="#vs-red-stamp" />
                </g>
              </g>
            )
          })}
        </g>

        {/* "마을로 들어가기" 큰 초록 나무 판자 버튼 */}
        <g
          className={busy ? 'gs-enter is-busy' : 'vb-clickable gs-enter'}
          role="button"
          tabIndex={0}
          aria-disabled={busy || undefined}
          aria-label="마을로 들어가기"
          onClick={() => {
            if (!busy) onStart()
          }}
          onKeyDown={onActivateKey(() => {
            if (!busy) onStart()
          })}
        >
          <rect
            x="530"
            y="610"
            width="380"
            height="72"
            rx="4"
            fill="#2f4a2a"
            stroke="#1b2d18"
            strokeWidth="3.2"
            filter="url(#vs-rough)"
          />
          <rect x="530" y="610" width="380" height="72" filter="url(#vs-grain)" clipPath="url(#vs-clip-enter-btn)" />
          <rect
            x="540"
            y="619"
            width="360"
            height="54"
            rx="2"
            fill="none"
            stroke="#c9b485"
            strokeWidth="1.6"
            opacity="0.78"
            filter="url(#vs-rough)"
          />
          <g fill="#1b2d18" stroke="#c9b485" strokeWidth="1.1">
            <circle cx="550" cy="629" r="3" />
            <circle cx="890" cy="629" r="3" />
            <circle cx="550" cy="663" r="3" />
            <circle cx="890" cy="663" r="3" />
          </g>
          <text
            x="720"
            y="656"
            fontSize="34"
            fontWeight="700"
            letterSpacing="1.5"
            textAnchor="middle"
            className="vb-cream vb-pencil"
          >
            마을로 들어가기
          </text>
        </g>
      </svg>

      {error && (
        <p role="alert" className="rs-incorrect gm-start-error">
          {error}
        </p>
      )}
    </div>
  )
}
