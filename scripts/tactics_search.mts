/**
 * 吃子战术搜索器:验证"黑走 M 后,无论白如何应对,黑能否在 depth 手内提掉目标白链"。
 * 用于枷吃、接不归等手筋的棋形验证。
 * 用法:cd frontend && npx tsx ../scripts/tactics_search.mts
 */
import Board from '../frontend/node_modules/@sabaki/go-board/src/main.js'

type V = [number, number]
const SIZE = 9

function makeBoard(stones: [number, number, number][]): Board {
  let b = Board.fromDimensions(SIZE)
  for (const [x, y, s] of stones) b = b.set([x, y], s as 1 | -1)
  return b
}

function key(b: Board): string {
  return b.signMap.flat().join('')
}

/** 白方逃出的判定:目标链活到黑无法继续(气 >= limit)或超出深度 */
function targetLibs(b: Board, target: V): V[] {
  if (b.get(target) !== -1) return [] // 已被提
  const chain = b.getChain(target) as V[]
  const set = new Set<string>()
  for (const v of chain)
    for (const n of b.getNeighbors(v)) if (b.get(n) === 0) set.add(`${n}`)
  return [...set].map((s) => s.split(',').map(Number) as V)
}

function legalMoves(b: Board, sign: 1 | -1, near: V[]): V[] {
  const out: V[] = []
  for (const v of near) {
    if (!b.has(v) || b.get(v) !== 0) continue
    try {
      b.makeMove(sign, v, {})
      out.push(v)
    } catch {
      /* 禁入点 */
    }
  }
  return out
}

/** 与目标链相关的候选点:目标链的气 + 气的邻居 + 提子点 */
function candidates(b: Board, target: V): V[] {
  const libs = targetLibs(b, target)
  const set = new Set<string>()
  const add = (v: V) => b.has(v) && set.add(`${v}`)
  for (const v of libs) {
    add(v)
    for (const n of b.getNeighbors(v)) add(n as V)
  }
  return [...set].map((s) => s.split(',').map(Number) as V)
}

/**
 * 黑能否提掉目标?blackToMove=true 表示轮黑。
 * 返回黑必胜的着法树;白有活路返回 null。
 */
function blackWins(
  b: Board,
  target: V,
  depth: number,
  blackToMove: boolean,
  memo: Map<string, boolean>,
): boolean {
  if (b.get(target) !== -1) return true // 已提掉
  const libs = targetLibs(b, target)
  if (libs.length >= 6) return false // 白逃出
  if (depth <= 0) return false
  const k = key(b) + (blackToMove ? 'B' : 'W') + depth
  const cached = memo.get(k)
  if (cached !== undefined) return cached
  let result: boolean
  if (blackToMove) {
    result = false
    for (const mv of legalMoves(b, 1, candidates(b, target))) {
      let nb = b
      try {
        nb = b.makeMove(1, mv, {})
      } catch {
        continue
      }
      if (blackWins(nb, target, depth - 1, false, memo)) {
        result = true
        break
      }
    }
  } else {
    result = true
    const moves = legalMoves(b, -1, candidates(b, target))
    if (libs.length === 0) {
      result = true // 白无子可下(都自杀)且没被提——罕见,当黑胜
    } else {
      for (const mv of moves) {
        let nb = b
        try {
          nb = b.makeMove(-1, mv, {})
        } catch {
          continue
        }
        if (!blackWins(nb, target, depth - 1, true, memo)) {
          result = false
          break
        }
      }
    }
  }
  memo.set(k, result)
  return result
}

function test(name: string, stones: [number, number, number][], target: V, blackFirst: V, depth = 8) {
  const b = makeBoard(stones)
  if (b.get(blackFirst) !== 0) {
    console.log(`✗ ${name}: 黑第一手 (${blackFirst}) 上有子`)
    return false
  }
  let nb: Board
  try {
    nb = b.makeMove(1, blackFirst, {})
  } catch (e) {
    console.log(`✗ ${name}: 黑第一手 (${blackFirst}) 非法:${e}`)
    return false
  }
  const wins = blackWins(nb, target, depth, false, new Map())
  if (wins) {
    console.log(`✓ ${name}: 黑 (${blackFirst}) 成立,白无法逃出`)
    return true
  }
  console.log(`✗ ${name}: 黑 (${blackFirst}) 不成立,白有活路`)
  return false
}

console.log('=== 枷吃候选 ===')
// 候选1:白 (4,4),黑 (3,4),(4,3) 两侧,枷点 (5,5);四周开阔
test('枷1 开阔处', [
  [4, 4, -1],
  [3, 4, 1],
  [4, 3, 1],
], [4, 4], [5, 5])
// 候选2:白 (3,3) 靠近边角,黑 (2,3),(3,2),枷点 (4,4) — 白逃向右边和下边
test('枷2 靠角', [
  [3, 3, -1],
  [2, 3, 1],
  [3, 2, 1],
], [3, 3], [4, 4])
// 候选3:白 (4,3) 二线,黑 (3,3),(4,2),(5,3),枷点 (5,4)? 白逃向 4/5 线
test('枷3 二线', [
  [4, 3, -1],
  [3, 3, 1],
  [4, 2, 1],
  [5, 3, 1],
], [4, 3], [5, 4])
// 候选4:白 (3,4) 三线贴左,黑 (2,4),(3,5),枷点 (4,5)?;白向右/上逃
test('枷4 三线贴边', [
  [3, 4, -1],
  [2, 4, 1],
  [3, 5, 1],
], [3, 4], [4, 5])

console.log('=== 枷吃:箱形网 ===')
// 白链 (4,3),(4,4) 被黑墙围在箱内,只剩 (5,3),(5,4) 两口气;黑枷 (5,5)
test('枷-箱形', [
  [4, 4, -1],
  [4, 3, -1],
  [3, 3, 1],
  [3, 4, 1],
  [3, 5, 1],
  [4, 5, 1],
  [4, 2, 1],
  [5, 2, 1],
  [6, 3, 1],
  [6, 4, 1],
  [6, 5, 1],
], [4, 4], [5, 5], 8)

console.log('=== 接不归候选 ===')
// 候选1:白 (4,4),(5,4) 两子,黑 (3,4),(4,3),(5,3),(6,4),(6,5),(5,5)? 白气 (4,5)…
// 黑先 (4,5):白粘 (5,5) 则全死?
test('接不归1', [
  [4, 4, -1],
  [5, 4, -1],
  [3, 4, 1],
  [4, 3, 1],
  [5, 3, 1],
  [6, 4, 1],
], [4, 4], [4, 5])
// 候选2:白 (4,4),(5,4),(5,5),黑 (3,4),(4,3),(5,3),(6,4),(6,5):白气 (4,5),(6,6)?
test('接不归2', [
  [4, 4, -1],
  [5, 4, -1],
  [5, 5, -1],
  [3, 4, 1],
  [4, 3, 1],
  [5, 3, 1],
  [6, 4, 1],
], [4, 4], [4, 5])
// 候选3:白 (4,4),(4,5),黑 (3,4),(3,5),(4,3),(5,4),(4,6),(5,5)? 白气 (5,5)?
test('接不归3', [
  [4, 4, -1],
  [4, 5, -1],
  [3, 4, 1],
  [3, 5, 1],
  [4, 3, 1],
  [5, 4, 1],
], [4, 4], [5, 5])
