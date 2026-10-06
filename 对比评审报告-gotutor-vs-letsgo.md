# Gotutor vs letsgo（小围棋乐园）对比评审报告

- **评审日期**：2026-10-06
- **评审方法**：两项目全码深读（6 个并行只读子代理 + 人工抽查核实），gotutor 依据本仓 HANDOFF §6/§8 框架；letsgo 取自 https://github.com/CrazyRock114/letsgo （即线上 letusgoa.cn 的部署源码，stress-test.py 内置该域名）。所有结论带 `文件:行号`，最重的 3 项指控已由本人二次核实。
- **读者决策点**：本文只给证据、量化与三条路线的取舍账，**最终路线由你定夺**（见 §7 决策点）。

---

## 0. 一页 TLDR

| | **Gotutor**（本项目） | **letsgo / 小围棋乐园** |
|---|---|---|
| 一句话定位 | 「学→练→下→复盘」闭环教学站，**教学内核深、正确性有验证体系** | 儿童向「边玩边学」AI 对弈站，**产品骨架全、已上线运营** |
| 规模/技术栈 | ~5,000 行；FastAPI + Preact/Vite + @sabaki/shudan + sgfmill + KataGo×2（Metal） | ~2.7 万行（src 约 1.5 万）；Next.js 16 + React 19 + Supabase/pgvector + DeepSeek RAG + KataGo(CPU)×7 模型 + GnuGo |
| 运行状态 | 本机运行（前后端均绿，2026-10-06 验证） | **已上线** letusgoa.cn（Railway Docker） |
| 教学功能 | 8 章 30 课 + 31 道互动题（行为 oracle 验证）+ 整谱 AI 复盘 | 12 章 45 步**纯文字**教程 + 0 题 + 逐手 LLM 解说 + 44 条百科 |
| 致命短板 | 无持久化/无账号/无 LLM 讲解/题量少（31 vs 调研建议 300-700）/无 git | **打劫规则不执行**（已核实）、数子边界 bug、积分无限铸币（已核实）、setConfig 无鉴权、教程 0 题零进度 |
| 工程成熟度 | 6/10（内核强，运维三件套缺失） | 5/10（外壳精致、内核未经证明：规则引擎零单测 + 假测试） |
| 运维成本 | 当前 0 元（本机）；生产化需 SQLite+安全加固+算力 | 现金 ~$7-15/月，但人力运维税极高（183 commits 约 6 成是 fix；单容器 1GB 跑 CPU KataGo，genmove P50=23 秒） |

**核心结论**：两个项目恰好互补——**gotutor 拥有最难重建的资产（经过引擎级验证的教学内容 + 失点分析管线 + human-SL 档位校准），letsgo 拥有最容易复刻的资产（账号/积分/持久化/LLM 讲解的产品骨架，但其实现带着可修的安全债）**。letsgo 的规则正确性与安全债务修复成本，高于 gotutor 补产品骨架的成本；这是本文推荐「gotutor 为基座、定向移植 letsgo 三个模块」的依据（详见 §6）。

---

## 1. 项目概况

### 1.1 Gotutor（交接文档 + 全码评审）

- **架构**：浏览器（Preact+Vite+TS，棋盘用 @sabaki/shudan，局面重放用 @sabaki/go-board）↔ REST+SSE ↔ FastAPI（9 个模块）↔ 两个 KataGo analysis 子进程（复盘引擎 kata1-b18c384nbt 常驻；对弈引擎 b18c384nbt-humanv0 懒加载，着法生成 = maxVisits≈2 + `overrideSettings.humanSLProfile=<档位>`，6 档 20级~初段按请求切换）（HANDOFF §3；`backend/app/engine.py:51-89`、`play.py:174`）
- **产品线**：入门课程 8 章 30 课（图文步骤 + 棋盘单步演示 + 三题型互动练习）；人机对弈（9/13/19 路，默认 9 路，停/悔/认输）；AI 复盘（analyzeTurns 整谱、胜率曲线、失点标记、候选点、形势领地图、失误跳转）
- **测试资产**：12 pytest + 41 项行为 oracle（禁入/逃/紧气/提吃/打吃意图断言）+ 60+ 棋形合法性 + 25 API 边界 + 两个端到端冒烟，全绿（`TESTING-REPORT.md`）
- **已知短板（HANDOFF §8 自认 + 评审证实）**：对局/复盘内存态、无用户体系、无 LLM 讲解、无终局数目、练习量 31 题、双活课是概念演示

