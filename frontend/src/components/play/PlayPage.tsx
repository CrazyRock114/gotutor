import { BoundedGoban } from '@sabaki/shudan'
import '@sabaki/shudan/css/goban.css'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { playCreate, playMove, playUndo, playResign } from '../../api'

interface PlayState {
  playId: string
  boardSize: number
  rank: string
  rankLabel: string
  userColor: 'b' | 'w'
  komi: number
  board: number[][]
  moves: { player: 'user' | 'ai'; color: string; move: string | null }[]
  captures: { b: number; w: number }
  toMove: 'B' | 'W'
  status: 'playing' | 'over'
  result: string | null
  lastEngineMove: string | null
  reply?: string | null
}

interface Props {
  onSubmitReview: (sgf: string) => void
}

const RANKS = [
  { value: 'rank_20k', label: '20级(入门)' },
  { value: 'rank_15k', label: '15级' },
  { value: 'rank_10k', label: '10级' },
  { value: 'rank_5k', label: '5级' },
  { value: 'rank_1k', label: '1级' },
  { value: 'rank_1d', label: '初段' },
]

function gtpToSgf(gtp: string | null, size: number): string {
  if (!gtp) return ''
  const x = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(gtp[0].toUpperCase())
  const n = parseInt(gtp.slice(1), 10)
  if (x < 0 || Number.isNaN(n)) return ''
  const y = size - n
  return `${String.fromCharCode(97 + x)}${String.fromCharCode(97 + y)}`
}

function movesToSgf(st: PlayState): string {
  const body = st.moves
    .map((m) => `;${m.color.toUpperCase()}[${gtpToSgf(m.move, st.boardSize)}]`)
    .join('')
  const aiName = `KataGo human-SL ${st.rankLabel}`
  const black = st.userColor === 'b' ? '玩家' : aiName
  const white = st.userColor === 'w' ? '玩家' : aiName
  return `(;GM[1]FF[4]CA[UTF-8]SZ[${st.boardSize}]KM[${st.komi}]RU[Chinese]PB[${black}]PW[${white}]C[Gotutor 对弈]${body})`
}

