/**
 * 征子几何搜索:白棋孤子被黑三面围住(打吃),白长出后黑能否征死?
 * 搜索:白取"气最多的下法",黑取"能吃到的下法",深度有限。
 * 用法:cd frontend && npx tsx ../scripts/ladder_search.mts
 */
import Board from '../frontend/node_modules/@sabaki/go-board/src/main.js'

const SIZE = 19
let sign = (b: Board, v: [number, number]) => (b.has(v) ? b.get(v) : 0)

function whiteChain(b: Board, seed: [number, number]): [number, number][] {
  return b.getChain(seed) as [number, number][]
}

function chainLibs(b: Board, seed: [number, number]): [number, number][] {
  const set = new Set<string>()
  for (const v of whiteChain(b, seed)) {
    for (const n of b.getNeighbors(v)) {
      if (b.get(n) === 0) set.add(`${n[0]},${n[1]}`)
    }
  }
  return [...set.values()].map((s) => s.split(',').map(Number) as [number, number])
}

const ESCAPE_LIBS = 5 // 白链气达到这个数视为逃出

function blackWin(b: Board, head: [number, number], depth: number, path: string[]): string | null {
  // 黑走:枚举使白链气减少的着法
  const libPoints = chainLibs(b, head)
  if (libPoints.length >= ESCAPE_LIBS) return null
  for (const mv of libPoints) {
    let nb: Board
    try {
      nb = b.makeMove(1, mv, {})
    } catch {
      continue
    }
    // 白链被提?
    if (nb.get(head) === 0) {
      return [...path, `B(${mv}) 提子`].join(' ')
    }
    const chain = whiteChain(nb, head)
    const libs = chainLibs(nb, head).length
    if (libs === 0) continue
    if (libs >= ESCAPE_LIBS) continue
    // 白应:枚举所有延长/逃法,取最优
    let whiteBest: string | null = null
    const tryMoves = [...chainLibs(nb, head)]
    for (const wm of tryMoves) {
      let wb: Board
      try {
        wb = nb.makeMove(-1, wm, {})
      } catch {
        continue
      }
      const wlibs = chainLibs(wb, head).length
      if (depth <= 1) {
        if (wlibs >= ESCAPE_LIBS) return null // 逃出
        whiteBest = 'deep-limit'
        continue
      }
      const res = blackWin(wb, head, depth - 1, [...path, `B(${mv}) W(${wm})`])
      if (res === null) {
        whiteBest = null
        break // 白有逃出方案
      }
      whiteBest = res
    }
    // 白还可以不逃(脱先)——近似忽略:气不减黑更容易吃
    if (whiteBest) return [...path, `B(${mv})`].join(' ') + ' || ' + whiteBest
  }
  return null
}

// 初始:白 (10,10),黑三面 (9,10),(11,10),(10,11),白剩 (10,9) 一口气 → 白延长
let b = Board.fromDimensions(SIZE)
b = b.set([10, 10], -1)
b = b.set([9, 10], 1)
b = b.set([11, 10], 1)
b = b.set([10, 11], 1)
b = b.makeMove(-1, [10, 9], {}) // 白长出(经典征子起点)

console.log('白链:', whiteChain(b, [10, 10]).map(String).join(' '))
console.log('白链气:', chainLibs(b, [10, 10]).map((v) => `(${v})`).join(' '))
const res = blackWin(b, [10, 10], 10, [])
if (res) console.log('\n黑可征死:\n' + res)
else console.log('\n黑无法征死(白可逃出)')
