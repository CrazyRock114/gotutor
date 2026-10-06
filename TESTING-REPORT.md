# Gotutor 全站审查测试报告

- **日期**:2026-10-06
- **方法**:systematic-testing(八阶段)+ exhaustive-content-testing(课程模块分层扫掠 L1/L2/L2.5/L6)
- **被测物**:入门课程(8 章 30 课)、人机对弈(human-SL)、AI 复盘;后端 FastAPI + KataGo×2,前端 Preact
- **执行环境**:macOS / Apple Silicon;后端 :8000(重启多次)、前端 dev :5173

## 一、执行摘要

按风险排序(R1 行为正确性 > R2 schema > R3/R4 API 边界 > R5 前端状态 > R6 宣称一致)执行。
**发现 6 个真缺陷(全部修复 + 疫苗)、1 个测试脚本错误(修正)**;最终全部资产绿:
课程验证 60+ 项、深层行为 oracle 41 项、pytest 12 项、API 边界 25 项(含 3 条疫苗)、
浏览器状态走查 6 项;端到端冒烟(复盘/对弈)通过。

## 二、缺陷清单(四态定性)

| # | 缺陷 | 定性 | 级别 | 修复 | 疫苗 |
|---|---|---|---|---|---|
| D1 | 打二还一棋形错误:演示与练习中黑还提**提不掉**(白扑子连通外侧白子,气未封死) | 真缺陷 | P1 | 3 轮几何迭代 → 边线口袋终版(白墙+黑封口),求解器逐手验证 | `validate_deep.mts` 行为 oracle:正解必须产生提子≥1(注回验证:换回旧棋形即变红 ✓) |
| D2 | 课程 id 重复(枷吃与倒扑同为 ch5-l3,练习同) | 真缺陷 | P2 | 重排为 ch5-l1~l5 | `validate_deep.mts` schema:id 唯一性断言 |
| D3 | 重置进度按钮无效(清了 localStorage 但组件无 state 不重渲染) | 真缺陷 | P2 | LearnHome 改 useState 驱动 | 浏览器走查 T6(重置后 0/30) |
| D4 | 坏 hash(#g=已清除对局)静默失败,用户无提示 | 真缺陷 | P3 | catch → setError 友好提示 + 清 hash;error banner 改全局 | 浏览器走查 T4(坏 hash → banner 可见) |
| D5 | 非法顶点 ZZ9 → 500(应 422) | 真缺陷 | P3 | 路由层格式预校验 + `gtp_to_xy` 硬化(双层) | `api_edge_test.py` 3 条疫苗(ZZ9/Z/E99 → 422);注回验证:多层防御,末层(apply ValueError→422)始终兜底 |
| D6 | 曲三演示 caption 笔误(残留调试文本) | 真缺陷 | P3 | 修正 | 人工 |
| T-err | validate_deep 首版关键词 oracle 误判 7 处(逃子/禁入/紧气题被误要求提子) | 测试脚本错误 | — | 重写为意图分类(禁入→断自杀;逃→断增气;紧气→断敌气减;提/吃→断提子;打吃→断敌链≤1气) | — |

## 三、断言强度统计(S7 gate)

| 类别 | 数量 | 占比 |
|---|---|---|
| 存在性(状态码/元素存在) | ~18 | ~22% |
| 状态等价(精确值:进度 1/30、状态码、气数、提子数、id 集合) | ~40 | ~48% |
| 性质(行为 oracle:提子≥1、敌链≤1气、正解链合法、自杀点无效、紧气必降) | ~20 | ~24% |
| 端到端(对弈全流程、复盘闭环、hash 恢复) | ~5 | ~6% |

**存在性占比 22% < 40% 红线 ✓**(主要断言为状态等价与性质类)。

## 四、测试资产(全部入仓可重跑)

| 资产 | 层 | 运行方式 |
|---|---|---|
| `scripts/validate_courses.mts` | L1/L2 棋形合法性与结构 | `cd frontend && npx tsx ../scripts/validate_courses.mts` |
| `scripts/validate_deep.mts` | L1 schema + L2.5 行为 oracle | 同上 `validate_deep.mts` |
| `backend/tests/`(pytest 12) | 单元(坐标/失点/解析) | `backend && .venv/bin/python -m pytest tests/ -q` |
| `scripts/api_edge_test.py` | API 边界 25 项(后端运行时) | `.venv/bin/python scripts/api_edge_test.py` |
| `scripts/smoke_test.py` / `smoke_play.py` | 端到端冒烟 | 同上 |
| `scripts/ladder_search.mts` / `tactics_search.mts` | 手筋求解器验证 | `npx tsx …` |

浏览器走查(本轮):T1 三tab切换 / T2 完成课→进度1/30 / T3 刷新保持 / T4 坏hash提示 / T5 继续学习指向第2课 / T6 重置进度 → 0/30。(改进项:走查脚本化入仓,见提案)

## 五、既往漏检复盘

- 上一轮浏览器实测漏掉:打二还一"演示动画播放了不发生的提子"(视觉上看不出没提子)→ 本轮行为 oracle 拦截 ✓
- 上一轮 validate_courses 漏掉:id 重复(它只查合法性)→ 本轮 schema 检查拦截 ✓
- 新覆盖盲区:API 拒绝路径(25 项)、UI 状态持久化(T2/T3/T6)、坏输入提示(D4)

## 六、残余风险声明

1. 对局/复盘数据为内存态,后端重启即失(D4 已缓解提示,根治需 SQLite 持久化——V1 路线)
2. 劫争回提的实战覆盖依赖 KataGo 引擎自身规则实现(未做端到端劫形测试)
3. 浏览器走查为半自动执行,未固化成入仓脚本(提案 P-20261006)
4. 双活课 demo 为概念演示;LLM 讲解/错题本未实现(V1 路线)
5. 枷吃课的箱形网经求解器验证,但"开阔处枷不成立"的变体未做成教学反例

## 七、准出结论

全部 gate 通过:域枚举 ✓、风险排序 ✓、行为 oracle ✓、注回验证 ✓(疫苗不假红)、
断言强度 ✓、覆盖计数由工具打印 ✓、三件套(报告/经验/提案)产出 ✓。
