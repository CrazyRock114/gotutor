/**
 * 课程棋形验证脚本:回放所有课程中的 board 演示与练习,用 @sabaki/go-board 校验合法性。
 * 用法:cd frontend && npx tsx ../scripts/validate_courses.mts
 */
import Board from '../frontend/node_modules/@sabaki/go-board/src/main.js'
import { chapters } from '../frontend/src/courses/index.ts'
import { gtpToVertex } from '../frontend/src/goban-utils.ts'

let errors = 0
function err(msg: string) {
  errors++
  console.error('  ✗ ' + msg)
}
function ok(msg: string) {
  console.log('  ✓ ' + msg)
}

function baseBoard(size: number, stones: [number, number, number][] = []): Board {
  let b = Board.fromDimensions(size)
  for (const [x, y, sign] of stones) {
    if (!b.has([x, y])) {
      err(`摆子越界 (${x},${y})`)
      continue
    }
    b = b.set([x, y], sign as 1 | -1)
  }
  return b
}

function libs(b: Board, v: [number, number]): number {
  try {
    return b.getLiberties(v).length
  } catch {
    return -1
  }
}

console.log('== 检查章节结构 ==')
for (const ch of chapters) {
  if (ch.lessons.length === 0) err(`章节 ${ch.id} 没有课`)
  for (const l of ch.lessons) {
    if (l.steps.length === 0) err(`课 ${l.id} 没有步骤`)
  }
}
ok(`共 ${chapters.length} 章 ${chapters.reduce((n, c) => n + c.lessons.length, 0)} 课`)

console.log('== 检查演示棋盘 ==')
for (const ch of chapters) {
  for (const l of ch.lessons) {
    for (const [si, s] of l.steps.entries()) {
      if (!s.board) continue
      const { size, stones, moves } = s.board
      let b = baseBoard(size, stones ?? [])
      let fine = true
      for (const [color, gtp] of moves ?? []) {
        const v = gtpToVertex(gtp, size)
        if (!v) {
          err(`${l.id} step${si}: 非法顶点 ${gtp}`)
          fine = false
          continue
        }
        const before = JSON.stringify(b.signMap)
        try {
          b = b.makeMove(color === 'B' ? 1 : -1, v, {})
        } catch (e) {
          err(`${l.id} step${si}: 演示着法 ${color}${gtp} 非法(${e})`)
          fine = false
          continue
        }
        if (JSON.stringify(b.signMap) === before) {
          err(`${l.id} step${si}: 演示着法 ${color}${gtp} 没有产生任何变化(禁入点?)`)
          fine = false
        }
      }
      if (fine) ok(`${l.id} step${si} 演示 ${moves?.length ?? 0} 手全部合法`)
    }
  }
}

console.log('== 检查练习 ==')
for (const ch of chapters) {
  for (const l of ch.lessons) {
    for (const [si, s] of l.steps.entries()) {
      const ex = s.exercise
      if (!ex) continue
      const tag = `${l.id} step${si} ${ex.kind}`
      if (ex.kind === 'click') {
        let b = baseBoard(ex.size, ex.stones)
        let fine = true
        for (const [i, c] of ex.correct.entries()) {
          if (!b.has(c)) {
            err(`${tag}: 正解点 (${c}) 越界`)
            fine = false
            continue
          }
          if (b.get(c) !== 0) {
            err(`${tag}: 正解点 (${c}) 上已有棋子`)
            fine = false
          }
        }
        // 模拟正解:落子应合法
        const v = ex.correct[0]
        try {
          b.makeMove(ex.turn === 'B' ? 1 : -1, v, {})
        } catch (e) {
          err(`${tag}: 正解 (${v}) 落子非法:${e}`)
          fine = false
        }
        for (const [color, gtp] of ex.reply ?? []) {
          const rv = gtpToVertex(gtp, ex.size)
          if (!rv) {
            err(`${tag}: reply 顶点非法 ${gtp}`)
            fine = false
            continue
          }
          try {
            b = b.makeMove(color === 'B' ? 1 : -1, rv, {})
          } catch (e) {
            err(`${tag}: reply ${color}${gtp} 非法:${e}`)
            fine = false
          }
        }
        if (fine) ok(`${tag} 正解与 reply 合法`)
      } else if (ex.kind === 'seq') {
        let b = baseBoard(ex.size, ex.stones)
        let fine = true
        for (const [i, st] of ex.steps.entries()) {
          if (!b.has(st.correct)) {
            err(`${tag}: 第 ${i + 1} 步正解越界`)
            fine = false
            continue
          }
          if (b.get(st.correct) !== 0) {
            err(`${tag}: 第 ${i + 1} 步正解 (${st.correct}) 上已有子`)
            fine = false
            continue
          }
          try {
            b = b.makeMove(ex.turn === 'B' ? 1 : -1, st.correct, {})
          } catch (e) {
            err(`${tag}: 第 ${i + 1} 步正解 (${st.correct}) 非法:${e}`)
            fine = false
            continue
          }
          if (st.reply) {
            const [color, v] = st.reply
            if (b.get(v) !== 0) {
              err(`${tag}: 第 ${i + 1} 步 reply 点 (${v}) 上有子`)
              fine = false
              continue
            }
            try {
              b = b.makeMove(color === 'B' ? 1 : -1, v, {})
            } catch (e) {
              err(`${tag}: 第 ${i + 1} 步 reply 非法:${e}`)
              fine = false
            }
          }
        }
        if (fine) ok(`${tag} ${ex.steps.length} 步全部合法`)
      }
    }
  }
}

console.log(errors === 0 ? '\n全部通过 ✅' : `\n共 ${errors} 个问题 ❌`)
process.exit(errors === 0 ? 0 : 1)
