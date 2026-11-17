import { useId } from 'react'
import type { ReactNode } from 'react'

type PanelProps = {
  title: string
  description?: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ title, description, aside, children, className = '' }: PanelProps) {
  const headingId = useId()
  return (
    <section className={`panel ${className}`} aria-labelledby={headingId}>
      <div className="panel-heading">
        <div><h2 id={headingId}>{title}</h2>{description && <p>{description}</p>}</div>
        {aside}
      </div>
      {children}
    </section>
  )
}
