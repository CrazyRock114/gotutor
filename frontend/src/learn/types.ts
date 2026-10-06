// 入门课程数据模型:章节 → 课 → 步骤(图文/棋盘演示/互动练习)

export type Color = 'B' | 'W'
export type MarkType = 'circle' | 'triangle' | 'cross' | 'square' | 'point' | 'label'

/** 棋盘展示视图:静态摆子 + 可选演示着法 + 标记/领地 */
export interface BoardView {
  size: number
  /** [x, y, 1(黑)|-1(白)],y=0 为顶行 */
  stones?: [number, number, number][]
  /** 演示着法序列(GTP 顶点),在 stones 基础上依次落子,可单步播放 */
  moves?: [Color, string][]
  marks?: { v: [number, number]; type: MarkType; label?: string }[]
  /** 领地示意 [x, y, 1(黑)|-1(白)] */
  paint?: [number, number, number][]
  caption?: string
}

/** 点击题:在棋盘上点出正确的一点(可多个正确答案),答对可自动演示后续 */
export interface ClickExercise {
  kind: 'click'
  id: string
  size: number
  stones: [number, number, number][]
  turn: Color
  prompt: string
  correct: [number, number][]
  /** 答对后自动演示(如"提子成功"的对手反应/提子结果) */
  reply?: [Color, string][]
  /** 特定错误点的针对性反馈,key = "x,y" */
  perWrong?: Record<string, string>
  wrongMsg: string
  successMsg: string
  hint?: string
}

/** 连续题:按顺序走出若干步正解(如征子、扑),每步对手有固定应手 */
export interface SeqExercise {
  kind: 'seq'
  id: string
  size: number
  stones: [number, number, number][]
  turn: Color
  prompt: string
  steps: { correct: [number, number]; reply?: [Color, [number, number]]; msg?: string }[]
  wrongMsg: string
  successMsg: string
  hint?: string
}

/** 选择题:规则知识 */
export interface ChoiceExercise {
  kind: 'choice'
  id: string
  prompt: string
  options: string[]
  correct: number
  explain: string
}

export type Exercise = ClickExercise | SeqExercise | ChoiceExercise

export interface Step {
  title: string
  body?: string
  tip?: string
  board?: BoardView
  exercise?: Exercise
}

export interface Lesson {
  id: string
  title: string
  summary: string
  steps: Step[]
}

export interface Chapter {
  id: string
  title: string
  desc: string
  lessons: Lesson[]
}

export function exerciseCount(steps: Step[]): number {
  return steps.filter((s) => s.exercise).length
}
