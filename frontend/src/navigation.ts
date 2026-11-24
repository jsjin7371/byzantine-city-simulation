export const navigation = [
  { id: 'setup', label: '실험 설정', href: '#/setup' },
  { id: 'results', label: '결과 탐색', href: '#/results' },
  { id: 'compare', label: '실험 비교', href: '#/compare' },
  { id: 'game', label: 'AI 주민을 속여라', href: '#/game' },
] as const

export type PageId = (typeof navigation)[number]['id']

export function readPageFromHash(): PageId {
  return navigation.find((item) => item.href === window.location.hash)?.id ?? 'setup'
}
