# Phase 1 开发交付报告

## 结论

在直接克隆的 GitHub main `08e12ef` 上完成根目录应用的底层架构改造，工作分支为 `phase1/vocabulary-schema-v1`。旧练习消费接口通过适配层保留，多词库通过注册表加载，不再由 app 硬编码某个 IELTS TXT 文件。

本报告对应本地开发分支；未推送 GitHub、未创建 PR、未合并 main、未部署生产。正式网站未被本次操作修改。源代码归档包含全部修改，可在审核后导入独立分支；不可把源代码归档中的旧 `github-word-check/` 子目录误当作新版入口。

## 已完成

- Vocabulary Schema v1：Library/List/Word 完整字段、显式归属、运行时校验、固定唯一 ID、词条 revision 与库版本。
- 默认 IELTS 无损迁移为规范 JSON：48 个 List、3,610 个可练习词条，原 TXT 原样保留。
- catalog + registry + loader + 旧界面适配器；支持注册与加载多个独立 Library，并通过轻量入口切换。
- 原 TXT 临时导入继续支持 UTF-8、GB18030、2 MB 上限及大于 28 的 List 编号。
- 三条词汇的测试专用第二词库，含跨库 emperor 同名、同库 bank 异义；未加入正式 catalog。
- Practice Record Schema v1 的字段定义、接口、快照、记录校验、幂等合并、终态约束和按模式推导 Progress 的纯函数。
- 完整审计、架构/迁移文档、测试及 bounded Phase 2 步骤。

## 尚未实现（有意排除）

页面还不会保存 Practice Attempt / Answer / Progress；没有 Guest 身份持久化、IndexedDB、错题集 UI、自动复习调度、云同步、账户系统、Supabase、Preset UI、Assignment、教师后台或新的多词库选择界面。`PracticeRepository` 是接口约定而非已存在的存储实现。纯函数中的 mixed-mode 能力不代表页面新增了混合题型模式。

## 文件检查与修改

已检查文件及功能依赖详见 `AUDIT.md`，覆盖 GitHub 根目录六个文件及重复子目录六个文件。

| 文件 | 改动 |
| --- | --- |
| app.js | 新增 registry/activeLibrary；默认和导入统一走 Library→适配器；轻量切换入口；未改抽题/判分/提示/结果函数 |
| index.html | 仅在 app.js 前增加 vocabulary.js 脚本 |
| README.md | 增补本地运行、测试、文档链接及范围声明 |
| vocabulary.js | 新增 schema 校验、TXT 转换、适配器、多库目录和加载接口 |
| data/catalog.json | 默认词库注册信息及版本 |
| data/ielts.v1.json | 固定 ID 的 1.0.0 词库和原导入警告 |
| scripts/migrate-ielts.cjs | 一次性迁移补丁生成器；拒绝覆盖现有 ID 库 |
| practice-records.js | 新增纯数据逻辑；页面不加载它 |
| types/schema-v1.d.ts | 全部实体与未来 repository 接口的 JSON 类型定义 |
| package.json / .gitignore | 轻量测试命令；忽略本地测试依赖和截图 |
| tests/vocabulary.test.cjs | 原词库、加载、ID、移动/排序、抽样与解析测试 |
| tests/records.test.cjs | 历史事实、重复提交、重复练习、题型、版本与生命周期测试 |
| tests/fixtures/second-library.json | 极小的测试词库 |
| tests/browser.cjs | 原始提交与新分支的真实浏览器交互和截图比较 |
| docs/AUDIT.md / ARCHITECTURE.md / PHASE1-REPORT.md | 审计、设计和交付说明 |

**原样未改：core.js、style.css、ielts-word-list.txt、github-word-check/ 下全部旧文件。**

## 验证

环境：Node 24.19.0；单元测试使用 Node 自带 test/assert，无测试框架包；真实浏览器使用可选 Playwright 1.51.1 + Chromium 134.0.6998.35。本地以 upstream `08e12ef` 的原始文件作为 before，以当前工作树作为 after，在相同浏览器、确定性随机种子下比较。测试地址包含 `/word-check/` 项目子路径。不是在生产网站上执行写操作。

| 验收项 | 验证内容与结果 |
| --- | --- |
| A 原词库兼容 | 全部 3,610 词条逐字段相等，原始 TXT SHA-256 一致；所有原词及可接受变体判分通过；48 Lists、25 无音标、2 条原警告一致 |
| B 第二词库 | 独立 registry 加载、按库抽样、真实页面切换、不同 List 范围；练习进行中拒绝切换；通过 |
| C 唯一 ID | 跨库同名词、同 List 同名异义、ID 去重、内容修改/重排/移动/改编号保留 ID、坏外键拒绝；通过 |
| D 记录模型 | 正确/错误/提示后正确/skip、同词重复题、重复练习、full/single 分开统计、多设备重发去重、冲突拒绝、未完成/终态、词库修订快照；通过 |
| E 回归 | full/single、空提交、重复提交、提示、skip、结果、重练、提前结束、重新设置、手填混合数量、每 List 数量及0跳过、TXT/GB18030/体积限制、加载失败及并发导入；通过 |

`npm test`：14/14 通过，无跳过。`npm run test:browser`：浏览器流程通过；桌面设置、桌面结果、手机设置、手机答题四组截图前后像素一致；结果文本一致；390px 宽页面无横向溢出。可选 document.modelContext 工具的概况与 active 时拒绝新练习已检查。`git diff --check` 与 JS 语法检查通过。

截图由测试写到未跟踪的 `test-artifacts/`，不作为生产资源。桌面视口 1280×900，手机视口 390×844。浏览器回归不等于已测试真实 iPhone/Safari、所有浏览器版本、弱网加载性能或云端部署；这些没有被宣称完成。

## 兼容性问题与成本

- 没有观察到本次重构导致的练习行为变化。原始数据中的 landfill 音标缺括号、contaminate 重复合并、25 处无音标保留并记录，未擅自修词。
- 规范 JSON 未压缩 1,170,009 bytes，原 TXT 252,185 bytes；默认加载多一次 catalog 请求。换取显式 ID 和版本的体积成本已知，尚未测生产弱网。
- TXT 重新上传视为全新临时库，不能自动继承旧身份。未来保存用户库必须保存带 ID 的规范格式。
- 原重复子目录仍可访问旧版；本次不删除不相关文件。
- 原 UI 在慢加载期间修改设置可能重启用 start 的行为已记录，未进行超范围状态机重写。
- 没有新增网站运行时依赖、第三方 CDN、构建器或数据库依赖。Playwright 仅安装在本地忽略的 node_modules 中用于可选浏览器验证；package.json 没有依赖项。

## Phase 2（只建议，未开始）

1. 实现 Guest profile/device 标识和 IndexedDB repository，原子保存 Attempt 与 Answers，支持版本迁移。
2. 把当前 begin/grade/finish 接到上述接口，处理崩溃恢复、提前结束、重练新 Attempt 和重复写。
3. 从事实重建按 wordId+mode 的 Progress，再提供最小本地错题列表。
4. 将 Progress 筛选结果按 ID 连接到当前 Library，复用现有抽样器；处理删除或修订词条。
5. 先验证本地可靠性，再单独规划账户/跨设备同步，勿在此阶段顺带加入教师平台。
