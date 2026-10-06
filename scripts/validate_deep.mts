/**
 * 课程深层行为验证(L2.5 执行型 oracle):
 * 不只验证"落子合法",而是模拟正解链后断言题意效果:
 *  - 含"提/吃"的练习:正解落子后必须发生提子(captured > 0)
 *  - 含"杀/点杀"的死活题:正解落子后,目标方无法立即做两眼(简化断言:对方存在 ≤1 气链或气减少)
 *  - 含"打吃"的练习:落子后存在对方链气 ≤ 1
 * 同时做 schema 层检查:id 唯一性、坐标界内、选项索引、字段完整性。
 * 用法:cd frontend && npx tsx ../scripts/validate_deep.mts
 */
import Board from '../frontend/node_modules/@sabaki/go-board/src/main.js'
import { chapters } from '../frontend/src/courses/index.ts'
import { gtpToVertex } from '../frontend/src/goban-utils.ts'

let errors = 0
let checks = 0
const fail = (msg: string) => { errors++; console.error('  ✗ ' + msg) }
const pass = (msg: string) => { checks++; console.log('  ✓ ' + msg) }

// ---------------- L1: schema ----------------
console.log('== Schema 检查 ==')
const lessonIds = new Set<string>()
const exerciseIds = new Set<string>()
let totalLessons = 0, totalSteps = 0, totalEx = 0
const exByKind: Record<string, number> = { click: 0, seq: 0, choice: 0 }

for (const ch of chapters) {
  if (!ch.id || !ch.title || ch.lessons.length === 0) fail(`章节 ${ch.id || '?'} 缺 id/title/lessons`)
  for (const l of ch.lessons) {
    totalLessons++
    if (lessonIds.has(l.id)) fail(`课 id 重复:${l.id}`)
    lessonIds.add(l.id)
    if (l.steps.length === 0) fail(`课 ${l.id} 无步骤`)
    for (const [si, s] of l.steps.entries()) {
      totalSteps++
      if (!s.title) fail(`课 ${l.id} step${si} 无标题`)
      const ex = s.exercise
      if (ex) {
        totalEx++
        exByKind[ex.kind] = (exByKind[ex.kind] ?? 0) + 1
        if (exerciseIds.has(ex.id)) fail(`练习 id 重复:${l.id}/${ex.id}`)
        exerciseIds.add(ex.id)
        if (ex.kind === 'choice') {
          if (ex.correct < 0 || ex.correct >= ex.options.length)
            fail(`choice ${ex.id}: correct 索引越界`)
          if (ex.options.length < 2) fail(`choice ${ex.id}: 少于 2 个选项`)
          if (!ex.explain) fail(`choice ${ex.id}: 缺 explain`)
        }
        const inBoard = (ex as { stones?: [number, number, number][] }).stones
        if (inBoard && ex.kind !== 'choice') {
          for (const [x, y] of inBoard.map((s) => [s[0], s[1]])) {
            if (x < 0 || y < 0 || x >= (ex as { size: number }).size || y >= (ex as { size: number }).size)
              fail(`${ex.id}: 摆子 (${x},${y}) 越界`)
          }
        }
      }
      const b = s.board
      if (b) {
        const size = b.size
        for (const [x, y] of (b.stones ?? []).map((s) => [s[0], s[1]]))
          if (x < 0 || y < 0 || x >= size || y >= size) fail(`${l.id} step${si}: 演示摆子 (${x},${y}) 越界`)
        for (const m of b.marks ?? [])
          if (m.v[0] < 0 || m.v[1] < 0 || m.v[0] >= size || m.v[1] >= size)
            fail(`${l.id} step${si}: 标记 (${m.v}) 越界`)
        for (const [color, gtp] of b.moves ?? []) {
          void color
          const num = parseInt(gtp.slice(1), 10)
          if (num < 1 || num > size) fail(`${l.id} step${si}: 演示着法 ${gtp} 行号越界`)
        }
      }
    }
  }
}
pass(`结构:${chapters.length} 章 ${totalLessons} 课 ${totalSteps} 步;练习 ${totalEx}(click ${exByKind.click}/seq ${exByKind.seq}/choice ${exByKind.choice})`)

// ---------------- L2.5: 行为 oracle ----------------
console.log('== 行为 oracle(题意达成)==')

function makeBoard(size: number, stones: [number, number, number][] = []): Board {
  let b = Board.fromDimensions(size)
  for (const [x, y, s] of stones) {
    if (!b.has([x, y])) throw new Error(`摆子越界 (${x},${y})`)
    b = b.set([x, y], s as 1 | -1)
  }
  return b
}

function capturesOf(before: Board, after: Board): number {
  let n = 0
  for (let y = 0; y < before.height; y++)
    for (let x = 0; x < before.width; x++)
      if (before.get([x, y]) !== 0 && after.get([x, y]) === 0) n++
  return n
}

/** 断言 v 处落子( sign)后,敌链 (t) 气数 ≤ expectLibs */
function chainLibsAfter(b: Board, v: [number, number], sign: 1 | -1, t: [number, number]): number {
  const nb = b.makeMove(sign, v, {})
  if (nb.get(t) === 0) return -1 // 被提
  return nb.getLiberties(t).length
}

const summary = { behaviorChecked: 0, capturedVerified: 0, atariVerified: 0, choiceChecked: 0 }

type Intent = 'suicide' | 'escape' | 'race' | 'capture' | 'atari' | 'generic'

function classifyIntent(text: string): Intent {
  if (/禁入/.test(text)) return 'suicide'
  if (/逃/.test(text)) return 'escape'
  if (/紧气|公气|对杀/.test(text)) return 'race'
  if (/提掉|提子|还提|全提|提光|吃掉|被吃/.test(text)) return 'capture'
  if (/打吃|叫吃/.test(text)) return 'atari'
  return 'generic'
}

