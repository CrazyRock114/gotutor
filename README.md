# Gotutor · AI 围棋教室

**零基础入门课程 + AI 复盘**,从"围棋是什么"学到独立下完一盘棋,再用 KataGo 分析你的实战对局。前后端全部基于开源组件构建,引擎与权重许可允许商用。

当前进度:**入门课程(8 章 30 课)+ AI 复盘 + 人机对弈已上线**——"学 → 下 → 复盘"闭环打通。调研依据见[围棋教学开源资源调研报告.md](./围棋教学开源资源调研报告.md) 与 [教学课程体系调研报告.md](./教学课程体系调研报告.md)。

## 入门课程(零基础)

课程顺序依据调研共识(聂道场教程 / IWTG / OGS / 弈客启蒙多方一致),**8 章 27 课**:

1. **认识围棋**:什么是围棋、棋盘与星位、先后手
2. **气、提子与打吃**:数气、提子、打吃与逃子、双叫吃
3. **虎口、禁入点与打劫**:虎口、禁入点、打劫、打二还一
4. **连接与切断**:断点、虎口补断
5. **吃子技巧**:关门吃、征子(经极小极大搜索验证)、枷吃(箱形网,经战术求解器验证)、倒扑、接不归
6. **眼与死活**:眼、两眼活棋、直三、真假眼、曲三/丁四常型
7. **对杀**:数气与紧气、对杀公式(先比外气)、双活
8. **从吃子到围地**:金角银边、占角布局、终局与数目、毕业综合练习

(共 30 课:3+4+4+2+5+5+3+4)

- 每课 4-6 步:图文讲解 + 棋盘演示(单步播放)+ 互动练习
- 三种题型:**点击题**(棋盘上点正解,带逐点错误反馈)、**连续题**(多手正解链,对手自动应对)、**选择题**
- 学习进度存 localStorage,目录页显示完成状态与"继续学习"
- 所有棋形经自动化脚本验证(`scripts/validate_courses.mts`:回放每课演示与练习,校验合法性)
- 复杂手筋经搜索实证:征子(`scripts/ladder_search.mts`)、打二还一与枷吃候选证伪(`scripts/tactics_search.mts`)
- 待扩展:逃子专项、分章综合练习(弈客模式)、拆边与简单定式、征子引征题

## 人机对弈(与"人类棋风"AI 下棋)

- AI 使用 **KataGo human-SL 模型**(b18c384nbt-humanv0)为主模型,输出**人类棋风着法**,棋力按段位档位校准:20级 / 15级 / 10级 / 5级 / 1级 / 初段(每局通过 `overrideSettings.humanSLProfile` 动态切换,无需多引擎)
- 9/13/19 路可选,执黑或执白,支持**停一手、悔棋、认输**;非法着点实时拒绝(禁入点/占用/劫争)
- 对局结束(双方连续停着或认输)后,**一键把本局送入 AI 复盘**——学 → 下 → 复盘闭环
- 实现:对弈引擎与复盘引擎同为 analysis 引擎(analysis 协议天然支持整谱与逐手),着法合法性由 KataGo 终审;棋盘逻辑(sgfmill)仅做展示层快速反馈

## AI 复盘

- **SGF 上传 / 粘贴**:支持 19/13/9 路盘,中国/日本规则,让子棋(AB/HA),自动编码探测(UTF-8/ISO-8859-1)
- **整谱 AI 复盘**:KataGo analysis 引擎一次查询分析全部手数,`maxVisits` 60/120/250 三档可选
- **实时进度**:SSE 流式推送每手结果,复盘进行中即可交互;刷新页面自动断线重连补齐
- **胜率曲线(黑视角)**:点击任意位置跳转;错着/大失误以圆点标注在曲线上
- **失点标记(KaTrain 风格)**:棋盘上按失误严重度着色的圆点(黄=小损、橙=错着、红=大失误),悬停查看详情
- **AI 候选点**:当前局面 Top3 候选(胜率标签),侧栏附目差与访问量
- **形势领地图**:KataGo ownership 渲染为领地涂色(后端已归一化为黑视角)
- **失误跳转列表**:按失点排序,≥5 / ≥1.5 / 全部 三档过滤,一键跳转
- 键盘导航(← → Home End)、点击棋盘交叉点跳转到该手、示例棋谱一键体验

## 快速开始(macOS + Apple Silicon)

```bash
# 1. 安装引擎与模型(约 100MB,首次)
./scripts/setup_engine.sh

# 2. 启动前后端
./scripts/dev.sh
# 打开 http://localhost:5173
```

Linux/NVIDIA 服务器:安装 CUDA 版 KataGo 后 `export KATAGO_BIN=<路径>`,其余相同;配置见 `backend/analysis.cfg`(基于官方 `analysis_example.cfg`)。

首次载入棋谱时引擎需 10~30 秒加载模型;之后每手分析速度取决于硬件(本机 Apple A18 Pro/Metal,60 visits 约 0.3~0.8 秒/手)。

