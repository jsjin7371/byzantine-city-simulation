// 시작 화면(vs)과 마을 보드(vb)가 함께 쓰는 SVG 필터·그라디언트·그림 조각.
// 각 SVG의 <defs> 안에서 직접 렌더해 cross-SVG 참조 호환성 문제를 피한다.
export function SharedVillageDefs({ prefix }: { prefix: 'vs' | 'vb' }) {
  return (
    <>
      <filter id={`${prefix}-rough`} x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id={`${prefix}-mottle`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves={3} seed={11} />
        <feColorMatrix values="0 0 0 0 .17  0 0 0 0 .29  0 0 0 0 .1  1.5 0 0 0 -.6" />
      </filter>
      <filter id={`${prefix}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} />
        <feColorMatrix values="0 0 0 0 .25  0 0 0 0 .18  0 0 0 0 .08  .5 0 0 0 -.2" />
      </filter>
      <radialGradient id={`${prefix}-lamp`}>
        <stop offset="0" stopColor="#ffe27a" stopOpacity=".95" />
        <stop offset="1" stopColor="#ffd35a" stopOpacity="0" />
      </radialGradient>
      <g id={`${prefix}-tree`}>
        <ellipse cx="3" cy="16" rx="20" ry="6" fill="#2a3d1d" opacity=".35" />
        <circle r="19" fill="#2f4a28" />
        <circle cx="-7" cy="-6" r="10" fill="#46652f" />
        <circle cx="6" cy="-9" r="6" fill="#5e8040" />
      </g>
      <g id={`${prefix}-hut`}>
        <ellipse cx="2" cy="4" rx="50" ry="9" fill="#3a2a14" opacity=".28" />
        <path d="M-35 2 L-35 -32 L35 -32 L35 2 Z" fill="#e8cf9c" stroke="#3b2a1a" strokeWidth="2.2" />
        <path d="M-6 2 V-16 Q0 -23 6 -16 V2 Z" fill="#6b4a2a" stroke="#3b2a1a" strokeWidth="1.5" />
        <path d="M-46 -28 Q-26 -66 0 -70 Q26 -66 46 -28 Q0 -36 -46 -28 Z" fill="#b5763d" stroke="#3b2a1a" strokeWidth="2.2" />
        <path d="M-30 -36 L-18 -58 M-14 -34 L-6 -64 M2 -34 L6 -65 M16 -35 L20 -60 M30 -34 L32 -48" stroke="#7e4d22" strokeWidth="1.6" fill="none" />
      </g>
      {/* 마피아 집: 어두운 지붕 */}
      <g id={`${prefix}-hut-dark`}>
        <ellipse cx="2" cy="4" rx="50" ry="9" fill="#3a2a14" opacity=".28" />
        <path d="M-35 2 L-35 -32 L35 -32 L35 2 Z" fill="#cdbb98" stroke="#3b2a1a" strokeWidth="2.4" />
        <path d="M-46 -28 Q-26 -66 0 -70 Q26 -66 46 -28 Q0 -36 -46 -28 Z" fill="#4e3f35" stroke="#2a1f17" strokeWidth="2.4" />
        <rect x="-8" y="-24" width="16" height="13" fill="#3e352c" stroke="#3b2a1a" strokeWidth="2" />
      </g>
      <g id={`${prefix}-win-on`}>
        <circle r="22" fill={`url(#${prefix}-lamp)`} />
        <rect x="-8" y="-7" width="16" height="14" fill="#ffd35a" stroke="#3b2a1a" strokeWidth="2" />
        <path d="M0 -7 V7 M-8 0 H8" stroke="#3b2a1a" strokeWidth="1.3" />
      </g>
      <g id={`${prefix}-win-off`}>
        <rect x="-8" y="-7" width="16" height="14" fill="#3e352c" stroke="#3b2a1a" strokeWidth="2" />
        <path d="M0 -7 V7 M-8 0 H8" stroke="#6b5d4b" strokeWidth="1.3" />
      </g>
    </>
  )
}