### 1.2 letsgo（小围棋乐园）

- **来源与状态**：183 commits，全部由扣子编程（Coze）CLI 的 AI agent 产出；生产部署 Railway + Docker（约 1.2-1.5GB 镜像，内置 KataGo v1.16.4 eigenavx2 CPU 版 + 7 个模型共 ~670MB + GnuGo），线上运行中
- **架构**：Next.js 16 App Router 单体（引擎子进程、账号、积分、RAG 全部住在 API route 里）；Supabase Postgres（pgvector HNSW 向量库）+ drizzle（仅当文档用，运行时全走 supabase-js service_role）；自研 bcrypt+JWT（localStorage 存储）；LLM = DeepSeek 流式（SiliconFlow BGE-M3 做 embedding）
- **产品面**：9/13/19 路对弈（KataGo visits 三档 30/80/150 / GnuGo level 3/7/10 / 本地启发式 AI 三层）；提示教学（10 积分/次，50 次/局）；逐手 LLM 解说（5 积分/手，MoveFacts 事实骨架防幻觉 + RAG 职业佐证）；围棋问答；12 章 45 步教程；44 条百科；积分/注册/每日奖励；棋局保存与复盘续弈；围观 AI 对弈（服务端 worker 自动对弈）；管理员监控台（/monitor）
- **特色资产**：`reports/` 里有罕见的 **agent 自我批判报告**（15-critical-review.md：列出 6 种认知偏差，自评"花几个月在无 GPU 容器里让 KataGo 勉强能跑"）、27 局 AI 自对弈性能报告（genmove 平均 20.4s / P95 37.8s）、真实生产事故修复链 15+ 个 commit（OOM→SIGABRT→每请求重启→worker 未启动→GTP 迁 analysis）

---

## 2. 技术方案对比

