import type { Chapter } from '../../learn/types'
import { chapterProgress, firstUnfinished, loadProgress, resetProgress, Progress } from '../../learn/progress'
import { useState } from 'preact/hooks'

interface Props {
  chapters: Chapter[]
  onOpenLesson: (chapter: Chapter, lessonIndex: number) => void
}

export default function LearnHome({ chapters, onOpenLesson }: Props) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress())
  const next = firstUnfinished(chapters, progress)
  const totalLessons = chapters.reduce((n, c) => n + c.lessons.length, 0)
  const doneLessons = Object.values(progress).filter((p) => p.done).length

  return (
    <div class="learn-home">
      <section class="learn-hero">
        <h1>零基础围棋入门</h1>
        <p>
          从"围棋是什么"到独立下完一盘棋。每个知识点都配有棋盘演示和动手练习,
          学练结合,不需要任何基础。
        </p>
        <div class="learn-hero-actions">
          {next ? (
            <button class="btn btn-primary" onClick={() => onOpenLesson(next.chapter, next.index)}>
              {doneLessons > 0 ? '继续学习' : '开始学习'} → {next.chapter.lessons[next.index].title}
            </button>
          ) : (
            <span class="good">🎉 恭喜,全部课程已完成!可以去「AI 复盘」分析你的对局了</span>
          )}
          <span class="dim">
            总进度 {doneLessons}/{totalLessons} 课
          </span>
          {doneLessons > 0 && (
            <button
              class="btn btn-ghost"
              title="清空学习进度"
              onClick={() => {
                resetProgress()
                setProgress(loadProgress())
              }}
            >
              重置进度
            </button>
          )}
        </div>
      </section>

      {chapters.map((ch, ci) => {
        const cp = chapterProgress(ch, progress)
        return (
          <section class="chapter-card" key={ch.id}>
            <header class="chapter-head">
              <span class="chapter-num">第 {ci + 1} 章</span>
              <h2>{ch.title}</h2>
              <p class="dim">{ch.desc}</p>
              <span class={`chapter-progress ${cp.done === cp.total ? 'all' : ''}`}>
                {cp.done}/{cp.total} 课
              </span>
            </header>
            <div class="lesson-list">
              {ch.lessons.map((l, li) => {
                const done = progress[l.id]?.done
                return (
                  <button class={`lesson-item ${done ? 'done' : ''}`} key={l.id} onClick={() => onOpenLesson(ch, li)}>
                    <span class="lesson-check">{done ? '✓' : li + 1}</span>
                    <span class="lesson-info">
                      <b>{l.title}</b>
                      <span class="dim">{l.summary}</span>
                    </span>
                    <span class="lesson-go">→</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
