import { navigation } from '../navigation'
import type { PageId } from '../navigation'

export function AppHeader({ currentPage }: { currentPage: PageId }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <a className="brand" href="#/setup" aria-label="비잔틴 도시 시뮬레이션 홈">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 5 35 16 29 34H11L5 16Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <g fill="currentColor">
              <circle cx="20" cy="5" r="3" /><circle cx="35" cy="16" r="3" />
              <circle cx="29" cy="34" r="3" /><circle cx="11" cy="34" r="3" />
              <circle cx="5" cy="16" r="3" />
            </g>
          </svg>
          <span><strong>비잔틴 도시 시뮬레이션</strong><small>CITY CONSENSUS LAB</small></span>
        </a>
        <nav className="main-nav" aria-label="주요 메뉴">
          {navigation.map((item) => (
            <a key={item.id} href={item.href} aria-current={currentPage === item.id ? 'page' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <span className="topology-label">도시 <strong>5</strong>개 · 원형 연결</span>
      </div>
    </header>
  )
}