| 层 | Gotutor | letsgo | 评注 |
|---|---|---|---|
| 前端框架 | Preact + Vite，组件化良好（最大组件 279 行，无巨型组件） | React 19 + Next.js 16 + shadcn/ui；**主应用 3059 行单组件、66 个 useState、370 次 setState**；围观页是其 2723 行的近似全量复制 | gotutor 可维护性明显占优；letsgo 微观并发控制（epoch 代际号 + 请求 ID 双闸，`page.tsx:197,313,502-514`）反而很老练 |
| 棋盘渲染 | @sabaki/shudan（成熟库：热图层/标记/动画） | 手写 SVG 185 行（渐变/防误触/触摸判别，`go-board.tsx` 全文） | letsgo 自研版无提子/落子动画、无 a11y；shudan 直接给热图层（形势图/候选点已用于复盘） |
| 规则引擎 | **不自研**：sgfmill（Python 成熟库）管盘面，合法性"本地预检 + KataGo 引擎终审"双层（`main.py:283-299`），劫争正确性外包给 KataGo | **自研 go-logic.ts**：提子/禁入正确（先提子后验气，`go-logic.ts:151-162`），但打劫零强制（见 §5 P0-1）、数子边界 bug、无 Zobrist/超级劫；**规则部分零单测** | 这是两个项目最本质的分野：gotutor 把"围棋规则的正确性"这个最难的问题交给了成熟库+引擎；letsgo 自研但唯一最需要测试的计算逻辑恰好没有测试 |
| 引擎接入 | analysis JSON 协议；**两个独立进程**（复盘/对弈分离）；`humanSLProfile` **按请求**切换 6 档；就绪探针 + stderr 尾巴进异常 + 消费方提前退出发 terminate（`engine.py:61-89,126-134`） | analysis JSON 协议；常驻单例池 + 懒启动 + warmup + crash 自动复活；**难度 = maxVisits 三档**，`humanSLProfile=preaz_5k` **写死在进程级 cfg**（Dockerfile ANALYSISCFG 段），不能按请求换档；降级链 KataGo→50visits analyze→本地 AI | 两者引擎工程都在水准之上。gotutor 的 human-SL 按请求换档是教学产品的真优势（对手棋力=学生棋力）；letsgo 的"低 visits 噪声"防御（保留引擎 order 不按胜率重排，`katago-analysis-client.ts:477-487`）值得抄 |
| 数据与持久化 | 全内存（GameStore/PlayStore 裸 dict 无上限）+ 课程进度 localStorage | Supabase Postgres 全持久化（棋局 JSONB/用户/积分流水/向量库 30,791 条） | letsgo 完胜；gotutor 的 SQLite 改造入口已勘明（§6.1） |
| LLM 能力 | 无 | **DeepSeek 流式逐手解说 + RAG 职业佐证（BGE-M3→pgvector HNSW→三重质量闸门）+ MoveFacts 事实骨架防幻觉**（`move-facts.ts:24-61`、`go-ai/route.ts:41-90`） | letsgo 全项目最领先的部分，也是 gotutor V1 路线图正要做的——**有现成参考实现可抄** |
| AI 复盘 | **整谱 analyzeTurns + 胜率曲线 + 失点分级（0.3/0.5/1.5/5 点）+ 形势图 + 失误跳转**，SIDETOMOVE→黑视角归一化带单测 | 无整谱复盘管线（analyze 只服务提示/解说，单手 visits 50-300）；有走子质量分级（best→blunder，前 10 手放宽） | gotutor 完胜——这是 AI Sensei 式复盘订阅的核心能力 |
| 部署 | 本机（Metal），未部署 | Railway Docker 生产 + 域名 + 压测 + 监控台 | letsgo 的生产化经验（含全部踩坑记录）是有价值的负资产/正资产 |

---

## 3. 实现难度对比

| 维度 | Gotutor | letsgo |
|---|---|---|
| 代码量与复杂度 | ~5,000 行，分层克制，上手半天可通读 | src ~1.5 万行 + 报告/脚本；主页面需通读 3000 行才能安全改动 |
| 领域难度集中点 | **教学内容**（复杂棋形手写必错，靠行为 oracle 兜底——HANDOFF 踩坑 #6）+ KataGo 协议细节 | **运维**（KataGo 打包地狱：AppImage/libssl/libzip/OOM 调参）+ 巨石组件的状态纠缠 |
| 从零复刻成本 | 低-中：技术栈全是成熟库，难点在课程内容与验证方法论（无法速成，是其护城河） | 中-高：全栈+账号+RAG+向量库+容器化+双引擎，广度大；但各模块单项难度不高 |
| 修复/演进成本 | 局部改动影响面小（组件小、接口窄）；补生产化（SQLite/账号/LLM）入口已勘明 | 每处 AI 逻辑重复 4 份（handleMove/passMove/restartGame/resumeFromReplay），改一处漏三处；规则引擎补测试→修 bug→回归的链条长 |
| 二次开发的真实风险 | 低：测试全绿可重构 | 中-高：文档系统性漂移（AGENTS.md 积分数额/迁移方式/KataGo 版本均已过期），按文档开发会踩坑 |

**结论**：gotutor 是"内核难、外壳易"，letsgo 是"外壳全、内核软、维护贵"。若目标是要一个能长期演进的教学产品，gotutor 的实现难度劣势（要补产品骨架）是**有限且已勘明路径的**，letsgo 的劣势（巨石+复制+无测试的规则内核）是**随功能增长复利的**。

---

## 4. 运维成本对比

### 4.1 现金成本

