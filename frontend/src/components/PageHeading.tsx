type PageHeadingProps = { eyebrow: string; title: string; description: string }

export function PageHeading({ eyebrow, title, description }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}
