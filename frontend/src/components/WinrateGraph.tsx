import type { TurnData } from '../types'

interface Props {
  turns: TurnData[]
  total: number
  k: number
  onSeek: (i: number) => void
}

const W = 600
const H = 140
const PAD = 6

function yOf(wr: number): number {
  return PAD + (1 - wr / 100) * (H - PAD * 2)
}

export default function WinrateGraph({ turns, total, k, onSeek }: Props) {
  if (turns.length === 0) {
    return <div class="wr-empty dim">分析开始后显示</div>
  }

  const xs = (turn: number) => (total > 1 ? (turn / total) * W : W / 2)
  const points = turns.map((t) => `${xs(t.turn)},${yOf(t.winrateBlack)}`)
  const areaPath = `M0,${H} L${points.join(' L')} L${W},${H} Z`

  function onClick(e: MouseEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    onSeek(Math.round(frac * total))
  }

  const cursorX = xs(k)
  const curWr = k < turns.length ? turns[k].winrateBlack : turns[turns.length - 1].winrateBlack

  return (
    <svg
      class="wr-graph"
      viewBox={`0 0 ${W} ${H}`}
      onClick={onClick}
      preserveAspectRatio="none"
      style="width:100%;height:auto;cursor:crosshair"
    >
      {/* 黑胜区域(下半)+ 白胜区域(上半)底色 */}
      <rect x={0} y={0} width={W} height={H} fill="#f8fafc" />
      <rect x={0} y={yOf(50)} width={W} height={H - yOf(50)} fill="#e2e8f0" opacity={0.55} />
      {/* 50% 线 */}
      <line x1={0} y1={yOf(50)} x2={W} y2={yOf(50)} stroke="#94a3b8" stroke-dasharray="4 4" stroke-width={1} />
      {/* 胜率曲线与区域 */}
      <path d={areaPath} fill="#1e293b" opacity={0.08} />
      <polyline points={points.join(' ')} fill="none" stroke="#0f172a" stroke-width={1.6} />
      {/* 失误点 */}
      {turns.map((t) =>
        t.cls === 'mistake' || t.cls === 'blunder' ? (
          <circle
            key={t.turn}
            cx={xs(Math.min(t.turn + 1, total))}
            cy={yOf(t.winrateBlack)}
            r={t.cls === 'blunder' ? 5 : 3.5}
            fill={t.cls === 'blunder' ? '#ef4444' : '#f97316'}
            stroke="#fff"
            stroke-width={1}
          />
        ) : null,
      )}
      {/* 当前手游标 */}
      <line x1={cursorX} y1={0} x2={cursorX} y2={H} stroke="#16a34a" stroke-width={2} />
      <text x={Math.min(cursorX + 6, W - 64)} y={yOf(curWr) - 6} font-size={16} fill="#0f172a" font-weight="600">
        {curWr.toFixed(0)}%
      </text>
    </svg>
  )
}