| 项目 | Gotutor | letsgo |
|---|---|---|
| 算力 | 本机 Metal（0 元）；若上云：GPU 实例或 Apple Silicon 独占机，或 CPU+低 visits | Railway Hobby ~$5/月（2 vCPU/1GB，`Dockerfile:66`），实测 19 路 ~7 visits/s（`reports/README.md:32-36`），**9 路 hard 一手要 23 秒（P50）** |
| 数据库 | 无（内存） | Supabase Free（向量 120MB + 棋局，勉强够；多项目共用单实例 `AGENTS.md:15`） |
| LLM API | 无 | DeepSeek 按量（27 局实测 71 手/局 → 开解说后每局 ~140 次调用，百局级流量 $1-5/月） |
| Embedding | 无 | 一次性，可忽略 |
| **合计** | **0（本机）～ 数十元/月（小型云）** | **~$7-15/月现金 + 域名** |

### 4.2 人力运维税（真正的差距）

- letsgo：183 commits 约 6 成是 fix；仅 Railway 相关事故就 15+ 个独立修复 commit；OOM 调参链 nnCache 20→18→15→14；**agent 自评："整套架构是在错误环境里让 KataGo 勉强能跑"（`reports/15-critical-review.md:283-287`）**
- 结构性单点：EnginePool/缓存/会话全是进程内 globalThis（`go-engine/route.ts:92,117,216,1027`），**无法水平扩副本**；ai-test worker 常驻烧 CPU；分析超时不取消（被放弃的请求继续烧满 visits）
- gotutor：当前无运维面；生产化前必须补的硬项：对弈引擎孤儿进程（`main.py:79-86` 不 stop）、失败态粘滞（`main.py:49-62`）、readline 无 watchdog（`engine.py:105`）、无界内存（`store.py:23`）、CORS `*` + 零鉴权 + 无 body 上限（`main.py:89-98`）——全部是**半天级修复**，且都是局部改动

**结论**：letsgo 的现金成本可控但人力税高（AI agent 迭代也烧 token）；gotutor 的运维成本是一次性的工程补课，补完后架构天然更省（两进程隔离、串行锁对个人/小班吞吐足够）。

---

## 5. 教学功能全面性对比（§8 五维度 + 补充三维度）

### 5.1 功能矩阵

