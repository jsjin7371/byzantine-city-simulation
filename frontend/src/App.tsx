import { useEffect, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { navigation, readPageFromHash } from './navigation'
import { SetupPage } from './pages/SetupPage'
import { ResultsPage } from './pages/ResultsPage'
import { ComparePage } from './pages/ComparePage'
import './App.css'

function App() {
  const [page, setPage] = useState(readPageFromHash)

  // 메뉴 주소를 해시로 유지해 새로고침과 브라우저 뒤로 가기도 지원한다.
  useEffect(() => {
    const handleHashChange = () => setPage(readPageFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    const current = navigation.find((item) => item.id === page)
    document.title = `${current?.label} | 비잔틴 도시 시뮬레이션`
  }, [page])

  return (
    <div className="app-shell">
      <button className="skip-link" onClick={() => document.getElementById('main-content')?.focus()}>
        본문으로 이동
      </button>
      <AppHeader currentPage={page} />
      <main id="main-content" className="main-content" tabIndex={-1}>
        {page === 'setup' && <SetupPage />}
        {page === 'results' && <ResultsPage />}
        {page === 'compare' && <ComparePage />}
      </main>
      <footer className="app-footer">
        <span>Byzantine City Simulation</span><span>설정하고, 관찰하고, 비교하기</span>
      </footer>
    </div>
  )
}

export default App
