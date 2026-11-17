import { useEffect, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { navigation, readPageFromHash } from './navigation'
import { SetupPage } from './pages/SetupPage'
import { ResultsPage } from './pages/ResultsPage'
import { ComparePage } from './pages/ComparePage'
import './App.css'
import { createExperimentDraft } from './experimentForm'
import { useExperiment } from './useExperiment'

function App() {
  const [page, setPage] = useState(readPageFromHash)
  // 페이지 밖에서 관리해 메뉴를 바꿔도 입력값과 실행 상태 조회를 유지한다.
  // 브라우저 저장소에는 보관하지 않으므로 새로고침하면 초기화된다.
  const [draft, setDraft] = useState(createExperimentDraft)
  const run = useExperiment()

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
        {page === 'setup' && <SetupPage draft={draft} onDraftChange={setDraft} run={run} />}
        {page === 'results' && <ResultsPage />}
        {page === 'compare' && <ComparePage />}
      </main>
      <footer className="app-footer">
        <span>Byzantine City Simulation</span><span>5팀 (사공우혁, 장민서, 장성진, 최서연, 우재원)</span>
      </footer>
    </div>
  )
}

export default App