| 教学功能 | Gotutor | letsgo |
|---|---|---|
| 课程主线 | 8 章 30 课：气→提子→打吃→虎口→禁入→打劫→打二还一→连接→吃子技巧→死活→对杀→围地（对齐中文教材共识） | 12 章 45 步：同主线 + **布局/中盘/官子/学法**（gotutor 没有）；但**缺虎口、缺对杀/紧气**，定式/手筋零实例 |
| 棋盘演示 | ✅ 每课单步播放 | ❌ 纯文字翻页 |
| 互动做题 | ✅ 31 题/3 题型（点击带逐点反馈/连续正解链/选择），覆盖 18 种启蒙题型中的核心 | ❌ **0 题**（全仓 grep 无 quiz/练习） |
| 内容正确性保障 | ✅ 138 断言（行为 oracle + 棋形验证），曾抓出 P1 内容错误 | ❌ 规则引擎零单测 + 4 处知识错误（守角拼音 dì jiǎo、真眼"充要条件"、打劫表述过严、实时比分把提子双计） |
| 教程进度保存 | ✅ localStorage（课级） | ❌ 刷新即失（游客和登录用户都不存，`page.tsx:375-376`） |
| 对弈对手 | KataGo human-SL **6 档按请求校准**（20级~初段） | KataGo visits 三档 / GnuGo 三档 / 本地 AI（**无段位校准**，humanSLProfile 写死进程级） |
| 对弈路数 | 9/13/19（默认 9 路"推荐新手"） | 9/13/19 |
| 落子提示 | 复盘候选点 | ✅ 提示教学（KataGo bestMoves + LLM 讲解，10 积分/次） |
| 逐手解说 | ❌（V1 路线图项） | ✅ DeepSeek 流式 + 防幻觉事实骨架 + RAG 职业佐证 |
| 围棋问答 | ❌ | ✅ 结合当前局面的聊天 |
| **整谱 AI 复盘** | ✅ 胜率曲线/失点分级/候选点/形势图/失误跳转/SGF 上传 | ❌ 无（只有棋局回放与续弈） |
| 终局数目/数子 | ❌（已知短板） | ⚠️ 有 calculateFinalScore 但**数子边界 bug + 死子不处理**，结果不可信 |
| 学习闭环 | 学→练→下→复盘 **全通** | 学（读）→下→听（解说）通；**练缺失**、教程进度丢失 |
| 账号/积分/保存 | ❌ | ✅ 注册 2000 分 + 每日 2000 + 棋局落库 + 复盘续弈 |
| 外部棋谱导入 | ✅ SGF 上传 | ❌ |
| 围观 AI 对弈 | ❌ | ✅ 服务端 worker + 围观页 |
| 百科 | ❌ | ✅ 44 条术语 + 教程↔百科双链（设计值得抄） |
| 中文本地化 | ✅ 对齐中文教材体例/术语 | ✅ 儿童向比喻体系统一（气=呼吸、打入=特种兵）+ 拼音（有错字） |
| 许可合规 | ✅ 完整台账（KataGo MIT+可商用权重/Shudan MIT/sgfmill MIT/内容自产） | ⚠️ 引擎选型合规（KataGo 可商用/GnuGo GPL 子进程），但 **RAG 知识库 100 局 KGS/职业谱未标注来源与许可**、249 局**随机合成棋谱混入"职业佐证"库**稀释质量 |

### 5.2 §8 五维度判定

1. **教学课程体系完整性**：gotutor 胜在"深度+正确性+练习"，letsgo 胜在"广度（布局/官子/学法章）"。综合 gotutor 优——因为它有练习与验证，而课程主线后半段（布局/官子）是低成本的纯内容扩展。
2. **AI 能力**：各有所长——gotutor 的 human-SL 校准 + 失点分析是教学硬能力；letsgo 的 LLM 解说/RAG 是体验软能力。按"教学"权重 gotutor 略优，按"产品体验"letsgo 略优。
3. **学习闭环**：gotutor 全通；letsgo 缺"练"且教程进度不保存。
4. **许可合规**：gotutor 有台账；letsgo 引擎合规但数据来源不明 + 合成谱污染。
5. **中文本地化**：两者都好，letsgo 的儿童文案更讨好，gotutor 更系统。

---

## 6. 迭代建议

### 6.1 Gotutor（保持内核优势，补产品骨架——按优先级）

1. **立即（半天）——工程止血**：`git init` + 首提交；修四个引擎治理缺陷（对弈引擎 stop 补进 lifespan `main.py:79-86`、starting 失败复位 `main.py:49-62`、engine.readline 加超时 watchdog `engine.py:105`、GameStore/PlayStore 加容量上限）；部署前收紧 CORS 与 body 上限。
2. **本周（1-2 天）——SQLite 持久化**：入口已勘明——`backend/app/store.py`（GameStore 全部方法）+ `backend/app/play.py:159-170`（PlayStore），**接口签名不动**，SSE 订阅留内存。根治"重启即失"。
3. **V1 核心（1-2 周）——LLM 分级讲解**：接入点 `runner.py:40`（finish 前）+ `analysis.py:92`（build_summary 扩展）+ `types.ts:38` + `ReviewPage.tsx:220`。**直接抄 letsgo 的三个成熟模式**：MoveFacts 事实骨架防幻觉（`move-facts.ts:24-61`）、双层 prompt 负面清单（`go-ai/route.ts:41-90`）、前端 epoch+请求 ID 竞态双闸（`page.tsx:197,502-514`）。gotutor 的失点数据（0.3/0.5/1.5/5 分级）比 letsgo 的单手胜率差是**更好的 LLM 原料**——这是两家优势的天然结合点。
4. **教学扩展（并行）**：补布局/官子章（letsgo 的 12 章大纲可作对照，但内容自产并走 validate_deep oracle）；练习量从 31 → 100+（调研基准 300-700 的第一阶段）；错题本 + 间隔复习（V1 既定项）。
5. **补终局数目**：双 pass 后用 KataGo ownership/scoreLead 出结果（比自研数子可靠——letsgo 自研数子的教训在此）；补对弈最后一手后的胜率（`runner.py:25` 已知缺口）。
6. **账号体系**（V1 既定）：动面已勘明（`main.py` 8 路由 + `api.ts` + `progress.ts` 迁服务端）。可参考 letsgo 的表结构（users/games/transactions）但**不要抄它的安全实现**（见 §6.2 第 1 条的反面清单）。

