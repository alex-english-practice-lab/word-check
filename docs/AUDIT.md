# Phase 1 实际代码审计

## 来源与边界

2026-10-09 直接从 `https://github.com/alex-english-practice-lab/word-check.git` 克隆；基线 HEAD 为 `08e12efd991e425710d496e30f3f0a73b9c02605`（Add files via upload）。独立本地分支 `phase1/vocabulary-schema-v1`。没有根据早期聊天里的文件结构描述推断实现。

已检查根目录 index.html、app.js、core.js、style.css、ielts-word-list.txt、README.md、全部跟踪文件列表及 Git 历史。`github-word-check/` 下同名六个文件是重复上传的副本，与根目录内容相同，旧子目录保持不动。本次只重构根目录入口；访问 `/word-check/github-word-check/` 仍是旧版。后续是否移除或重定向应单独确认。

## 实际功能与调用链

| 项目 | 当前实现（基线） |
| --- | --- |
| 技术栈 | HTML/CSS + 两个普通 JS 脚本，core 同时提供 Node CommonJS 导出，无框架、构建步骤、包依赖或测试框架 |
| 默认加载 | app.loadDefault 直接 fetch 根目录 ielts-word-list.txt，cache=no-cache；loadVersion 防止旧异步结果覆盖新导入；失败时保留已加载词表 |
| 原始数据 | TXT 48 个 List，解析为 3,610 词条；25 个无音标；保留 2 条警告；没有 28 个 List 上限 |
| TXT 格式 | Word List/List/unit/中文标题；允许 *、多种 IPA 括号、组合词性、短语及斜杠变体；中文释义按括号外分隔符拆分 |
| 临时导入 | 2 MB 上限；UTF-8 严格解码，失败尝试 GB18030；当前页内使用；恢复默认按钮；刷新恢复 IELTS |
| List 选择 | 数字范围及逗号组合；校验实际已加载编号；默认 1–4；chips 只作显示，不是独立点击选择器 |
| 抽题 | 每 List 数量（默认最多10，0跳过）或混合总量手填（0全部）；Fisher–Yates 不放回；begin 再随机排序一次 |
| full 模式 | 音标 + 词性 + 所有释义，输入英文拼写 |
| single 模式 | 每题随机一条释义，隐藏音标/词性；仍按原词/声明变体判分，不接受任意同义词 |
| 判分 | 去首尾空格、小写、弯引号标准化、合并空格；正确分独立/提示后；skip 是错误；空提交提示；graded 防重复计分 |
| 提示 | 每次揭示一个英文字母，非字母保持；显示下划线；达到字母数禁用 |
| 结果 | 三类数量、原词、输入、提示次数、释义；可提前结束，只统计已提交；重练 wrong 和 assisted；可重新设置 |
| 离开保护 | active 时 beforeunload；主动结束 confirm；Enter 表单提交及下一题按钮焦点 |
| 本地/历史 | 全部只在 JS 内存中，无 localStorage/sessionStorage/IndexedDB、登录、历史或后端 |
| 浏览器协作 | 可选 document.modelContext 工具读取词表概况、开始检查；保留原接口和限制 |
| 响应式 | CSS 850px / 680px 断点；未改 CSS |

## 数据形状的直接依赖

- core.parse 输出 `{word,phonetic,pos,senses,list,id,variants?}`，原 id=words.length，仅当次解析序号。
- core.accepts 依赖 word/variants；sampleByList 依赖数字 list；sampleMixed/shuffle 不依赖具体词库。
- app 的 selection、listPlan、计数、预览、题目 List 标签及 modelContext 依赖数字 list。
- renderQuestion 依赖 senses、phonetic、pos；hint 依赖 word；grade 和结果表依赖原词条对象。
- 原 id 没有被页面读取，无既存持久化记录需要用数组 ID 回填迁移。
- 只有 loadDefault 依赖 IELTS 文件路径。IELTS 标题和 1–48 文案是默认库展示，不是抽题引擎范围限制。

因此保留原消费形状的适配层足够；不需要重写 UI、core 或答题流程。新增 libraryId/listId/wordRevision 供未来记录使用，id 换成固定词条 ID。

## 原有数据/行为风险（不顺带更改）

1. 第 1772 行 landfill 缺少 IPA 右括号，原解析器补显示并警告，继续保留。
2. 第 3198 行 contaminate 与同单元之前同名行合并；合并结果可能混有名词和动词含义。本次不判断作者意图、不擅自修正词汇，原始两行与警告可追溯。
3. TXT 同单元同名条目自动合并，不可表示独立同名异义项；规范 JSON 可表示，旧 TXT 规则不变。
4. 25 个词条无音标，尤其短语，仍按原样展示。三个 slash 变体保留：bring round、as to、as though。
5. 原默认加载中用户编辑设置可能重新启用 start；旧代码没有统一 loading 状态机。正常加载及并发导入有测试，不把广泛 UI 状态机改造混入 Phase 1。
6. 名为 isDemo 的标志实际一直 false；未凭名称假定存在示例词库选择功能。
7. 静态前端/公开词库可被学生检查源码，不能被描述为防作弊或严格锁题系统。

## 新架构的兼容性风险及控制

- JSON 初始数据约 1.17 MB（未压缩），原 TXT 约 252 KB；固定 ID、显式外键和接受答案有体积成本。没有新 CDN 依赖；是否压缩发布/后续优化须测实际网络，不假称加载性能完全不变。
- catalog 增加一次请求；版本不匹配/加载失败沿用错误重试 UI。绝不回退到临时 ID 的 TXT 默认库，否则会静默破坏学习身份。
- 默认路径仍兼容 GitHub Pages 项目子路径；无打包器 root-path 假设。
- 临时 TXT 转换要求现代安全上下文的 crypto.randomUUID；GitHub Pages HTTPS 和 localhost 支持。当前静态网页本来就需 HTTP fetch，不承诺 file:// 打开或旧浏览器支持。
- root UI 的所有题型、判分、结果和 CSS 原样保留；新增库仅通过轻量开发入口测试，不扩展正式 UI。
