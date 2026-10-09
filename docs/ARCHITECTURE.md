# Word Check — Vocabulary & Practice Schema v1

## 范围和模块

Phase 1 保留无框架、无构建步骤的静态网页。`core.js` 原样保留；`app.js` 仅接入词库边界。`practice-records.js` 未被页面加载，不会暗中开始收集学习数据。

```
data/catalog.json → vocabulary.js registry → VocabularyLibrary
VocabularyLibrary → toPracticeWords() → 原 app.js / core.js
原 TXT → core.parse() → fromLegacy() → VocabularyLibrary
PracticeAttempt + AttemptAnswer → deriveProgress() → WordProgress
```

完整 JSON 字段类型见 `types/schema-v1.d.ts`。类型文件无需编译；运行时词库校验由 `vocabulary.js` 提供，记录校验由 `practice-records.js` 提供。未接入任何数据库专用 API。

## Vocabulary 实体和关系

| 实体 | 必需字段 | 语义 |
| --- | --- | --- |
| Library | `schemaVersion`, `id`, `name`, `version`, `source`, `lists` | 一个独立词库；schemaVersion=1；version 是内容发布版本，不等于 schema 版本 |
| Library 可选 | `description`, `importDiagnostics` | 介绍；旧 TXT 的行号、原文与警告，继续展示原提示 |
| source | `type` | builtin/user/test；可附 format/path/sha256/attribution，不承担访问控制 |
| List | `id`, `libraryId`, `name`, `number`, `order`, `words` | 一对多所属 Library；number 仅为兼容当前数字 List 输入，不是主键 |
| Word | `id`, `libraryId`, `listId`, `revision`, `order`, `text`, `phonetic`, `pos`, `senses`, `acceptedAnswers` | 每个词条属于一个 List 和 Library；revision 从 1 开始 |

`phonetic`、`pos` 允许空字符串，`senses` 是非空释义数组，`acceptedAnswers` 必须包含原词 `text`，可以附现有变体。一次题目依旧按完整单词判断，不接受未经词库声明的同义词。词性保存原展示字符串，不强制拆解。缺失音标不人为补写。

Library 嵌套 Lists，List 嵌套 Words，同时显式保存外键，便于未来拆表；校验拒绝父子外键不一致、重复 ID、重复显示编号及不支持的 schema。空 List 可以存在，旧 UI 只显示有词条的 List，不能从空 List 抽题。

## ID、排序与内容版本

- 内置 Library 固定为 `lib:ielts`；新建用户 Library 使用 `lib:<UUID>`。
- List：`<libraryId>/list/<UUID>`；Word：`<libraryId>/word/<UUID>`。内置 UUID 首次迁移生成后已固化到 JSON，运行时不生成内置 ID。
- UUID 不来自拼写、释义、数组位置或 List 编号。不同词库里的 emperor，以及同库同 List 中不同释义的 bank，都有不同 ID。
- `order` 仅负责排序，`number` 是当前 UI 的数字入口；排序、改名、修正拼写或释义不能重建 ID。同库移动词条保留 word.id，更新 listId；跨库复制产生新的 word.id，不能将另一个词库的 ID 塞入本库。
- 对同一概念的校正保留 word.id，增加 revision；若实际上是替换成另一个词或拆分/合并多个义项，则新增 ID，不能静默把已有学习状态当作新词的状态。
- 内容版本建议 SemVer：修正内容 PATCH，添加内容 MINOR，破坏性身份迁移 MAJOR。任何已发布内容变化均提升 library.version；涉及某词展示或判分变化还增加其 revision。单纯调整排序不改变词义 revision。
- 后续发布应使用新文件（如 `ielts.1.1.0.json`），更新 catalog 中的 URL/version，保留旧发布快照。当前 `ielts.v1.json` 为 1.0.0 初始快照，不要覆盖已经用于历史记录的版本。manifest 与内容版本不匹配时拒绝加载，而非误用。
- schemaVersion 升级必须通过显式纯转换函数，保留 ID 并备份原记录。当前遇到非 1 版本直接拒绝；没有凭空声称已实现 v2 迁移。
- 删除条目不能复用其 ID。未来持久化版本需要随发布保存 retired ID/替代关系清单；拆分和合并必须人工确认映射，禁止仅按英文自动合并进度。当前历史快照使删除后的题目仍可追溯；没有实现自动迁移进度或墓碑服务。

### 从旧词库迁移

`ielts-word-list.txt` 原文件保持不变，包含 48 个 List。使用原 `core.parse` 得到 3,610 个可练习词条，导出为规范 JSON；逐项比对拼写、音标、词性、释义、变体、顺序及导入警告。原解析器的数字 `id` 只是当次数组位置，不被导入到持久化身份中。

`scripts/migrate-ielts.cjs` 是一次性迁移工具，输出 apply_patch 补丁；目标存在时拒绝执行，避免意外重新分配 ID。**不应删除 JSON 后重新运行它来更新词库。** 后续在规范 JSON 中保留既有 ID，仅为新增实体分配 UUID。

