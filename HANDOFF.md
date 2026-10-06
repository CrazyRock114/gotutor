# Gotutor 项目交接文档

> **交接日期**:2026-10-06 · **交接目的**:新会话快速接管项目(含横向对比场景)
> **项目路径**:`/Users/crazyrock/ZCodeProject/gotutor` · **运行状态**:后端 :8000 / 前端 :5173 可能仍在运行
> **一页速读**:AI 围棋教学网站"Gotutor",课程(8 章 30 课)+ 人机对弈(6 档校准)+ AI 复盘,闭环已通,全量测试绿。

---

## 1. 项目是什么

**Gotutor · AI 围棋教室**:面向中文零基础用户的围棋教学网站。三条产品线用顶部导航串联,
形成"**学 → 下 → 复盘**"闭环:

| 产品线 | 内容 | 状态 |
|---|---|---|
| 入门课程 | 8 章 30 课,零基础→能下完整一盘棋;每课 = 图文步骤 + 棋盘演示(单步播放)+ 互动练习(点击题/连续题/选择题) | ✅ 已上线 |
| 人机对弈 | 与 KataGo human-SL 模型对弈,棋力按 20级~初段 6 档校准;支持停一手/悔棋/认输 | ✅ 已上线 |
| AI 复盘 | 上传/对弈转复盘 → KataGo 整谱分析 → 胜率曲线/失点标记/候选点/形势领地图/失误跳转 | ✅ 已上线 |

**差异化主张**(源自调研,见 §6):中文市场没有"现代 Web 体验的 AI 复盘订阅"(AI Sensei 无中文),
中文开放教学内容为零(自产即壁垒);下一步杀手锏是 **LLM 分级讲解**(KataGo 失点数据 → 分水平口语化中文讲解)。

## 2. 当前状态快照

- **代码规模**:~5000 行源码(不含模型/依赖);无 git 仓库(`.gitignore` 已备,未 init)
- **测试资产**(全部可重跑,全绿):
  - `backend && .venv/bin/python -m pytest tests/ -q` → 12 项
  - `cd frontend && npx tsx ../scripts/validate_courses.mts` → 棋形合法性 60+ 项
  - `cd frontend && npx tsx ../scripts/validate_deep.mts` → **schema + 行为 oracle 41 项**(意图分类:禁入/逃/紧气/提吃/打吃)
  - `backend && .venv/bin/python scripts/api_edge_test.py` → API 边界 25 项(需后端运行)
  - `scripts/smoke_test.py`(复盘端到端)/ `smoke_play.py`(对弈端到端)
  - 手筋求解器:`scripts/tactics_search.mts`(吃子搜索)/ `ladder_search.mts`(征子)
- **测试结论**:见 `TESTING-REPORT.md`(6 个真缺陷全部修复+疫苗;断言强度:存在性 22% < 40% 红线)
- **已知残余风险**:对局/复盘数据内存态(后端重启即失,坏 hash 已有友好提示);无 SQLite;无用户体系

## 3. 架构与技术栈(含关键决策理由)

```
浏览器 (Preact + Vite + TS)
  ├─ 入门课程 LearnHome/LessonView/LessonBoard/ExerciseBoard ← courses/*.ts 数据树
  ├─ 对弈 PlayPage(playCreate/playMove/playUndo/playResign)
  └─ 复盘 ReviewPage/GobanPanel/WinrateGraph/MistakeList
      全部棋盘渲染用 @sabaki/shudan(BoundedGoban)
      局面重放用 @sabaki/go-board
      │ REST + SSE
后端 FastAPI (backend/app/)
  ├─ main.py     路由:复盘(/api/games×4 + /api/demo)+ 对弈(/api/play×5)
  ├─ engine.py   KataGo analysis 子进程封装(JSON 行协议,串行锁,stderr 就绪检测)
  ├─ play.py     对弈会话(sgfmill 盘面)+ human-SL 档位查询
  ├─ runner.py   整谱复盘编排(analyzeTurns 一次算完整局)
  ├─ analysis.py 失点计算/失误分类(best/ok/slip/mistake/blunder,阈值 0.3/0.5/1.5/5 点)
  ├─ sgf.py      SGF 解析(sgfmill + UTF-8 编码探测)
  └─ store.py    内存存储 + SSE 广播
引擎(两个独立子进程,均 analysis 模式):
  ├─ 复盘引擎:kata1-b18c384nbt.bin.gz(启动时加载,/api/health 报 ready)
  └─ 对弈引擎:b18c384nbt-humanv0.bin.gz(懒加载,首次开局约 20 秒)
       着法生成 = analysis 查询 maxVisits≈2 + overrideSettings.humanSLProfile=<档位>
```

**引擎选型**:KataGo 唯一(代码 MIT + 网络权重可商用);Leela Zero 网络 CC BY-NC 禁商用;
OGS 主站/Kaya 是 AGPL 只可学思路。Homebrew 安装(`brew install katago`,Metal 后端)。

