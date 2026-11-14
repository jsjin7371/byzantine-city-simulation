export const percent = (value: number) => `${Number((value * 100).toFixed(2))}%`
export const truths = { danger: '위험', safe: '안전' }
export const decisions = { evacuate: '대피', stay: '잔류' }
export const sends = { normal: '정상', dropped: '누락', flipped: '조작' }
export const statuses = { pending: '준비 중', running: '진행 중', completed: '완료', failed: '실패' }
export const received = (value: keyof typeof decisions | null) => value === null ? '없음' : decisions[value]