export default function PlayPage({ onSubmitReview }: Props) {
  const [state, setState] = useState<PlayState | null>(null)
  const [size, setSize] = useState(9)
  const [rank, setRank] = useState('rank_15k')
  const [color, setColor] = useState<'black' | 'white'>('black')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [finished, setFinished] = useState<'idle' | 'sgf-sent'>('idle')

  const signMap = state?.board as (0 | 1 | -1)[][] | undefined
  const lastVertex = useMemo(() => {
    if (!state || state.moves.length === 0) return null
    const last = state.moves[state.moves.length - 1]
    if (!last.move) return null
    const x = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(last.move[0].toUpperCase())
    const y = state.boardSize - parseInt(last.move.slice(1), 10)
    if (x < 0 || Number.isNaN(y)) return null
    return [x, y] as [number, number]
  }, [state])

  async function create() {
    setCreating(true)
    setError(null)
    try {
      setState(await playCreate({ size, rank, color }))
      setFinished('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  async function move(vertex: string) {
    if (!state || state.status !== 'playing' || waiting) return
    if (state.toMove !== state.userColor.toUpperCase()) return
    setWaiting(true)
    setError(null)
    try {
      const r = await playMove(state.playId, vertex)
      setState(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWaiting(false)
    }
  }

  async function undo() {
    if (!state) return
    setWaiting(true)
    try {
      setState(await playUndo(state.playId))
    } finally {
      setWaiting(false)
    }
  }

  async function resign() {
    if (!state) return
    setState(await playResign(state.playId))
  }

  function onVertexClick(_e: unknown, [x, y]: [number, number]) {
    if (!state || state.status !== 'playing') return
    if (state.toMove !== state.userColor.toUpperCase()) {
      setError('等 AI 下完…')
      return
    }
    // 落子前简单检查:该点已有子则忽略
    if (state.board[y][x] !== 0) return
    move(`${'ABCDEFGHJKLMNOPQRSTUVWXYZ'[x]}${state.boardSize - y}`)
  }

  const markerMap = useMemo(() => {
    if (!state) return undefined
    const grid: ({ type: 'circle' | 'cross' | 'triangle' | 'square' | 'point' | 'loader' | 'label' } | null)[][] = Array.from({ length: state.boardSize }, () =>
      Array.from({ length: state.boardSize }, () => null),
    )
    if (lastVertex) {
      const [x, y] = lastVertex
      if (grid[y]) grid[y][x] = { type: 'circle' }
    }
    return grid
  }, [state, lastVertex])

  // ---------- 设置界面 ----------
  if (!state) {
    return (
      <div class="upload">
        <div class="upload-card">
          <h1>与 AI 对弈</h1>
          <p class="upload-desc">
            AI 使用 KataGo human-SL 模型模拟人类棋手下棋,棋力按段位校准。
            学完入门课程?来下一盘试试,下完一键 AI 复盘。
          </p>
          <div class="play-setup">
            <label>
              棋盘
              <select value={size} onChange={(e) => setSize(Number((e.target as HTMLSelectElement).value))}>
                <option value={9}>9 路(推荐新手)</option>
                <option value={13}>13 路</option>
                <option value={19}>19 路</option>
              </select>
            </label>
            <label>
              AI 棋力
              <select value={rank} onChange={(e) => setRank((e.target as HTMLSelectElement).value)}>
                {RANKS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              执子
              <select value={color} onChange={(e) => setColor((e.target as HTMLSelectElement).value as 'black' | 'white')}>
                <option value="black">执黑先行</option>
                <option value="white">执白后行</option>
              </select>
            </label>
          </div>
          {error && <div class="banner banner-error">{error}</div>}
          <div class="upload-actions">
            <button class="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? '引擎准备中…(首次约 20 秒)' : '开始对弈'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- 对局界面 ----------
  const yourTurn = state.status === 'playing' && state.toMove === state.userColor.toUpperCase()
  const blackCaptures = state.userColor === 'b' ? state.captures.b : state.captures.w
  const whiteCaptures = state.userColor === 'b' ? state.captures.w : state.captures.b

  return (
    <div class="play-view">
      <div class="play-head">
        <span class="game-title">
          9/{state.boardSize} 路 · 对弈 {state.rankLabel} AI
        </span>
        <span class={`badge ${yourTurn ? 'badge-your' : ''}`}>
          {state.status === 'over' ? '对局结束' : yourTurn ? '轮到你下' : 'AI 思考中…'}
        </span>
      </div>
      {error && <div class="banner banner-error">{error}</div>}

      <div class="review-grid">
        <div class="board-col">
          <div class="goban-wrap">
            <BoundedGoban
              maxWidth={560}
              maxHeight={560}
              signMap={signMap}
              markerMap={markerMap}
              showCoordinates
              fuzzyStonePlacement
              onVertexClick={onVertexClick}
            />
          </div>
          <div class="controls">
            <div class="nav">
              <button onClick={() => move('pass')} disabled={!yourTurn}>停一手</button>
              <button onClick={undo} disabled={state.moves.length === 0}>悔棋</button>
              <button onClick={resign} disabled={state.status !== 'playing'}>认输</button>
            </div>
            <span class="dim">第 {state.moves.length} 手 · 贴 {state.komi} 目</span>
          </div>
        </div>

        <aside class="side-col">
          <section class="panel">
            <h3>对局信息</h3>
            <div class="pos-stats">
              <span>提子:黑 <b>{blackCaptures}</b> · 白 <b>{whiteCaptures}</b></span>
            </div>
            <p class="dim" style="margin-top:8px;font-size:13px">
              {state.userColor === 'b' ? '你执黑,先行' : '你执白,贴 7.5 目'}
              {state.lastEngineMove ? ` · AI 最后一手 ${state.lastEngineMove}` : ''}
            </p>
          </section>

          {state.status === 'over' && (
            <section class="panel">
              <h3>对局结束</h3>
              <p style="margin:0 0 10px">{state.result}</p>
              {finished === 'sgf-sent' ? (
                <p class="good">✅ 已提交 AI 复盘,请切换到「AI 复盘」标签查看</p>
              ) : (
                <div class="finish-actions" style="justify-content:flex-start">
                  <button
                    class="btn btn-primary"
                    onClick={() => {
                      onSubmitReview(movesToSgf(state))
                      setFinished('sgf-sent')
                    }}
                  >
                    用 AI 复盘这一局 →
                  </button>
                </div>
              )}
            </section>
          )}

          <section class="panel">
            <h3>着法记录</h3>
            <div class="move-log">
              {state.moves.map((m, i) => (
                <span class="move-log-item" key={i}>
                  {i + 1}. {m.color === 'B' ? '黑' : '白'} {m.move ?? '停'}
                </span>
              ))}
              {state.moves.length === 0 && <p class="dim">还没有着法</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
