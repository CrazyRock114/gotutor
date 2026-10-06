import { useEffect, useState } from 'preact/hooks'
import type { Snapshot } from './types'
import { createGame, fetchGame } from './api'
import UploadPage from './components/UploadPage'
import ReviewPage from './components/ReviewPage'
import LearnHome from './components/learn/LearnHome'
import LessonView from './components/learn/LessonView'
import PlayPage from './components/play/PlayPage'
import { chapters } from './courses'

type View = 'learn' | 'play' | 'review'

export default function App() {
  const [view, setView] = useState<View>(() => (window.location.hash.startsWith('#g=') ? 'review' : 'learn'))
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // 课程导航状态
  const [lessonOpen, setLessonOpen] = useState<{ chapterId: string; index: number } | null>(null)

  // 刷新/分享链接恢复:#g=<gameId>
  useEffect(() => {
    const m = window.location.hash.match(/^#g=(\w+)/)
    if (m) {
      fetchGame(m[1])
        .then((s) => {
          setSnapshot(s)
          setView('review')
        })
        .catch(() => {
          setError('链接指向的对局不存在(服务重启后对局数据会清除),请重新上传或对弈')
          history.replaceState(null, '', window.location.pathname)
        })
    }
  }, [])

  function openSnapshot(s: Snapshot) {
    setSnapshot(s)
    setView('review')
    window.location.hash = `g=${s.gameId}`
  }

  function backHome() {
    setSnapshot(null)
    setLessonOpen(null)
    setView('learn')
    history.replaceState(null, '', window.location.pathname)
  }

  async function submit(sgf: string, visits: number) {
    setError(null)
    setSubmitting(true)
    try {
      const { gameId } = await createGame(sgf, visits)
      const snap = await fetchGame(gameId)
      openSnapshot(snap)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  function openLesson(chapterId: string, index: number) {
    setLessonOpen({ chapterId, index })
    window.scrollTo(0, 0)
  }

  const lessonChapter = lessonOpen ? chapters.find((c) => c.id === lessonOpen.chapterId) : null

  return (
    <div class="app">
      <header class="topbar">
        <div class="topbar-inner">
          <span class="logo" onClick={backHome}>
            Gotutor<span class="logo-sub">AI 围棋教室</span>
          </span>
          <nav class="topnav">
            <button class={`nav-link ${view === 'learn' ? 'active' : ''}`} onClick={() => { setView('learn'); setLessonOpen(null) }}>
              入门课程
            </button>
            <button class={`nav-link ${view === 'play' ? 'active' : ''}`} onClick={() => setView('play')}>
              对弈
            </button>
            <button class={`nav-link ${view === 'review' ? 'active' : ''}`} onClick={() => setView('review')}>
              AI 复盘
            </button>
          </nav>
        </div>
      </header>
      <main class="main">
        {error && <div class="banner banner-error">{error}</div>}
        {view === 'review' ? (
          snapshot ? (
            <ReviewPage initial={snapshot} />
          ) : (
            <UploadPage onSubmit={submit} submitting={submitting} />
          )
        ) : view === 'play' ? (
          <PlayPage onSubmitReview={(sgf) => submit(sgf, 120)} />
        ) : lessonChapter && lessonOpen ? (
          <LessonView
            chapter={lessonChapter}
            lessonIndex={lessonOpen.index}
            onBack={() => setLessonOpen(null)}
            onNavigate={(ch, i) => openLesson(ch.id, i)}
          />
        ) : (
          <LearnHome chapters={chapters} onOpenLesson={(ch, i) => openLesson(ch.id, i)} />
        )}
      </main>
      <footer class="footer">
        引擎 KataGo · 前端 Preact + Shudan · 仅用于学习研究
      </footer>
    </div>
  )
}
