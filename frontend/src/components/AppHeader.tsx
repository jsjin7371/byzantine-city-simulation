import { navigation } from '../navigation'
import type { PageId } from '../navigation'
import './AppHeader.css'

export function AppHeader({ currentPage }: { currentPage: PageId }) {
  return (
    <header className="site-header">
        <a className="site-brand" href="#/setup" aria-label="Byzantine City Simulation 홈">
          <svg viewBox="0 0 28 28" aria-hidden="true">
            <path d="M14 3 25 11 21 24H7L3 11Z"/>
            <path d="M14 3v11M25 11l-11 3M21 24l-7-10M7 24l7-10M3 11l11 3"/>
          </svg>
          <span>Byzantine City Simulation</span>
        </a>
        <nav className="site-navigation" aria-label="주요 메뉴">
          {navigation.map((item) => (
            <a key={item.id} href={item.href} aria-current={currentPage === item.id ? 'page' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
    </header>
  )
}
