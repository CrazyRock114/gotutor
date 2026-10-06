// 学习进度(localStorage,无账号体系)
import type { Chapter } from './types'

const KEY = 'gotutor.progress.v1'

export interface Progress {
  [lessonId: string]: { done: boolean; at: number }
}

export function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

export function markLessonDone(lessonId: string) {
  const p = loadProgress()
  p[lessonId] = { done: true, at: Date.now() }
  localStorage.setItem(KEY, JSON.stringify(p))
}

export function resetProgress() {
  localStorage.removeItem(KEY)
}

export interface ChapterProgress {
  done: number
  total: number
}

export function chapterProgress(chapter: Chapter, progress: Progress): ChapterProgress {
  const done = chapter.lessons.filter((l) => progress[l.id]?.done).length
  return { done, total: chapter.lessons.length }
}

/** 全部课程中第一个未完成的课(用于"继续学习") */
export function firstUnfinished(chapters: Chapter[], progress: Progress): { chapter: Chapter; index: number } | null {
  for (const c of chapters) {
    for (let i = 0; i < c.lessons.length; i++) {
      if (!progress[c.lessons[i].id]?.done) return { chapter: c, index: i }
    }
  }
  return null
}
