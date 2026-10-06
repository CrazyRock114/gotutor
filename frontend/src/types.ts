export type Cls = 'best' | 'ok' | 'slip' | 'mistake' | 'blunder'
export type Color = 'B' | 'W'

export interface TopMove {
  move: string | null
  visits: number
  winrate: number // 行棋方视角,百分数
  scoreLead: number // 行棋方视角,目
  pv: string[]
}

export interface TurnData {
  turn: number
  player: Color
  move: string | null // GTP 顶点或 null(停着)
  winrateBlack: number // 黑视角胜率 %
  scoreLeadBlack: number // 黑视角目差
  loss: number | null // 失点(胜率百分点)
  cls: Cls
  topMoves: TopMove[]
  visits: number
  ownership?: number[] // 黑视角,行主序,左上角起
}

export interface MoveRec {
  player: Color
  move: string | null
}

export interface MistakeRec {
  turn: number
  player: Color
  move: string | null
  loss: number
  cls: Cls
}

export interface Summary {
  counts: Record<Cls, number>
  topMistakes: MistakeRec[]
  winrateBlackFinal: number | null
  scoreLeadBlackFinal: number | null
}

export interface Snapshot {
  gameId: string
  meta: Record<string, string>
  status: 'running' | 'done' | 'error'
  error: string | null
  summary: Summary | null
  visits: number
  boardSize: number
  komi: number
  rules: string
  handicap: number
  initialStones: [Color, string][]
  moves: MoveRec[]
  turns: TurnData[]
}

export const CLS_LABEL: Record<Cls, string> = {
  best: '最佳',
  ok: '正着',
  slip: '小损',
  mistake: '错着',
  blunder: '大失误',
}

export const CLS_COLOR: Record<Cls, string> = {
  best: '#059669',
  ok: '#84cc16',
  slip: '#eab308',
  mistake: '#f97316',
  blunder: '#ef4444',
}
