// 课程内容入口:按章节组织。内容为自创中文教学内容(无第三方版权)。
// 章节顺序依据调研共识(聂道场教程 / IWTG / OGS / 弈客启蒙多方一致):
// 认识围棋 → 气/提子/打吃 → 规则补完(虎口/禁入点/打劫/打二还一)→ 连接与切断
// → 吃子技巧(双叫吃/关门吃/征子/倒扑/接不归)→ 死活(真假眼/两眼活/常型)→ 对杀 → 围地与终局
import type { Chapter } from '../learn/types'
import { ch1 } from './ch1'
import { ch2 } from './ch2'
import { ch3 } from './ch3'
import { connChapter } from './ch_conn'
import { ch5 as captureChapter } from './ch5'
import { ch4 as lifeDeathChapter } from './ch4'
import { fightChapter } from './ch_fight'
import { ch6 } from './ch6'

export const chapters: Chapter[] = [
  ch1,
  ch2,
  ch3,
  connChapter,
  captureChapter,
  lifeDeathChapter,
  fightChapter,
  ch6,
]
