import Board from '@sabaki/go-board'
import type { Color, MoveRec, TurnData } from './types'

export type Vertex = [number, number] // [x, y],y=0 为顶行(与 shudan/go-board 一致)

const GTP_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

/** GTP 顶点("Q16"/"pass")→ [x,y];pass 返回 null */
export function gtpToVertex(gtp: string | null, size: number): Vertex | null {
  if (!gtp || gtp.toLowerCase() === 'pass') return null
  const letter = gtp[0].toUpperCase()
  const x = GTP_LETTERS.indexOf(letter)
  const num = parseInt(gtp.slice(1), 10)
  if (x < 0 || Number.isNaN(num)) return null
  return [x, size - num]
}

/** [x,y] → GTP 顶点字符串 */
export function vertexToGtp(v: Vertex): string {
  return `${GTP_LETTERS[v[0]]}${v[1] + 1}` // 显示用:行号从下往上
}

export function vertexLabel(v: Vertex | null): string {
  if (!v) return 'pass'
  return vertexToGtp(v)
}

/**
 * 局面重放:positions[k] = 初始摆子 + 前 k 手之后的 Board(不可变)。
 * 带缓存,导航时按需计算。
 */
export class GameReplay {
  private cache: Board[] = []

  constructor(
    public size: number,
    initialStones: [Color, string][],
    private moves: MoveRec[],
  ) {
    let b = Board.fromDimensions(size)
    for (const [color, gtp] of initialStones) {
      const v = gtpToVertex(gtp, size)
      if (v) b = b.set(v, color === 'B' ? 1 : -1)
    }
    this.cache.push(b) // cache[0] = 初始局面(含摆子)
  }

  /** 前 k 手之后的局面(k ∈ [0, moves.length]) */
  at(k: number): Board {
    k = Math.max(0, Math.min(k, this.moves.length))
    if (this.cache[k]) return this.cache[k]
    let board = this.at(k - 1)
    const { player, move } = this.moves[k - 1]
    const v = gtpToVertex(move, this.size)
    if (v) {
      try {
        board = board.makeMove(player === 'B' ? 1 : -1, v, {
          preventOverwrite: false,
          preventSuicide: false,
          preventKo: false,
        })
      } catch {
        // 非法着(罕见)——沿用上一局面,前端不应因脏数据崩溃
      }
    }
    this.cache[k] = board
    return board
  }
}

/** ownership(黑视角,长度 size²)→ shudan paintMap[y][x]:-1 涂黑领地,+1 涂白领地,0 不涂 */
export function ownershipToPaintMap(ownership: number[], size: number): (0 | 1 | -1)[][] {
  const grid: (0 | 1 | -1)[][] = []
  for (let y = 0; y < size; y++) {
    const row: (0 | 1 | -1)[] = []
    for (let x = 0; x < size; x++) {
      const o = ownership[y * size + x] ?? 0
      row.push(o >= 0.35 ? -1 : o <= -0.35 ? 1 : 0)
    }
    grid.push(row)
  }
  return grid
}

export interface LossDot {
  vertex: Vertex
  cls: TurnData['cls']
  loss: number
  title: string
}

/** 收集前 k 手中需要画的失点标记(带颜色),pass 跳过 */
export function collectLossDots(turns: TurnData[], uptoK: number, size: number): LossDot[] {
  const dots: LossDot[] = []
  for (const t of turns) {
    if (t.turn >= uptoK) break
    if (t.move == null || t.loss == null) continue
    if (t.cls === 'best' || t.cls === 'ok') continue
    const v = gtpToVertex(t.move, size)
    if (v) {
      dots.push({ vertex: v, cls: t.cls, loss: t.loss, title: `第${t.turn + 1}手 ${vertexLabel(v)} 失${t.loss}点` })
    }
  }
  return dots
}