当前 TXT 临时上传仍使用原解析器，再通过 `fromLegacy()` 转成一个全新 user Library。刷新后丢失，行为与旧版一致。每次重新导入 TXT 都是新库，绝不靠同名或行号假装找回旧身份。未来保存/再次打开用户词库应保存整个规范 JSON（含 ID），或者在明确选择既有 Library 后提供人工审核更新映射。**Phase 1 不承诺跨次 TXT 上传的 ID 连续性。**

旧 TXT 同 List 同名词原本会合并释义，这个行为在临时导入和首轮迁移中保留。规范 JSON 本身允许同 List 多个同名异义词，互不合并。

## 词库加载接口

`WordVocabulary`（浏览器）或 `require('./vocabulary')`（Node）：

| 接口 | 返回 / 行为 |
| --- | --- |
| `validate(library)` | 校验后返回原对象；错误抛出；不修改数据 |
| `fromLegacy(parsed, options)` | parsed 为原 parse 结果；options 包括 name、id、version、source、idFactory；生成规范新 Library |
| `toPracticeWords(library)` | 按 order 排序并生成独立练习数组；旧 word/phonetic/pos/senses/list/variants 加稳定 id/libraryId/libraryVersion/listId/wordRevision |
| `createRegistry({fetcher})` | fetcher 可注入，便于静态 URL、本地测试或未来其他来源 |
| `registry.register({id, url, version?})` | 注册远程 JSON；与 data 二选一；拒绝重复 Library ID |
| `registry.register({id, data, version?})` | 注册内存 JSON 副本；测试与未来用户库使用 |
| `registry.loadManifest(url)` | 原子注册 catalog，返回默认 Library ID；资源 URL 相对 manifest 解析，兼容 `/word-check/` 子路径 |
| `registry.load(id)` | 异步返回校验后的 Library；拒绝未知 ID、加载失败、身份或指定版本不符 |
| `registry.list()` / `defaultId` | 返回注册信息副本 / 默认 ID |

当前 app 独立持有 activeLibrary，单次练习仅从一个 Library 抽题；不会把不同 Library 的 List 1 混在一起。`core.js` 只消费适配词条，没有 IELTS 文件路径、固定 28 或 48 个 List 的依赖。

轻量开发入口 `window.WordCheckLibraries` 提供 `register`、`list`、`switchLibrary(id)`、只读 `activeId`。先注册测试 fixture，再调用 switchLibrary；练习中拒绝切换；成功返回 Library ID，加载失败保留当前库并显示现有错误 UI、返回 undefined，过期请求也返回 undefined。测试库未注册到正式 catalog，无新增选择界面。该入口不是权限边界。

## Practice Attempt / Answer / Progress

### Attempt：一次练习及其题目快照

| 字段 | 约定 |
| --- | --- |
| schemaVersion / id | 1 / 创建一次后重试复用的 UUID |
| identity | profileId 为本地长期身份 UUID；userId 可 null；deviceId 为随机安装 ID，不是设备指纹 |
| libraryId / libraryVersion | 开始时的精确词库身份与内容版本 |
| listIds | 本次选择的稳定 List IDs，可含抽 0 题的已选 List，不使用显示编号 |
| mode | full / single / mixed；mixed 仅为模型能力，当前 UI 仍是一轮一个模式 |
| questionCount / questions | 实际抽中总量 / 已物化的原顺序，不是配置中的 0（全部），也不是完成题数 |
| startedAt / completedAt | 标准 UTC ISO（带毫秒 Z）；completedAt 对未完成为 null，对 completed/abandoned 为终止时间 |
| source | `{type:'free',id:null}`、preset 或 assignment 的明确 ID 引用 |
| parentAttemptId | 重练关联原 Attempt；没有则 null，重练不能覆盖原练习 |
| status | in_progress → completed 或 abandoned；终态不可重新开启 |

每个 Question 有独立随机 `id`、wordId、listId、wordRevision、mode、`snapshot` 和 `prompt`。同一个 wordId 在同一轮重复出现也会有不同 question.id。snapshot 保存 text/phonetic/pos/senses/acceptedAnswers；prompt 保存当时实际显示的 meaning/phonetic/pos，单释义题不会在回看时重新随机。词库更新不重写题目快照。

### Answer：一道已提交题目的历史事实

| 字段 | 约定 |
| --- | --- |
| schemaVersion / id | 1 / 创建器使用 `attempt.id + '/answer/' + question.id`，重试必须复用 |
| attemptId / questionId / wordId / mode | 与 Attempt 中指定 Question 一致 |
| response | 原始 text、skipped 布尔值、hintCount 非负整数；空白答案仅允许显式跳过 |
| result | isCorrect、outcome（correct/assisted/wrong）、grading |
| grading | algorithm=`legacy-spelling-v1`；normalizedAnswer 和当时规范化的 acceptedAnswers |
| answeredAt / durationMs | UTC 时间戳；可选答题耗时以 null 表示未知，不强行伪造 |

判分沿用 `core.normalize`：去前后空格、转小写、弯引号转换、折叠连续空格。提示后答对仍 isCorrect=true，但 outcome=assisted；skip 始终 wrong，即使输入框有正确拼写。不同意图不能合并成单一 correct 布尔值。

