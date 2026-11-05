import type { ReactNode } from 'react'

type EmptyStateProps = { title: string; description: string; children?: ReactNode; compact?: boolean }

export function EmptyState({ title, description, children, compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      <span className="empty-mark" aria-hidden="true">—</span>
      <h3>{title}</h3><p>{description}</p>
      {children}
    </div>
  )
}
