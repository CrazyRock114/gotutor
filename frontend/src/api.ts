import type { Snapshot, TurnData, Summary } from './types'

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`
    try {
      const body = await resp.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* 忽略非 JSON 错误体 */
    }
    throw new Error(detail)
  }
  return resp.json() as Promise<T>
}

export async function createGame(sgf: string, visits: number): Promise<{ gameId: string }> {
  return handle(
    await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sgf, visits }),
    }),
  )
}

export async function fetchGame(gid: string): Promise<Snapshot> {
  return handle(await fetch(`/api/games/${gid}`))
}

export async function fetchDemo(): Promise<string> {
  const data = await handle<{ sgf: string }>(await fetch('/api/demo'))
  return data.sgf
}

export interface StreamHandlers {
  onTurn: (t: TurnData) => void
  onDone: (s: Summary) => void
  onError: (message: string) => void
  onFail: () => void // 连接层失败
}

/** 订阅分析进度流,返回取消函数。 */
export function streamGame(gid: string, h: StreamHandlers): () => void {
  const es = new EventSource(`/api/games/${gid}/stream`)
  let closed = false

  const cleanup = () => {
    if (!closed) {
      closed = true
      es.close()
    }
  }

  es.addEventListener('turn', (e) => {
    try {
      h.onTurn(JSON.parse((e as MessageEvent).data))
    } catch {
      /* 跳过坏帧 */
    }
  })
  es.addEventListener('done', (e) => {
    cleanup()
    try {
      h.onDone(JSON.parse((e as MessageEvent).data))
    } catch {
      h.onFail()
    }
  })
  es.addEventListener('error', (e) => {
    if ((e as MessageEvent).data) {
      // 服务端业务错误事件
      cleanup()
      try {
        h.onError(JSON.parse((e as MessageEvent).data).message)
      } catch {
        h.onError('分析过程出错')
      }
    } else if (!closed) {
      // 连接层错误(EventSource 会自动重连,交给它;若 readyState CLOSED 则上抛)
      if (es.readyState === es.CLOSED) {
        cleanup()
        h.onFail()
      }
    }
  })
  return cleanup
}

// ---------------- 对弈 ----------------

export interface PlayState {
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

export async function playCreate(opts: {
  size: number
  rank: string
  color: 'black' | 'white'
}): Promise<PlayState> {
  return handle(await fetch('/api/play', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) }))
}

export async function playMove(pid: string, vertex: string): Promise<PlayState> {
  return handle(await fetch(`/api/play/${pid}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vertex }) }))
}

export async function playUndo(pid: string): Promise<PlayState> {
  return handle(await fetch(`/api/play/${pid}/undo`, { method: 'POST' }))
}

export async function playResign(pid: string): Promise<PlayState> {
  return handle(await fetch(`/api/play/${pid}/resign`, { method: 'POST' }))
}
