import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Snapshot, Summary, TurnData } from '../types'
import { fetchGame, streamGame } from '../api'
import { GameReplay } from '../goban-utils'
import GobanPanel from './GobanPanel'
import WinrateGraph from './WinrateGraph'
import MistakeList from './MistakeList'

interface Props {
  initial: Snapshot
}

export default function ReviewPage({ initial }: Props) {
  const [snap, setSnap] = useState<Snapshot>(initial)
  const [k, setK] = useState(0)
  const [showCandidates, setShowCandidates] = useState(true)
  const [showTerritory, setShowTerritory] = useState(false)
  const [showLoss, setShowLoss] = useState(true)
  const [connectFailed, setConnectFailed] = useState(false)
  const closeStream = useRef<(() => void) | null>(null)

  const total = snap.moves.length

  // 断线恢复/刷新页面:按 gameId 重新拉取快照
  useEffect(() => {
    let alive = true
    fetchGame(snap.gameId).then((fresh) => {
      if (alive) setSnap(fresh)
    }).catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.gameId])

  // 分析进行中:订阅 SSE 进度
  useEffect(() => {
    if (snap.status !== 'running') return
    let cancelled = false
    closeStream.current = streamGame(snap.gameId, {
      onTurn: (t: TurnData) => {
        if (cancelled) return
        setSnap((prev) => {
          if (prev.turns.some((x) => x.turn === t.turn)) return prev
          return { ...prev, turns: [...prev.turns, t] }
        })
      },
      onDone: (s: Summary) => {
        if (cancelled) return
        setSnap((prev) => ({ ...prev, status: 'done', summary: s }))
      },
      onError: (message) => {
        if (cancelled) return
        setSnap((prev) => ({ ...prev, status: 'error', error: message }))
      },
      onFail: () => {
        if (!cancelled) setConnectFailed(true)
      },
    })
    return () => {
      cancelled = true
      closeStream.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.gameId, snap.status])

  // 键盘导航
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') setK((v) => Math.max(0, v - 1))
      else if (e.key === 'ArrowRight') setK((v) => Math.min(total, v + 1))
      else if (e.key === 'Home') setK(0)
      else if (e.key === 'End') setK(total)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  // 分析推进时自动跟随最新一手
  const turnCount = snap.turns.length
  const following = useRef(true)
  useEffect(() => {
    if (following.current && turnCount > 0 && snap.status === 'running') {
      setK(turnCount)
    }
  }, [turnCount, snap.status])
  useEffect(() => {
    following.current = k >= total - 1 || k === turnCount
  }, [k, total, turnCount])

  const replay = useMemo(
    () => new GameReplay(snap.boardSize, snap.initialStones, snap.moves),
    [snap.gameId, snap.boardSize],
  )

  function seek(i: number) {
    setK(Math.max(0, Math.min(i, total)))
  }

  const progress = snap.status === 'running' ? Math.round((snap.turns.length / Math.max(1, total)) * 100) : 100
  // k = total(终局)时没有该局面的 turn 报告,统计回退用最后一个已分析的 turn
  const cur =
    snap.turns.length > 0 ? snap.turns[Math.min(k, snap.turns.length - 1)] : null
  const isEnd = k >= total && total > 0
  const meta = snap.meta

  return (
    <div class="review">
      <div class="review-head">
        <div class="game-title">
          {meta.EV || meta.GN || '对局复盘'}
          {meta.DT ? <span class="dim"> · {meta.DT}</span> : null}
        </div>
        <div class="game-players">
          <span class="player">
            <i class="stone-icon black" /> {meta.PB || '黑'} {meta.BR || ''}
          </span>
          <span class="vs">vs</span>
          <span class="player">
            <i class="stone-icon white" /> {meta.PW || '白'} {meta.WR || ''}
          </span>
          <span class="dim">
            贴 {snap.komi} 目 · {snap.rules === 'japanese' ? '日本规则' : '中国规则'}
            {meta.RE ? ` · 结果 ${meta.RE}` : ''}
          </span>
        </div>
        {snap.status === 'running' && (
          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill" style={`width:${progress}%`} />
            </div>
            <span class="progress-text">KataGo 复盘进行中 {progress}%({snap.turns.length}/{total} 手)</span>
          </div>
        )}
        {snap.status === 'error' && (
          <div class="banner banner-error">复盘失败:{snap.error}{connectFailed ? '(连接中断)' : ''}</div>
        )}
      </div>

      <div class="review-grid">
        <div class="board-col">
          <GobanPanel
            size={snap.boardSize}
            replay={replay}
            k={k}
            moves={snap.moves}
            turns={snap.turns}
            showCandidates={showCandidates}
            showTerritory={showTerritory}
            showLoss={showLoss}
            onSeek={seek}
          />
          <div class="controls">
            <div class="nav">
              <button onClick={() => seek(0)} title="开局">⏮</button>
              <button onClick={() => seek(k - 1)} title="上一手(←)">◀</button>
              <span class="move-indicator">
                第 <b>{Math.max(0, k)}</b> / {total} 手
              </span>
              <button onClick={() => seek(k + 1)} title="下一手(→)">▶</button>
              <button onClick={() => seek(total)} title="终局">⏭</button>
            </div>
            <div class="toggles">
              <label>
                <input type="checkbox" checked={showCandidates} onChange={(e) => setShowCandidates((e.target as HTMLInputElement).checked)} />
                AI 候选点
              </label>
              <label>
                <input type="checkbox" checked={showLoss} onChange={(e) => setShowLoss((e.target as HTMLInputElement).checked)} />
                失点标记
              </label>
              <label>
                <input type="checkbox" checked={showTerritory} onChange={(e) => setShowTerritory((e.target as HTMLInputElement).checked)} />
                形势领地
              </label>
            </div>
          </div>
        </div>

        <aside class="side-col">
          <section class="panel">
            <h3>胜率曲线<span class="dim">(黑)</span></h3>
            <WinrateGraph turns={snap.turns} total={total} k={k} onSeek={seek} />
            {cur ? (
              <div class="pos-stats">
                <span>
                  黑胜率 <b class={cur.winrateBlack >= 50 ? 'good' : 'bad'}>{cur.winrateBlack.toFixed(1)}%</b>
                  {isEnd && <span class="dim">(终局)</span>}
                </span>
                <span>
                  黑目差 <b>{cur.scoreLeadBlack > 0 ? '+' : ''}{cur.scoreLeadBlack.toFixed(1)}</b>
                </span>
                <span class="dim">{cur.visits} visits</span>
              </div>
            ) : (
              <div class="pos-stats dim">等待 AI 分析…</div>
            )}
          </section>

          {k < snap.turns.length && cur && cur.topMoves.length > 0 && (
            <section class="panel">
              <h3>下一手候选<span class="dim">({cur.player === 'B' ? '黑' : '白'}行棋)</span></h3>
              <div class="cand-list">
                {cur.topMoves.map((m, i) => (
                  <div class="cand-row" key={m.move ?? i}>
                    <span class="cand-rank">{i + 1}</span>
                    <span class="cand-move">{m.move ?? 'pass'}</span>
                    <span class="cand-wr">{m.winrate.toFixed(1)}%</span>
                    <span class="dim">{m.scoreLead > 0 ? '+' : ''}{m.scoreLead.toFixed(1)}目</span>
                    <span class="cand-visits dim">{m.visits}次</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <MistakeList turns={snap.turns} status={snap.status} onSeek={seek} />

          {snap.summary && (
            <section class="panel">
              <h3>复盘总结</h3>
              <div class="sum-counts">
                {(['best', 'ok', 'slip', 'mistake', 'blunder'] as const).map((c) => (
                  <span class={`sum-chip sum-${c}`} key={c}>
                    {({ best: '最佳', ok: '正着', slip: '小损', mistake: '错着', blunder: '大失误' } as const)[c]}
                    {' '}× {snap.summary!.counts[c] ?? 0}
                  </span>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
