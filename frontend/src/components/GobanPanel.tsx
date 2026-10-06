import { BoundedGoban } from '@sabaki/shudan'
import '@sabaki/shudan/css/goban.css'
import { useMemo } from 'preact/hooks'
import type { MoveRec, TurnData } from '../types'
import { collectLossDots, gtpToVertex, GameReplay, ownershipToPaintMap } from '../goban-utils'

interface Props {
  size: number
  replay: GameReplay
  k: number // 已显示手数
  moves: MoveRec[]
  turns: TurnData[]
  showCandidates: boolean
  showTerritory: boolean
  showLoss: boolean
  onSeek: (i: number) => void
}

const CLS_COLOR: Record<string, string> = {
  slip: '#eab308',
  mistake: '#f97316',
  blunder: '#ef4444',
}

type ShudanMarker = {
  type: 'circle' | 'cross' | 'triangle' | 'square' | 'point' | 'loader' | 'label'
  label?: string
} | null

export default function GobanPanel(p: Props) {
  const board = p.replay.at(p.k)
  const signMap = board.signMap

  const lastMoveVertex = p.k > 0 ? gtpToVertex(p.moves[p.k - 1].move, p.size) : null
  // 候选点只在"该局面有专属报告"时显示;领地在终局(k=总手数)回退用最后一手报告
  const exactTurn = p.k < p.turns.length ? p.turns[p.k] : null
  const fallbackTurn = p.turns.length > 0 ? p.turns[p.turns.length - 1] : null
  const curTurn = exactTurn ?? fallbackTurn

  const markerMap = useMemo(() => {
    const grid: ShudanMarker[][] = Array.from({ length: p.size }, () =>
      Array.from({ length: p.size }, () => null),
    )
    if (lastMoveVertex) {
      const [x, y] = lastMoveVertex
      if (grid[y] && grid[y][x] !== undefined) grid[y][x] = { type: 'circle' }
    }
    if (p.showCandidates && exactTurn) {
      exactTurn.topMoves.slice(0, 3).forEach((m) => {
        const v = gtpToVertex(m.move, p.size)
        if (!v) return
        const [x, y] = v
        if (grid[y] && grid[y][x] !== undefined && !grid[y][x]) {
          grid[y][x] = { type: 'label', label: `${Math.round(m.winrate)}` }
        }
      })
    }
    return grid
  }, [p.k, p.showCandidates, curTurn, lastMoveVertex, p.size])

  const paintMap = useMemo(
    () =>
      p.showTerritory && curTurn?.ownership
        ? ownershipToPaintMap(curTurn.ownership, p.size)
        : undefined,
    [p.showTerritory, curTurn, p.size],
  )

  const lossDots = useMemo(
    () => (p.showLoss ? collectLossDots(p.turns, p.k, p.size) : []),
    [p.showLoss, p.turns, p.k, p.size],
  )

  function onVertexClick(_evt: unknown, [x, y]: [number, number]) {
    // 点击棋盘交叉点:跳到"该点落子"的那一手
    for (let i = 0; i < p.moves.length; i++) {
      const v = gtpToVertex(p.moves[i].move, p.size)
      if (v && v[0] === x && v[1] === y) {
        p.onSeek(i + 1)
        return
      }
    }
  }

  return (
    <div class="goban-wrap">
      <BoundedGoban
        maxWidth={620}
        maxHeight={620}
        signMap={signMap}
        markerMap={markerMap}
        paintMap={paintMap}
        showCoordinates
        fuzzyStonePlacement
        animateStonePlacement
        onVertexClick={onVertexClick}
      />
      {lossDots.length > 0 && (
        <div class="loss-layer">
          {lossDots.map((d, i) => (
            <span
              key={i}
              class={`loss-dot loss-${d.cls}`}
              title={d.title}
              style={`left:${((d.vertex[0] + 0.5) / p.size) * 100}%;top:${((d.vertex[1] + 0.5) / p.size) * 100}%`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
