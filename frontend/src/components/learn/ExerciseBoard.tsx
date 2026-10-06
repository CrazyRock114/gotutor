import { BoundedGoban } from '@sabaki/shudan'
import '@sabaki/shudan/css/goban.css'
import { useMemo, useState } from 'preact/hooks'
import Board from '@sabaki/go-board'
import type { ClickExercise, ChoiceExercise, SeqExercise } from '../../learn/types'
import { gtpToVertex } from '../../goban-utils'

function baseBoard(size: number, stones: [number, number, number][]): Board {
  let b = Board.fromDimensions(size)
  for (const [x, y, sign] of stones) {
    if (b.has([x, y])) b = b.set([x, y], sign as 1 | -1)
  }
  return b
}

type ShudanMarker = {
  type: 'circle' | 'cross' | 'triangle' | 'square' | 'point' | 'loader' | 'label'
  label?: string
} | null

interface Feedback {
  ok: boolean
  text: string
  showHint?: boolean
}

/** 点击题 */
export function ClickExerciseView({ ex, onSolved }: { ex: ClickExercise; onSolved: () => void }) {
  const [board, setBoard] = useState(() => baseBoard(ex.size, ex.stones))
  const [wrong, setWrong] = useState<[number, number] | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [solved, setSolved] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const markerMap = useMemo(() => {
    const grid: ShudanMarker[][] = Array.from({ length: ex.size }, () =>
      Array.from({ length: ex.size }, () => null),
    )
    if (wrong && !solved) {
      const [x, y] = wrong
      if (grid[y]) grid[y][x] = { type: 'cross' }
    }
    return grid
  }, [wrong, solved, ex.size])

  function onVertexClick(_e: unknown, [x, y]: [number, number]) {
    if (solved) return
    if (ex.correct.some(([cx, cy]) => cx === x && cy === y)) {
      // 答对:落子并演示后续着法
      let b = board
      try {
        b = b.makeMove(ex.turn === 'B' ? 1 : -1, [x, y], {})
      } catch {
        /* ignore */
      }
      for (const [color, gtp] of ex.reply ?? []) {
        const v = gtpToVertex(gtp, ex.size)
        if (v) {
          try {
            b = b.makeMove(color === 'B' ? 1 : -1, v, {})
          } catch {
            /* ignore */
          }
        }
      }
      setBoard(b)
      setWrong(null)
      setSolved(true)
      setFeedback({ ok: true, text: ex.successMsg })
      onSolved()
    } else {
      setWrong([x, y])
      const specific = ex.perWrong?.[`${x},${y}`]
      setFeedback({ ok: false, text: specific ?? ex.wrongMsg, showHint: true })
    }
  }

  return (
    <div class="exercise">
      <div class="exercise-body">
        <div class="goban-wrap">
          <BoundedGoban
            maxWidth={380}
            maxHeight={380}
            signMap={board.signMap}
            markerMap={markerMap}
            fuzzyStonePlacement
            onVertexClick={onVertexClick}
          />
        </div>
        <div class="exercise-side">
          <p class="exercise-prompt">
            <span class={`turn-badge ${ex.turn}`}>{ex.turn === 'B' ? '黑先' : '白先'}</span>
            {ex.prompt}
          </p>
          {feedback && <p class={`feedback ${feedback.ok ? 'ok' : 'bad'}`}>{feedback.text}</p>}
          {solved ? (
            <button class="btn" onClick={() => {
              setBoard(baseBoard(ex.size, ex.stones))
              setSolved(false)
              setFeedback(null)
              setWrong(null)
            }}>
              再练一次
            </button>
          ) : (
            <>
              {feedback && !feedback.ok && <p class="dim">点击棋盘再试一次{ex.reply ? '(正解会自动演示后续)' : ''}</p>}
              {ex.hint && (showHint ? <p class="hint-box">💡 {ex.hint}</p> : <button class="btn btn-ghost" onClick={() => setShowHint(true)}>看提示</button>)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 连续题(按顺序走正解链) */
export function SeqExerciseView({ ex, onSolved }: { ex: SeqExercise; onSolved: () => void }) {
  const [board, setBoard] = useState(() => baseBoard(ex.size, ex.stones))
  const [stepIdx, setStepIdx] = useState(0)
  const [wrong, setWrong] = useState<[number, number] | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [solved, setSolved] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const markerMap = useMemo(() => {
    const grid: ShudanMarker[][] = Array.from({ length: ex.size }, () =>
      Array.from({ length: ex.size }, () => null),
    )
    if (!solved && stepIdx < ex.steps.length) {
      // 无标记;错误点画叉
      if (wrong) {
        const [x, y] = wrong
        if (grid[y]) grid[y][x] = { type: 'cross' }
      }
    }
    return grid
  }, [wrong, solved, stepIdx, ex.size, ex.steps.length])

  function onVertexClick(_e: unknown, [x, y]: [number, number]) {
    if (solved) return
    const step = ex.steps[stepIdx]
    if (!step) return
    if (step.correct[0] === x && step.correct[1] === y) {
      let b = board
      try {
        b = b.makeMove(ex.turn === 'B' ? 1 : -1, [x, y], {})
      } catch {
        /* ignore */
      }
      if (step.reply) {
        const [color, v] = step.reply
        try {
          b = b.makeMove(color === 'B' ? 1 : -1, v, {})
        } catch {
          /* ignore */
        }
      }
      setBoard(b)
      setWrong(null)
      const nextIdx = stepIdx + 1
      if (nextIdx >= ex.steps.length) {
        setSolved(true)
        setFeedback({ ok: true, text: ex.successMsg })
        onSolved()
      } else {
        setStepIdx(nextIdx)
        setFeedback({ ok: true, text: step.msg ?? '✅ 正确!继续。' })
      }
    } else {
      setWrong([x, y])
      setFeedback({ ok: false, text: ex.wrongMsg, showHint: true })
    }
  }

  function reset() {
    setBoard(baseBoard(ex.size, ex.stones))
    setStepIdx(0)
    setWrong(null)
    setFeedback(null)
    setSolved(false)
    setShowHint(false)
  }

  return (
    <div class="exercise">
      <div class="exercise-body">
        <div class="goban-wrap">
          <BoundedGoban
            maxWidth={380}
            maxHeight={380}
            signMap={board.signMap}
            markerMap={markerMap}
            fuzzyStonePlacement
            onVertexClick={onVertexClick}
          />
        </div>
        <div class="exercise-side">
          <p class="exercise-prompt">
            <span class={`turn-badge ${ex.turn}`}>{ex.turn === 'B' ? '黑先' : '白先'}</span>
            {ex.prompt}
            {!solved && <span class="dim">(第 {stepIdx + 1}/{ex.steps.length} 步)</span>}
          </p>
          {feedback && <p class={`feedback ${feedback.ok ? 'ok' : 'bad'}`}>{feedback.text}</p>}
          {solved ? (
            <button class="btn" onClick={reset}>再练一次</button>
          ) : (
            <>
              <p class="dim">点击棋盘走出正解{ex.steps.some((s) => s.reply) ? ',对手会自动应对' : ''}</p>
              {ex.hint && (showHint ? <p class="hint-box">💡 {ex.hint}</p> : <button class="btn btn-ghost" onClick={() => setShowHint(true)}>看提示</button>)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 选择题 */
export function ChoiceExerciseView({ ex, onSolved }: { ex: ChoiceExercise; onSolved: () => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [wrongPick, setWrongPick] = useState<number | null>(null)
  const [solved, setSolved] = useState(false)

  function pick(i: number) {
    if (solved) return
    setPicked(i)
    if (i === ex.correct) {
      setSolved(true)
      onSolved()
    } else {
      setWrongPick(i)
    }
  }

  return (
    <div class="exercise choice">
      <p class="exercise-prompt">{ex.prompt}</p>
      <div class="choice-options">
        {ex.options.map((opt, i) => (
          <button
            key={i}
            class={`choice-option ${solved && i === ex.correct ? 'correct' : ''} ${wrongPick === i ? 'wrong' : ''}`}
            onClick={() => pick(i)}
          >
            {String.fromCharCode(65 + i)}. {opt}
          </button>
        ))}
      </div>
      {solved && picked !== null && <p class="feedback ok">✅ {ex.explain}</p>}
      {!solved && wrongPick !== null && <p class="feedback bad">❌ 不对,再想想。</p>}
    </div>
  )
}