**踩坑记录(必读,防重蹈)**:
1. KataGo analysis 输出字段是 **`turnNumber`**(不是 `turn`);`analyzeTurns` 查询**没有终止行**,
   收到最后一个 turn 即完成——最初因这里写错导致整个服务死锁。
2. `reportAnalysisWinratesAs=SIDETOMOVE`(默认)下,**ownership 也是行棋方视角**;
   后端已统一归一化为黑视角(正=黑),数组行主序从左上角(A19)开始。判定实验脚本:`scripts/check_sign*.py`。
3. analysis 模式强制要求 `numAnalysisThreads`、`nnMaxBatchSize` 等键——`analysis.cfg` 必须基于
   官方 `analysis_example.cfg` 改(Homebrew 路径:`/opt/homebrew/Cellar/katago/*/share/katago/configs/`)。
4. **SGF 坐标 ≠ GTP 坐标**:SGF 用小写字母双字符("cf"),GTP 用"字母+数字"("C4");
   对局转复盘时必须转换(曾因直通导致 422)。后端 `play.py:sgf()` 与前端 `PlayPage:gtpToSgf()` 都已处理。
5. 中文 SGF 常不带 CA[] 属性(规范默认 ISO-8859-1)→ `sgf.py` 做 UTF-8 探测后 `override_encoding`。
6. 复杂棋形(打二还一/枷吃)**手写必错**:必须先用规则引擎(@sabaki/go-board)模拟验证再写入课程。
   教科书把打二还一画在一线有几何必然性(只有一线三点邻接才能封死扑子)。

## 4. 环境与启动

```bash
# 本机已装齐:node 24(nvm,~/.nvm/versions/node/v24.21.0)/ python 3.12 / katago 1.18.2(Metal)
# 模型×2(共 187MB,在 backend/models/);新机器用 ./scripts/setup_engine.sh

# ⚠️ 当前 shell 无 nvm(node/npx 不在 PATH):启动前端前必须先 export PATH
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"

# 启动(两条命令)
cd backend && .venv/bin/uvicorn app.main:app --port 8000
cd frontend && npx vite --port 5173

# 健康检查
curl http://127.0.0.1:8000/api/health   # {"ready":true,...} ready=false = 复盘引擎未就绪(约10s)
curl -o /dev/null -w "%{http_code}" http://localhost:5173/   # 200
```

> 交接时状态(2026-10-06):后端与前端**均已启动**,上两条 curl 应直接通过。
> 环境变量:`KATAGO_BIN`(默认 /opt/homebrew/bin/katago)、`KATAGO_MODEL`、`KATAGO_CFG`、`KATAGO_HUMAN_MODEL`。
> 示例棋谱:`backend/demo/game.sgf`(KataGo 自弈 140 手,版权干净;重新生成:`scripts/gen_demo.py`)。

## 5. 代码地图(按目录)

```
backend/app/main.py      # 全部 REST 路由 + CORS + lifespan 引擎启动
backend/app/engine.py    # KataGoEngine:start/wait_ready/analyze_stream(锁内串行)/stop
backend/app/play.py      # PlaySession(apply/pop/rebuild/sgf)+ PlayStore + engine_reply + gtp_to_xy(带格式校验,疫苗)
backend/app/analysis.py  # compute_turn(视角换算)/build_summary/classify(失点分级)
frontend/src/App.tsx     # 三视图路由(hash #g=<id> 恢复复盘)+ 顶部导航
frontend/src/courses/    # 课程内容:index.ts(顺序编排)+ ch1~ch6/ch_conn/ch_fight
frontend/src/learn/      # types.ts(Chapter/Lesson/Step/Exercise 数据模型)+ progress.ts(localStorage)
frontend/src/components/learn/   # LearnHome(目录+进度)/ LessonView(步骤机)/ LessonBoard(演示)/ ExerciseBoard(三题型)
frontend/src/components/play/PlayPage.tsx  # 对弈设置卡+棋盘+着法记录+一键转复盘
frontend/src/goban-utils.ts # GTP↔xy、GameReplay(局面缓存)、领地渲染、失点收集
scripts/                 # 测试与工具(见 §2);check_*.py 是 KataGo 协议实验脚本(可删)
```

课程数据模型:`Chapter{ id,title,desc,lessons[] } → Lesson{ id,title,summary,steps[] } → Step{ title,body,tip,board?,exercise? }`;
Exercise 三型:ClickExercise(correct 坐标数组 + perWrong 逐点反馈)/ SeqExercise(steps 正解链 + reply 自动应手)/ ChoiceExercise。
章节顺序有讲究(调研共识,勿乱调):气→提子→打吃→虎口→禁入→打劫→打二还一→连接→吃子技巧(关门/征/枷/扑/接不归)→死活→对杀→围地。