### 生成示例棋谱(可选)

```bash
backend/.venv/bin/python scripts/gen_demo.py   # KataGo 自弈 140 手,公有领域
```

## 架构

```
浏览器 (Preact + @sabaki/shudan 棋盘 + 自研分析 UI)
   │  REST(提交/快照) + SSE(流式进度)
后端 (FastAPI)
   ├─ SGF 解析(sgfmill,编码探测/让子/停着)
   ├─ 失点计算与失误分类(纯函数,已测)
   └─ KataGo analysis 子进程(JSON 行协议,串行队列)
```

| 层 | 选型 | 许可 |
|---|---|---|
| 引擎 | KataGo v1.18 + kata1-b18c384nbt | 代码 MIT;网络 KataGo NN License(可商用) |
| 后端 | FastAPI + sgfmill | BSD/MIT 系 |
| 前端 | Preact + Vite + TypeScript | MIT |
| 棋盘渲染 | @sabaki/shudan(BoundedGoban) | MIT |
| 棋盘规则重放 | @sabaki/go-board | MIT |

### 关键实现约定(踩坑记录)

- KataGo analysis 输出的字段名是 **`turnNumber`**(不是 `turn`);`analyzeTurns` 查询**没有终止行**,收到最后一个 turn 即完成。
- `reportAnalysisWinratesAs = SIDETOMOVE` 时,**ownership 也是行棋方视角**,后端统一乘 `+1/-1` 归一化为黑视角(正=黑),数组行主序从左上角(A19)开始。
- analysis 模式强制要求配置键:`numAnalysisThreads`、`nnMaxBatchSize` 等——务必基于官方 `analysis_example.cfg` 修改。
- 中文 SGF 常不带 `CA[]` 属性(规范默认 ISO-8859-1),后端探测 UTF-8 后强制 `override_encoding`。

## 目录结构

```
backend/
  app/
    main.py       # FastAPI 路由:POST /api/games、GET /api/games/{id}、SSE /stream、/api/demo
    engine.py     # KataGo analysis 子进程封装(就绪检测/串行锁/中途终止)
    sgf.py        # SGF → GameInfo(着法 GTP 化、贴目、规则、让子)
    analysis.py   # 失点/分类/摘要(纯函数)
    store.py      # 内存对局存储 + 订阅广播
    runner.py     # 单局复盘编排
  analysis.cfg    # KataGo 分析配置(官方示例裁剪)
  models/         # 网络权重(gitignore,setup 脚本下载)
  demo/game.sgf   # 自弈示例棋谱
  tests/          # pytest:坐标转换/失点计算/解析边界
frontend/
  src/
    components/   # ReviewPage / GobanPanel / WinrateGraph / MistakeList / UploadPage
    components/learn/ # LearnHome(目录)/ LessonView(步骤播放)/ LessonBoard / ExerciseBoard
    learn/        # 课程数据模型 + 进度存储
    courses/      # 课程内容 ch1-ch6(自创中文内容,棋形经脚本验证)
    goban-utils.ts# GTP 坐标转换、局面重放(go-board)、领地渲染
    api.ts        # REST + SSE 客户端
scripts/
  setup_engine.sh # 引擎+模型安装
  dev.sh          # 一键启动
  gen_demo.py     # KataGo 自弈生成示例
  smoke_test.py   # 后端端到端冒烟
  validate_courses.mts # 课程棋形验证(tsx,回放全部演示与练习)
  ladder_search.mts    # 征子几何搜索验证
scripts (cont.)   # check_sign*.py 等:协议实验脚本(ownership 朝向/符号验证)
```

## 测试

```bash
cd backend && .venv/bin/python -m pytest tests/ -q      # 单元测试(12 项)
.venv/bin/python scripts/smoke_test.py                  # 端到端冒烟(需服务运行中)
```

## 路线图

- [x] MVP:上传 → 复盘 → 胜率曲线 + 失点标记 + 失误跳转
- [x] 入门课程模块:8 章 30 课(顺序经调研共识校准,棋形经脚本验证)
- [x] 人机对弈:human-SL 校准档位陪练 + 一键转复盘
- [ ] 课程扩展:枷吃、接不归、对杀(长气紧气/基础对杀/双活)、打二还一、综合练习课(大纲见教学课程体系调研报告 C附)
- [ ] V1:错题本 + 间隔复习(需引入 SQLite 持久化)、LLM 分级讲解、OGS 账号导入
- [ ] V2:课程体系扩充(13/19 路过渡,对标 GoMagic 三段设计)、从对局自动出题、UGC 题库、机构 B 端

## 许可说明

- 本仓库代码:随项目开源(建议 MIT)
- KataGo 代码 MIT;kata1 网络权重采用 KataGo Neural Network License(MIT 风格,允许商用)
- 示例棋谱由 KataGo 自弈生成,无第三方版权
- 注意规避(详见调研报告):Leela Zero 网络(CC BY-NC 禁商用)、OGS/Kaya 源码(AGPL 只可借鉴)
