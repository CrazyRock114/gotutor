import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Chapter, Lesson, Step } from '../../learn/types'
import { markLessonDone, loadProgress } from '../../learn/progress'
import LessonBoard from './LessonBoard'
import { ClickExerciseView, ChoiceExerciseView, SeqExerciseView } from './ExerciseBoard'

interface Props {
  chapter: Chapter
  lessonIndex: number
  onBack: () => void
  onNavigate: (chapter: Chapter, lessonIndex: number) => void
}

function StepView({ step, onSolved }: { step: Step; onSolved: () => void }) {
  return (
    <div class="lesson-step">
      <h2>{step.title}</h2>
      {step.body && (
        <div class="lesson-body">
          {step.body!.split('\n\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
      {step.tip && <p class="tip-box">💡 {step.tip}</p>}
      {step.board && <LessonBoard view={step.board} />}
      {step.exercise &&
        (step.exercise.kind === 'click' ? (
          <ClickExerciseView ex={step.exercise} onSolved={onSolved} />
        ) : step.exercise.kind === 'seq' ? (
          <SeqExerciseView ex={step.exercise} onSolved={onSolved} />
        ) : (
          <ChoiceExerciseView ex={step.exercise} onSolved={onSolved} />
        ))}
    </div>
  )
}

export default function LessonView({ chapter, lessonIndex, onBack, onNavigate }: Props) {
  const lesson: Lesson = chapter.lessons[lessonIndex]
  const [idx, setIdx] = useState(0)
  const [solvedSteps, setSolvedSteps] = useState<Set<number>>(new Set())
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    // 切课时重置
    setIdx(0)
    setSolvedSteps(new Set())
    setFinished(false)
    window.scrollTo(0, 0)
  }, [lesson.id])

  const step = lesson.steps[idx]
  const exerciseTotal = useMemo(() => lesson.steps.filter((s) => s.exercise).length, [lesson])
  const solvedCount = [...solvedSteps].filter((i) => lesson.steps[i]?.exercise).length

  function next() {
    if (idx < lesson.steps.length - 1) {
      setIdx(idx + 1)
      window.scrollTo(0, 0)
    } else {
      markLessonDone(lesson.id)
      setFinished(true)
      window.scrollTo(0, 0)
    }
  }

  const isLast = idx >= lesson.steps.length - 1
  const stepNeedsSolve = !!step.exercise && !solvedSteps.has(idx)
  const progressPct = Math.round(((idx + 1) / lesson.steps.length) * 100)

  if (finished) {
    // 找下一课
    const nextInChapter = lessonIndex + 1 < chapter.lessons.length ? { ch: chapter, i: lessonIndex + 1 } : null
    return (
      <div class="lesson-finish">
        <div class="finish-card">
          <h1>🎉 完成课程!</h1>
          <p>
            你已学完「{chapter.title} · {lesson.title}」
            {exerciseTotal > 0 ? `,练习 ${solvedCount}/${exerciseTotal} 全部通过` : ''}。
          </p>
          <div class="finish-actions">
            <button class="btn" onClick={onBack}>返回课程目录</button>
            {nextInChapter && (
              <button class="btn btn-primary" onClick={() => onNavigate(nextInChapter.ch, nextInChapter.i)}>
                下一课:{chapter.lessons[lessonIndex + 1].title} →
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="lesson-view">
      <div class="lesson-topbar">
        <button class="btn btn-ghost" onClick={onBack}>← {chapter.title}</button>
        <span class="dim">
          {lesson.title} · 第 {idx + 1}/{lesson.steps.length} 步
          {exerciseTotal > 0 ? ` · 练习 ${solvedCount}/${exerciseTotal}` : ''}
        </span>
      </div>
      <div class="lesson-progress">
        <div class="progress-fill" style={`width:${progressPct}%`} />
      </div>

      <StepView
        step={step}
        onSolved={() => setSolvedSteps((prev) => new Set(prev).add(idx))}
      />

      <div class="lesson-nav">
        <button class="btn" disabled={idx === 0} onClick={() => { setIdx(idx - 1); window.scrollTo(0, 0) }}>
          ← 上一步
        </button>
        {stepNeedsSolve ? (
          <span class="dim">先完成上面的练习,再继续 →</span>
        ) : (
          <button class="btn btn-primary" onClick={next}>
            {isLast ? '完成本课 🎉' : '下一步 →'}
          </button>
        )}
      </div>
      {finished && null}
      <input type="hidden" value={loadProgress()[lesson.id]?.done ? 1 : 0} />
    </div>
  )
}