## 6. 调研文档(横向对比会用到的核心结论)

两份调研报告都在项目根目录,是所有决策的依据:

1. **`围棋教学开源资源调研报告.md`**(技术+内容+竞品全景):
   - 引擎:KataGo 唯一(MIT+可商用权重+human-SL);GNU Go/Pachi 做陪练补充;浏览器 WASM 可行但仅限小网
   - 前端:Shudan(MIT)vs OGS goban(Apache-2.0);**Lizzie 式 Web 分析 UI 不存在=自研机会**;Kaya/OGS 主站 AGPL 勿抄
   - 内容:公有领域古典死活题 1050 题(frank_go 仓库)、Shape Up!(CC BY-SA)、KGS 20 万局、OGS dump 11GB;
     中文开放内容空白=自产壁垒;goproblems/101weiqi/GoGoD 禁止搬运
   - 竞品:AI Sensei($5.95/500局 复盘订阅,无中文)、101 围棋(作业/错题本 B 端)、BadukPop(游戏化)、
     弈客("吻合度"指标是中文用户习惯用语)、KaTrain(桌面教学标杆:失点圆点/坏棋回退/校准 bot)、星阵(自研引擎+AI 解死活)
   - 商业模式验证:免费 50 局/月 → 订阅按局数×深度分档

2. **`教学课程体系调研报告.md`**(课程大纲依据):
   - 共识教学顺序(OGS 源码/learn-go.net/IWTG 36 步/聂道场教材/弈客启蒙 25 集/小喵小汪 30 集逐集实抓)
   - 18 种零基础题型清单;粒度基准(每课 5-8 分钟、每 6-7 课综合练习);
     分级锚点:启蒙=25→15级(规则+吃子)、入门=15→10级(死活+对杀)
   - "零基础→独立下完整盘"合理体量:30-40 课 + 300-700 道分层练习

3. **`TESTING-REPORT.md`**(质量基线):6 缺陷清单(含 1 个 P1 教学内容错误:打二还一还提提不掉,
   行为 oracle 抓到)、断言强度统计、疫苗断言位置、残余风险声明。

## 7. 路线图(下一步做什么)

- [ ] **V1 剩余**(优先级序):
  1. **SQLite 持久化**(对局/复盘/用户进度落盘,根治"重启即失")——后端唯一架构债
  2. **LLM 分级讲解**:KataGo 失点/胜率 JSON → LLM → 分水平中文解说(错因归类/棋谚关联);
     需接入大模型 API(候选:智谱/GLM 等);这是核心差异化
  3. 错题本 + 间隔复习(复盘失误自动入错题本,对标 AI Sensei flashcards × 101 错题本)
  4. OGS 账号对局导入(OGS REST API 开放,/api/v1/games/{id} 可直取 SGF)
- [ ] **V2**:课程扩展(逃子专项/分章综合练习/拆边与定式/引征题)、从对局自动出题、
  吻合度指标(中文习惯)、UGC 题库、机构 B 端作业系统
- [ ] 工程化:git init + 首提交;浏览器走查脚本化入仓;CI 挂 validate_deep + pytest

## 8. 横向对比建议(给对比会话的提示)

- **对比维度建议**:①教学课程体系完整性(本项目 30 课 vs 对方)②AI 能力(是否 human-SL 档位校准/失点分析)
  ③学习闭环(学→练→下→复盘是否打通)④许可合规(引擎/内容可否商用)⑤中文本地化深度
- **本项目的可对比资产**:调研报告(§6)里的竞品功能矩阵可直接作为对比框架;
  课程树一屏可打印(`npx tsx --eval "import('./src/courses/index.ts').then(m => m.chapters.forEach((ch,i)=>console.log(i+1,ch.title,ch.lessons.length)))"` 在 frontend 下执行)
- **本项目的诚实短板**:无账号体系、无对弈终局数目(数子/数目)、无 LLM 讲解、课程练习量(~30 题)远低于
  调研建议的 300-700 题、双活课是概念演示
- **其他项目可能没有的**:human-SL 档位校准对弈(多数项目只有"压 visits 式弱化 AI")、
  行为 oracle 验证的课程内容(棋形经过引擎级验证)、完整的许可合规清单

## 9. 会话操作提示

- 后端代码改动后需重启 uvicorn 才生效;前端 Vite HMR 自动生效
- 引擎相关报错先看 `/tmp/gotutor-backend.log`;浏览器自动化用 browser-use 技能(本会话已验证可用,
  注意:`evaluate` 里别引用未定义的 document 变量;点击优先 `evaluate + dispatchEvent`)
- 当前浏览器标签(iab-tab:ff5581f5-…)里有一个测试遗留的 error banner 状态,刷新即清
- `frontend/debug_*.mts` 是调试残留物,可删