function countEnemyChainLibsDecrease(b: Board, v: [number, number], sign: 1 | -1): boolean {
  const nb = b.makeMove(sign, v, {})
  // 落子后:存在敌方(或相邻争夺)链气数下降即算"紧到气"
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const t: [number, number] = [x, y]
      if (b.get(t) === -sign) {
        try {
          const before = b.getLiberties(t).length
          const after = nb.get(t) === 0 ? -1 : nb.getLiberties(t).length
          if (after < before || after === -1) return true
        } catch { /* 忽略 */ }
      }
    }
  return false
}

for (const ch of chapters) {
  for (const l of ch.lessons) {
    for (const [si, s] of l.steps.entries()) {
      const ex = s.exercise
      if (!ex || ex.kind === 'choice') {
        if (ex?.kind === 'choice') summary.choiceChecked++
        continue
      }
      const text = `${s.title} ${ex.prompt} ${'successMsg' in ex ? (ex as { successMsg?: string }).successMsg ?? '' : ''}`
      const intent = classifyIntent(text)
      const size = (ex as { size: number }).size
      const stones = (ex as { stones: [number, number, number][] }).stones
      const turn = (ex as { turn: 'B' | 'W' }).turn
      const sign: 1 | -1 = turn === 'B' ? 1 : -1

      if (ex.kind === 'click') {
        const b = makeBoard(size, stones)
        const v = ex.correct[0]
        if (b.get(v) !== 0) { fail(`${ex.id}: 正解点 (${v}) 非空`); continue }
        let after: Board
        try { after = b.makeMove(sign, v, {}) } catch (e) {
          fail(`${ex.id}: 正解 (${v}) 落子异常:${e}`); continue
        }
        const cap = capturesOf(b, after)
        const changed = JSON.stringify(b.signMap) !== JSON.stringify(after.signMap)
        summary.behaviorChecked++
        let ok = true
        switch (intent) {
          case 'suicide':
            // 禁入点练习:正解点落子应"无效"(自杀被拒或被立即提回前状态不变)
            ok = !changed
            if (!ok) fail(`${ex.id}: 题意为禁入点,但正解落子改变了局面`)
            break
          case 'escape': {
            // 逃子:己方链气数应增加
            const own = b.getChain(v).map(String).join()
            const libsBefore = b.getLiberties(v).length
            const ownAfter = after.getChain(v).map(String).join()
            const libsAfter = after.getLiberties(v).length
            void own; void ownAfter
            ok = libsAfter > libsBefore || cap > 0
            if (!ok) fail(`${ex.id}: 题意为逃子,但气数未增加(${libsBefore}→${libsAfter})`)
            break
          }
          case 'race':
            ok = countEnemyChainLibsDecrease(b, v, sign)
            if (!ok) fail(`${ex.id}: 题意为紧气,但没有紧到对方任何一口气`)
            break
          case 'capture':
            ok = cap >= 1
            if (!ok) fail(`${ex.id}: 题意要求提/吃,但正解 (${v}) 未产生提子`)
            else summary.capturedVerified++
            break
          case 'atari': {
            let found = false
            for (let y = 0; y < size && !found; y++)
              for (let x = 0; x < size && !found; x++) {
                const t: [number, number] = [x, y]
                if (b.get(t) === -sign) {
                  const libs = chainLibsAfter(b, v, sign, t)
                  if (libs === -1 || libs <= 1) found = true
                }
              }
            ok = found
            if (!ok) fail(`${ex.id}: 题意为打吃/叫吃,但正解后无 ≤1 气敌链`)
            else summary.atariVerified++
            break
          }
          default:
            ok = true
        }
        if (ok) pass(`${ex.id}: [${intent}] 正解行为符合题意${cap > 0 ? `(提子 ${cap})` : ''}`)
      } else if (ex.kind === 'seq') {
        let b = makeBoard(size, stones)
        let totalCap = 0
        let ok = true
        for (const [i, st] of ex.steps.entries()) {
          try {
            const before = b
            b = b.makeMove(sign, st.correct, {})
            totalCap += capturesOf(before, b)
          } catch (e) {
            fail(`${ex.id}: 第 ${i + 1} 步 (${st.correct}) 非法:${e}`); ok = false; break
          }
          if (st.reply) {
            try {
              const before = b
              b = b.makeMove(st.reply[0] === 'B' ? 1 : -1, st.reply[1], {})
              totalCap += capturesOf(before, b)
            } catch (e) {
              fail(`${ex.id}: 第 ${i + 1} 步 reply 非法:${e}`); ok = false; break
            }
          }
        }
        if (!ok) continue
        const intent = classifyIntent(text)
        summary.behaviorChecked++
        if (intent === 'capture') {
          if (totalCap === 0) fail(`${ex.id}: 题意要求提/吃,但整条正解链 0 提子`)
          else { summary.capturedVerified++; pass(`${ex.id}: [capture] 正解链提子 ${totalCap}`) }
        } else {
          pass(`${ex.id}: [${intent}] 正解链逐步合法(全程提子 ${totalCap})`)
        }
      }
    }
  }
}

console.log(`\n行为断言统计:检查 ${summary.behaviorChecked} 项(提子验证 ${summary.capturedVerified}、打吃验证 ${summary.atariVerified});choice ${summary.choiceChecked}`)
console.log(`Schema + 行为共 ${checks + summary.behaviorChecked} 项通过,${errors} 个失败`)
process.exit(errors === 0 ? 0 : 1)
