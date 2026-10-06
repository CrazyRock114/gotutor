import { useMemo, useState } from 'preact/hooks'
import type { Cls, TurnData } from '../types'
import { CLS_COLOR, CLS_LABEL } from '../types'

interface Props {
  turns: TurnData[]
  status: string
  onSeek: (i: number) => void
}

const MIN_FILTERS: { value: number; label: string }[] = [
  { value: 5, label: '≥5点' },
  { value: 1.5, label: '≥1.5点' },
  { value: 0.5, label: '全部(≥0.5)' },
]

export default function MistakeList({ turns, status, onSeek }: Props) {
  const [minLoss, setMinLoss] = useState(1.5)

  const mistakes = useMemo(
    () =>
      turns
        .filter((t) => t.loss != null && t.loss >= minLoss && (t.cls === 'mistake' || t.cls === 'blunder' || t.cls === 'slip'))
        .sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0)),
    [turns, minLoss],
  )

  return (
    <section class="panel">
      <h3>
        失误跳转<span class="dim">({status === 'running' ? '分析中…' : `${mistakes.length} 处`})</span>
      </h3>
      <div class="chip-row">
        {MIN_FILTERS.map((f) => (
          <button
            key={f.value}
            class={`chip ${minLoss === f.value ? 'chip-active' : ''}`}
            onClick={() => setMinLoss(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {mistakes.length === 0 ? (
        <p class="dim">暂无符合条件的失误{status === 'running' ? ',分析继续中…' : '。这局下得很稳!'}</p>
      ) : (
        <div class="mistake-list">
          {mistakes.map((t) => (
            <button class="mistake-row" key={t.turn} onClick={() => onSeek(t.turn + 1)} title="跳到这一手之后">
              <span class="m-badge" style={`background:${CLS_COLOR[t.cls as Cls]}`}>
                {CLS_LABEL[t.cls as Cls]}
              </span>
              <span class="m-move">
                第{t.turn + 1}手 <b>{t.player === 'B' ? '黑' : '白'}</b> {t.move ?? 'pass'}
              </span>
              <span class="m-loss" style={`color:${CLS_COLOR[t.cls as Cls]}`}>
                -{(t.loss ?? 0).toFixed(1)}点
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
