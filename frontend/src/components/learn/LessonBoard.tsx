import { BoundedGoban } from '@sabaki/shudan'
import '@sabaki/shudan/css/goban.css'
import { useMemo, useState } from 'preact/hooks'
import Board from '@sabaki/go-board'
import type { BoardView } from '../../learn/types'
import { gtpToVertex } from '../../goban-utils'

function baseBoard(size: number, stones?: [number, number, number][]): Board {
  let b = Board.fromDimensions(size)
  for (const [x, y, sign] of stones ?? []) {
    if (b.has([x, y])) b = b.set([x, y], sign as 1 | -1)
  }
  return b
}

/** 课程演示棋盘:静态摆子 + 可单步播放的演示着法 + 标记/领地 */
export default function LessonBoard({ view }: { view: BoardView }) {
  const hasMoves = (view.moves?.length ?? 0) > 0
  const [idx, setIdx] = useState(hasMoves ? 0 : 0)

  const { signMap, lastVertex } = useMemo(() => {
    let b = baseBoard(view.size, view.stones)
    let last: [number, number] | null = null
    const n = Math.min(idx, view.moves?.length ?? 0)
    for (let i = 0; i < n; i++) {
      const [color, gtp] = view.moves![i]
      const v = gtpToVertex(gtp, view.size)
      if (v) {
        try {
          b = b.makeMove(color === 'B' ? 1 : -1, v, {})
          last = v
        } catch {
          /* 演示数据异常时跳过 */
        }
      }
    }
    return { signMap: b.signMap, lastVertex: last }
  }, [view, idx])

  const markerMap = useMemo(() => {
    const grid: ({ type: 'circle' | 'cross' | 'triangle' | 'square' | 'point' | 'loader' | 'label'; label?: string } | null)[][] = Array.from({ length: view.size }, () =>
      Array.from({ length: view.size }, () => null),
    )
    for (const m of view.marks ?? []) {
      const [x, y] = m.v
      if (grid[y] && grid[y][x] !== undefined) grid[y][x] = { type: m.type, label: m.label }
    }
    if (lastVertex) {
      const [x, y] = lastVertex
      if (!grid[y][x]) grid[y][x] = { type: 'circle' }
    }
    return grid
  }, [view, lastVertex])

  const paintMap = useMemo(() => {
    if (!view.paint?.length) return undefined
    const grid: (0 | 1 | -1)[][] = Array.from({ length: view.size }, () =>
      Array.from({ length: view.size }, () => 0 as 0 | 1 | -1),
    )
    for (const [x, y, who] of view.paint) {
      // BoardView 约定 1=黑;shudan paint -1=涂黑
      if (grid[y]) grid[y][x] = (who === 1 ? -1 : 1) as 0 | 1 | -1
    }
    return grid
  }, [view])

  const total = view.moves?.length ?? 0

  return (
    <div class="lesson-board">
      <div class="goban-wrap">
        <BoundedGoban
          maxWidth={460}
          maxHeight={460}
          signMap={signMap}
          markerMap={markerMap}
          paintMap={paintMap}
          showCoordinates={view.size >= 9}
          fuzzyStonePlacement
        />
      </div>
      {hasMoves && (
        <div class="demo-controls">
          <button onClick={() => setIdx(0)} title="回到初始">⏮</button>
          <button onClick={() => setIdx(Math.max(0, idx - 1))} title="上一演示">◀</button>
          <span class="dim">
            演示 {idx}/{total}
          </span>
          <button onClick={() => setIdx(Math.min(total, idx + 1))} title="下一演示">▶</button>
          <button onClick={() => setIdx(total)} title="播完">⏭</button>
        </div>
      )}
      {view.caption && <p class="board-caption">{view.caption}</p>}
    </div>
  )
}