模型验证可发现不一致，但客户端历史不是防作弊证据。未来教师成绩应由可信后端按固定题目重新判分；当前无身份验证、防篡改或作业锁定功能。

### Word Progress：可重建的学习状态

复合主键 `(profileId, wordId, mode)`，不按英文文本聚合。包括 libraryId、practiceCount、wrongCount、assistedCount、independentCorrectCount、lastAnsweredAt、lastAnswerId、lastResult、review。

只计入已提交的 Answer，包括未完成/提前退出练习中已答的题；未呈现或未提交题目不算错。wrongCount 包含显式 skip，但不包含 assisted。当前纯 reducer 将最近一次 independent correct 标记为 ready，否则 needs_review；dueAt/algorithm 预留 null，没有实现间隔复习调度。不同模式独立统计，不能用一次 full 正确覆盖 single 错误。

## 记录接口与一致性

`WordPracticeRecords` 或 `require('./practice-records')` 暴露纯函数：

- `createAttempt({library,identity,questions,listIds?,source?,parentAttemptId?,id?,startedAt?,idFactory?})`：questions 为 `{wordId,mode,senseIndex?}` 请求，物化快照；调用前由抽题引擎决定词与顺序。single 的 senseIndex 应使用已显示那条释义的索引。
- `createAnswer({attempt,questionId,text?,skipped?,hintCount?,answeredAt?,durationMs?})`：按当时快照判分，生成新事实，不修改 Attempt。
- `validateAttempt(attempt)` / `validateAnswer(answer,attempt)`：关系、快照、时间、模式、判分轨迹校验，失败抛错。
- `closeAttempt(attempt,answers,{status?,completedAt?})`：返回终态副本；completed 必须每题有一个事实，abandoned 可以 0 个；结束时间不得早于答案。
- `mergeAnswers(...batches)`：相同 ID 相同内容去重；同 ID 不同内容、同题不同 Answer ID 抛冲突，绝不最后写入覆盖。单独调用该去重器不取代关联 validateAnswer。
- `mergeAttempts(...batches)`：同一原始定义去重，in_progress 可升级终态，不能反向降级；两个不同终态或题目定义冲突抛错。
- `deriveProgress(attempts,answers)`：先去重并验证关联，再按 answeredAt、Answer ID 排序汇总，返回可丢弃/重建的状态。终态 completed 缺少事实时拒绝计算，防止同步半批次导致错误统计。

不同设备各自生成随机 Attempt/Question UUID，避免碰撞；同一提交重发使用原 ID、原 answeredAt、原 payload，不能每次重试重建答案。相同时间使用 ID 确定顺序；这里的“最近”是客户端事件时间，不承诺物理全局时钟精确一致。未来后端可额外记录 receivedAt 用于诊断，不能改写原答题时间。

`types/schema-v1.d.ts` 的 `PracticeRepository` 是 **Phase 2 待实现接口**：`putBundle` 原子写入 Attempt 及 Answers，`getAttempt`、`listAttempts`、`getProgress` 读取。同步应以整个 bundle 验证后事务提交；若分页先到终态而答案未齐，暂存并等齐，不能用部分数据更新正式 Progress。保留冲突用于显式恢复，不静默选最新。

## Guest、账户与未来跨设备同步

Guest 初次持久化时生成 profileId/deviceId 并保存本地；本阶段尚未创建本地身份。登录后由账户—profile 关联表归属一个或多个 Guest profile，旧历史不必改写 userId。不同设备离线 Guest 的 profile 不自动视为同一人，合并需用户确认归属。

当前 reducer 按 profile 返回状态；未来账户级视图可对获授权的 profile 集合重放所有去重事实，再映射到统一学习者 ID。不能直接相加不同设备上传的 Progress，因为事实可能重叠。重复练习保留多个 Attempt，重复上传同一次练习则去重。

词库数据、题目快照、记录事实、派生缓存与 UI 解耦；以后可使用 IndexedDB repository 和 HTTP repository，Supabase 仅是可选实现。登录、授权、隐私删除/云端墓碑、冲突恢复界面、同步游标、服务端判分均未实现。

## Phase 2 最小步骤（本次未执行）

1. 实现 IndexedDB repository 与 schema 版本迁移；持久化随机 Guest profile/device ID，给不可用存储提供明确降级提示。
2. 在 begin 时写题目快照，在 grade 时幂等写 Answer，finish 时原子写终态。浏览器崩溃保留 in_progress，重开时询问恢复或放弃；重练创建新 Attempt。
3. 将 getProgress 作为派生缓存；启动时可从事实重建，先测试重复写、事务失败、刷新、崩溃及词库升级。
4. 加最小本地错题视图：按 profile/library/mode 筛选 wrongCount 或 review.status，提示后答对是否纳入由明确选项决定。
5. 复用现有抽样函数，先将 Progress 的 wordId 连接到当前词库，再抽样。已删除词提示不可用；修订词按明确规则提示复习，不能根据拼写随意匹配。暂不做云同步或教师系统。