### 6.2 letsgo（保命优先，再补教学内核——若继续运营）

1. **立即修安全包（不上修复等于开门营业）**：
   - 积分无限铸币：`POST /api/users/points` 接受任意正数（`users/points/route.ts:62-96`，已核实）→ 只允许服务端内部调用或加白名单 type；
   - `action=setConfig` 无鉴权（`go-engine/route.ts:1046-1198`）→ 匿名可把生产切到 271MB 模型或 visits=5000 打爆 1GB 内存；
   - `GET /api/monitor`、`/api/db-check`、`games/[id]` 均无鉴权（昵称/邮箱级信息泄露 + IDOR）；
   - JWT localStorage + 7 天 + 无吊销、注册零限流（每日白送 4000 分可脚本刷）；
   - 全库 service_role、RLS 形同虚设（`supabase-client.ts:57-60`）。
2. **修规则正确性（教学产品的生死线）**：
   - 打劫：`isValidMove` 加劫检查，且 `playMove` 的 ko 语义先改对（现在记的是"落子点"，应是"被提点"，`go-logic.ts:220-235`，已核实 ko 返回值 10 处调用方全部未消费）；更省力的替代：**像 gotutor 一样把合法性交给 KataGo**（它本来就走 analysis 无状态重放，引擎会拒绝劫争回提），自研规则只做本地 AI 路径的兜底；
   - 数子：放弃自研 `getTerritory`（visited 集合门控导致左/上方边界不计，`go-logic.ts:288,318-325`），**改用 KataGo ownership**——引擎已经在容器里，这是免费的正确性；
   - 死子处理、双 pass 30% 门槛、"领地悬殊自动终局"三个终局行为按规则体系重定义。
3. **修知识错误包**：守角拼音、真眼充要条件、打劫"等对方应手"表述、比分双计提子（`page.tsx:424-432`）、RAG 引用坐标跳 I 列（`go-ai/route.ts:596`）；把合成棋谱从"职业佐证"库剥离、KGS 来源标注许可。
4. **教学内核补课**：教程加棋盘交互与题目（gotutor 的 `types.ts` 三题型数据模型是 TS——**可以近乎原样移植**，配套的 validate_deep 行为 oracle 思想一并移植）；教程进度先落 localStorage 再落库。
5. **结构还债**：拆 page.tsx（按现有注释横幅切 10+ 组件）；ai-test 页与主页合并参数化；删死 EngineQueue（monitor 还在展示它）；模型切换时 stop 旧引擎（现在的泄漏与 OOM 修复直接矛盾）。
6. **体验与成本**：genmove P50 23 秒对儿童是硬伤——默认引擎换镜像里已有的 b10c128（14MB 小网）或降 visits，把 rect15 留给分析；ai-test worker 限时运行。

---

## 7. 取舍分析与三条路线（**由你定夺**）

### 路线 A：gotutor 为基座，定向移植 letsgo 三个模块（推荐）

- **做法**：gotutor 继续走 §7 路线图；从 letsgo 抄三样——①LLM 解说的"事实骨架+防幻觉 prompt+竞态双闸"模式（这是它最值钱的代码）；②教程↔百科双链的信息设计；③"对局落库+复盘续弈"的产品概念（实现用 gotutor 自己的 SQLite 方案）。
- **账**：gotutor 补齐产品骨架 ≈ 2-3 周（入口全部勘明、风险局部）；letsgo 修到"教学产品合格线"（安全包 + 打劫 + 数子 + 假测试重建 + 巨石拆分）≈ 4-6 周，且规则内核的测试体系要从零建。**投入产出比 A > B。**
- **代价**：放弃 letsgo 现有线上站点与账号数据（若已有真实用户需评估）；短中期没有"已上线"的和心理安全感。

### 路线 B：letsgo 为基座，移植 gotutor 教学内核

- **可行的理由**：gotutor 的课程数据模型是 TS，移植阻力低；letsgo 已有账号/积分/持久化/LLM/线上运行。
- **要补的硬骨头**：整谱复盘管线（gotutor 的 runner/analysis 是 Python，需重写为 TS——胜率曲线/失点/形势图三个 UI 组件也要重写）、5 项 P0 安全修复、规则内核测试从零建、巨石拆分。**复盘能力（gotutor 最重的资产）在 B 路线里恰恰是重写成本最高的部分。**
- **适合条件**：letsgo 已有不可放弃的真实用户/运营投入，且愿意承担 4-6 周修复期。

### 路线 C：双线并行，后期合并

- 两个 AI 会话各维护一个项目，教学内容归 gotutor、对弈运营归 letsgo。**不推荐**：两套栈（FastAPI/Next.js）双倍心智，合并时的数据模型冲突成本高于任何单线投入；除非把两个项目当 A/B 实验品且人力充裕。

### 帮你定夺的 5 个判断题

1. **目标用户**：要"系统性启蒙教学"（选 A）还是"儿童边玩边学+留存运营"（B 的产品气质更近）？
2. **letsgo 有没有真实用户**？有且活跃 → B 的权重上升；没有 → A。
3. **算力**：有没有 GPU/独占机？无 GPU 时 gotutor 的复盘（2000 visits 整谱）在 CPU 上也会慢，但按需触发可接受；letsgo 的对弈 23 秒/步是常驻痛点。
4. **维护者是谁**：继续 AI agent 迭代的话，gotutor 的小代码量+全绿测试对 agent 迭代更友好（每次改动可被 138 断言守门）；letsgo 的巨石文件对 agent 同样是雷区（它自己的 critical-review 承认认知锁定问题）。
5. **时间线**：要尽快上线 → letsgo 已在线上（但带着未修的安全洞，等于负分上线）；要上线一个"敢收费"的产品 → A。

---

## 8. 证据附录（关键指控的核实记录）

| 指控 | 证据 | 核实方式 |
|---|---|---|
| letsgo 打劫零强制 | `go-logic.ts:220-235`（ko 记落子点）+ `isValidMove:146-163` 无劫检查 + page.tsx 全部 10 处调用只解构 `{newBoard, captured}` | ✅ 本人 sed/grep 复核 |
| letsgo 积分铸币 | `users/points/route.ts:62-96`：`amount` 仅判非空，唯一防线 `points + amount < 0` | ✅ 本人 sed 复核 |
| letsgo 数子边界 bug | `go-logic.ts:288`（棋子先入 visited）+ `:318-325`（边界采集被 visited 门控） | 子代理报告，逻辑自洽未复现 |
| gotutor 对弈引擎孤儿 | `main.py:79-86` lifespan 只 stop 复盘引擎 | 子代理报告，与 HANDOFF §2"已知残余风险"吻合 |
| 双方运行状态 | gotutor `/api/health` ready=true + 前端 200；letsgo 线上可访问（WebFetch 实测） | ✅ 本人验证 |

*子代理完整报告要点已并入正文；6 份原始评审（引擎层/棋规/教学内容/前端/账号部署/gotutor 全码）可在会话记录中回溯。*
