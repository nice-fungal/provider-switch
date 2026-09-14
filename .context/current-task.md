# 移除 Prompts 功能方案

> 目标：从 CC Switch 中**完整移除 Prompts 管理功能**（首页右上角 Book 图标入口、Prompt 面板、Pi Prompt 文件/模板管理、DeepLink prompt 导入及其全部上下游代码）。
>
> 背景：全局 Prompts 是反模式，各应用的 CLAUDE.md / AGENTS.md / GEMINI.md 等提示词文件应由用户/项目自行管理，与 CC Switch 无关。性质与已移除的 Skills 功能一致。

## 约束（用户明确）

1. **只删代码，不碰文档** —— `docs/`、`README*.md`、`CHANGELOG.md`、`release-notes/`、`deplink.html` 全部保留。
2. **不碰数据库** —— `prompts` 表定义、历史 migration、备份逻辑全部保留；不新增 DROP TABLE migration。
3. **不碰本地文件** —— 各应用配置目录下的 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `SOUL.md`、`~/.pi/agent/` 下的 prompt 模板等磁盘文件不做任何清理。
4. **DeepLink 中与 Prompt 有关的部分要删** —— `resource=prompt` 分支、确认弹窗、解析逻辑全部移除；deeplink 框架本身保留（provider / mcp 继续可用）。

## 删除范围

### 1. 前端 UI 层（整删文件）

- `src/components/prompts/` 整目录：
  - `PromptPanel.tsx`（顶层面板，含 `PromptPanelHandle` / `PromptPrimaryAction` 导出、`prompt-imported` 事件监听）
  - `PiPromptPanel.tsx`
  - `PiNativePromptResources.tsx`（Pi 系统提示词文件 + slash-command 模板）
  - `PromptLibrary.tsx`
  - `PromptListItem.tsx`
  - `PromptToggle.tsx`
  - `PromptFormPanel.tsx`
- `src/components/deeplink/PromptConfirmation.tsx`

### 2. 前端数据层（整删文件）

- `src/hooks/usePromptActions.ts`
- `src/lib/api/prompts.ts`
- `src/lib/piPromptTemplate.ts`
- `src/lib/piPromptSlug.ts`

### 3. 前端引用清理（改文件）

- `src/App.tsx`
  - 删 `PromptPanel` / `PromptPanelHandle` / `PromptPrimaryAction` 导入（74-77 行）与 lucide 的 `Book` 图标导入（15 行，仅 prompts 按钮用）
  - 删 `View` 类型中 `"prompts"`（105 行）与 `VALID_VIEWS` 中 `"prompts"`（138 行）
  - 删 `promptManagementBusy` / `promptNavigationBusy`（170-171 行）、`promptPanelRef` / `promptPrimaryAction`（238-240 行）
  - 删 `managementBusy` 中 `promptNavigationBusy`（590 行）
  - 删 `case "prompts"` 渲染分支（955-966 行）
  - 删 header 标题分支（1210-1213 行）、header 新增按钮块（1324-1339 行）、右上角 Book 按钮（1466-1474 行）
- `src/components/DeepLinkImportDialog.tsx`
  - 删 `PromptConfirmation` 导入（17 行）、`result.type === "prompt"` 分支与 `prompt-imported` CustomEvent 派发（153-165 行）、`getTitle` / `getDescription` 的 prompt case（247-248、259-260 行）、渲染分支（281-283 行）
- `src/lib/api/deeplink.ts`：删 `ResourceType` 中 `"prompt"`（3 行）、`content` / `description` prompt 字段（33-35 行，provider/mcp 不用）、`ImportResult` 中 `{ type: "prompt" }`（66 行）
- `src/lib/api/index.ts`：删 `promptsApi` 导出（8 行）与 `Prompt` 类型导出（20 行）
- `src/lib/api/profiles.ts`：删 `ProfilePayload.prompts` 字段（29 行）
- `src/components/profiles/scope.ts`：删 `hasScopeSnapshot` 中 `prompts` 解构与判断（28-33 行）
- **共用 key 复用点（注意）**：`src/components/hermes/HermesMemoryPanel.tsx:92`、`src/components/workspace/WorkspaceFileEditor.tsx:80`、`src/components/workspace/DailyMemoryPanel.tsx:318,490` 复用 `t("prompts.loading")` 作为通用 Loading 文案——改指其他通用 key 或保留 `prompts.loading` 单独一个 key

明确不动（名称含 prompt 但与功能无关）：
- `src/types.ts` 的 `PromptCacheRoutingMode` / `promptCacheKey` / `promptCacheRouting`（Codex prompt cache 特性）
- `src/components/sessions/utils.ts` 的 `extractCodexPrompt*`、`CodexFormFields.tsx` / `codexProviderPresets.ts` 的 `promptCacheRouting`
- `src/components/settings/` 中的 `showRestartPrompt` 等重启提示
- `src/components/deeplink/McpConfirmation.tsx:171` 的注释（顺手清理即可）

### 4. i18n（改文件）

- `src/i18n/locales/zh.json`
- `src/i18n/locales/zh-TW.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/ja.json`

删除 key：顶层 `prompts.*`（约 40 个，en.json 2162-2205 行）、`pi.prompts.*`（约 67 个，991-1059 行）、`deeplink.importPrompt` / `deeplink.importPromptDescription` / `deeplink.promptImportSuccess` / `deeplink.promptImportSuccessDescription`（2658-2665 行）、`deeplink.prompt.*`（2708-2715 行）。每份约 117 个 key，四份同步删。

不删：`codexConfig.promptCacheRouting*`（约 5 个/份，无关）。注意 `prompts.loading` 的共用问题（见上节）。

### 5. Rust Commands 层

- **整删** `src-tauri/src/commands/prompt.rs`（115 行，12 个 command）
- `src-tauri/src/commands/mod.rs`：删 `mod prompt;`（23 行）与 `pub use prompt::*;`（59 行）
- `src-tauri/src/commands/deeplink.rs`：删 `import_prompt_from_deeplink` 导入（1-4 行）与 `"prompt" =>` 分支（61-68 行）
- `src-tauri/src/commands/sync_support.rs`：删 `PromptService` 导入（4 行）与 `PromptService::sync_all_to_live` 调用（14-16 行）
- `commands/misc.rs`、`commands/import_export.rs`：无 prompt 引用，确认即可

### 6. Rust Deeplink

- **整删** `src-tauri/src/deeplink/prompt.rs`（85 行）
- `src-tauri/src/deeplink/mod.rs`：删文档注释 `//! - Prompts`（7 行）、`mod prompt;`（12 行）、`pub use prompt::import_prompt_from_deeplink;`（24 行）、resource 文档注释中 prompt（36、40 行）、`DeepLinkImportRequest` 中 prompt 专用字段 `content` / `description`（79-85 行，已确认 provider 分支不用）
- `src-tauri/src/deeplink/parser.rs`：删 `"prompt" => parse_prompt_deeplink(...)` 分支（61 行）与 `parse_prompt_deeplink` 函数（175-239 行）
- `src-tauri/src/deeplink/tests.rs`：删 `use super::prompt::...`（5 行）、`test_import_prompt_allows_space_in_base64_content`（826-846 行）、`test_parse_prompt_deeplink`（873-889 行）、`test_parse_grokbuild_prompt_deeplink`（891-901 行）

### 7. Rust Service 层

- **整删** `src-tauri/src/services/prompt.rs`（727 行，含全部内联测试）
- **整删** `src-tauri/src/services/pi_prompt_files.rs`（521 行）——仅被 prompt commands 与 `PromptService` 引用，随功能一并删除（Pi AGENTS.md 保护与 slash-command 模板管理同时移除）
- `src-tauri/src/services/mod.rs`：删 `pub mod pi_prompt_files;`（11 行）、`pub mod prompt;`（14 行）、`pub use prompt::PromptService;`（41 行）
- `src-tauri/src/services/profile.rs`：
  - 删文档注释中 Prompt 行（4、12 行）与 `PromptService` 导入（23 行）
  - 删 `ProfilePayload.prompts: PerApp<Option<String>>` 字段（129-130 行）
  - 删 `merge_scope_from` 中 prompts 拷贝（146-148 行）、`scope_captured` 判断（157 行）
  - 删 `snapshot_current` 中 prompts 快照（211-218 行）
  - 删 apply 时 prompt diff/enable 逻辑（398-416 行）
  - 删测试中的 prompts 断言（451-455、479 行）
- `src-tauri/src/services/sync_protocol.rs`：删 `should_trigger_auto_sync_for_table` 中 `"prompts"`（62 行）与测试 `auto_sync_table_filter_covers_shared_configuration` 中 `"prompts"`（441 行）
- `services/webdav_sync.rs`、`services/s3_sync.rs`、`services/webdav.rs`、`services/s3.rs`、`services/provider/live.rs`：无 prompt 引用，确认即可
- 明确不动：`sql_helpers.rs` 的 `promptTokenCount`、`session_usage_grokbuild.rs` 的 `prompt_id`、`proxy/*`、`provider.rs` 的 `promptCacheKey` / `promptCacheRouting`

### 8. Rust 数据/配置层（清理代码，不动 schema）

- **整删** `src-tauri/src/prompt.rs`（16 行，`Prompt` struct）
- **整删** `src-tauri/src/prompt_files.rs`（86 行，`prompt_file_path`，含内联测试）
- `src-tauri/src/app_config.rs`：
  - 删 `PromptConfig` / `PromptRoot` struct（175-206 行）；参照 Skills 先例，`MultiAppConfig.prompts` 字段（378-380 行）改为 `Option<serde_json::Value>` 兼容占位以吞掉旧配置 key
  - 删 `Default` 中 `prompts: PromptRoot::default()`（415 行）
  - 删 `maybe_auto_import_prompts_for_existing_config` 调用与日志（480-497 行）及函数本体（555-598 行）
  - 删首次启动 `auto_import_prompt_if_exists` 调用（543-550 行）及函数本体（600-674 行）
  - 删 `use crate::prompt_files::prompt_file_path;`（210 行）
  - 删 prompt 相关内联测试（898-1080 行：`write_prompt_file` helper、`auto_imports_existing_prompt_when_config_missing` 等 6 个测试）
- `src-tauri/src/lib.rs`：
  - 删 `mod prompt;` / `mod prompt_files;`（29-30 行）、`pub use prompt::Prompt;`（61 行）、`PromptService` re-export（66 行）
  - 删首次启动 prompts 导入块（928-953 行，`is_prompts_table_empty` 门控 + 8 个 app 循环）
  - 删 12 个 prompt command 注册（1401-1413 行：`get_prompts`、`upsert_prompt`、`delete_prompt`、`enable_prompt`、`import_prompt_from_file`、`get_current_prompt_file_content`、`get_pi_prompt_file`、`replace_pi_prompt_file`、`delete_pi_prompt_file`、`list_pi_prompt_templates`、`upsert_pi_prompt_template`、`delete_pi_prompt_template`）
- `src-tauri/src/settings.rs`、`src-tauri/src/init_status.rs`、`src-tauri/src/error.rs`：无 prompt 引用，不动

### 9. Rust DAO（保留文件，仅清 mod 导出）

- `src-tauri/src/database/dao/mod.rs`：删 `pub mod prompts;`（8 行）
- `src-tauri/src/database/dao/prompts.rs` **保留文件**（不再被引用，避免触碰 schema/迁移）
- `src-tauri/src/database/dao/profiles.rs`：更新 3 行处注释（提到 Prompt 快照）
- `src-tauri/src/database/mod.rs`：删文档注释 `提示词管理`（6 行）、`prompts.rs` 行（21 行）、`is_prompts_table_empty`（287-294 行，仅 lib.rs 首次导入用）
- `src-tauri/src/database/migration.rs`：`migrate_prompts`（151-188 行）依赖 `Prompt` / `PromptRoot`；参照 Skills 先例改为 no-op 或删除函数与调用（56 行）——迁入的 prompts 数据已无任何代码读取。`MultiAppConfig.prompts` 占位需保留以便旧 JSON 配置反序列化不报错
- `src-tauri/src/database/schema.rs`：`prompts` 表 DDL（76-81 行）与列迁移（735-739 行）**保留**；340 行注释顺手更新
- `src-tauri/src/database/backup.rs`：`REQUIRED_TABLES` 中 `"prompts"`（683 行）**保留**（表还在，备份校验带上无害）

### 10. 测试（删/改）

**前端：**
- **整删** `tests/hooks/usePromptActions.test.tsx`
- **整删** `tests/components/PromptPanel.test.tsx`
- **整删** `tests/components/PromptFormPanel.test.tsx`
- **整删** `tests/components/PiNativePromptResources.test.tsx`
- **整删** `tests/lib/piPromptTemplate.test.ts`
- **整删** `tests/lib/piPromptSlug.test.ts`
- `tests/integration/App.test.tsx`：删 `prompts.manage` 按钮断言（402 行）
- `tests/config/managementListLocales.test.ts`：删 `prompts.searchPlaceholder` / `prompts.searchAriaLabel` / `prompts.noSearchResults` 必填 key（17-19 行）

**Rust：**
- `src-tauri/tests/profile_roundtrip.rs`：删 `Prompt` / `PromptService` 导入（11 行）、`prompt` helper（57-63 行）、`save_prompt` / `enable_prompt` 调用与断言（170-175、188、208、248-258、413、498-643 行附近）
- `src-tauri/src/database/tests.rs`：删 prompts 列断言（234、277-280 行）与 `MultiAppConfig` 测试字面量中 `prompts:`（711、761 行）；保留 prompts 表存在性测试（33-39、94-99 行，因为表本身保留）
- `src-tauri/src/services/prompt.rs`、`services/pi_prompt_files.rs`、`app_config.rs` 的内联测试随文件/代码删除
- 不动：`tests/skill_sync.rs` 中的 `prompt.md` 是 skill 内容文件名，与 Prompts 功能无关

## 明确不动

- `src-tauri/src/database/schema.rs`：`prompts` 表定义保留
- `src-tauri/src/database/migration.rs`：其余历史迁移保留
- `src-tauri/src/database/backup.rs`：备份逻辑中 prompts 表保留
- `src-tauri/src/database/dao/prompts.rs`：文件保留
- `docs/`、`deplink.html`、`README*.md`、`CHANGELOG.md`、`docs/release-notes/`：全部不动
- 用户磁盘文件：`CLAUDE.md`、`AGENTS.md`、`GEMINI.md`、`SOUL.md`、`~/.pi/agent/` 下 prompt 模板等不动
- 无关命名：Codex `promptCache*`、`promptTokenCount`、sessions prompt 提取、settings 重启提示等

## 执行顺序

1. 删前端 UI 组件（`components/prompts/` 整目录、`deeplink/PromptConfirmation.tsx`）
2. 删前端 hooks / api / lib（`usePromptActions.ts`、`api/prompts.ts`、`piPromptTemplate.ts`、`piPromptSlug.ts`）
3. 清 `App.tsx` 所有 prompt 引用（视图、按钮、state、header）
4. 清 `DeepLinkImportDialog.tsx`、`api/deeplink.ts`、`api/index.ts`、`api/profiles.ts`、`profiles/scope.ts`；处理 `prompts.loading` 共用处（HermesMemoryPanel / WorkspaceFileEditor / DailyMemoryPanel）
5. 清四份 i18n locale
6. 跑 `pnpm tsc --noEmit` 验证前端编译
7. 删 `commands/prompt.rs`，清 `commands/mod.rs`、`commands/deeplink.rs`、`commands/sync_support.rs`
8. 删 `deeplink/prompt.rs`，清 `deeplink/mod.rs`、`deeplink/parser.rs`、`deeplink/tests.rs`
9. 删 `services/prompt.rs`、`services/pi_prompt_files.rs`，清 `services/mod.rs`、`services/profile.rs`、`services/sync_protocol.rs`
10. 删 `prompt.rs`、`prompt_files.rs`，清 `app_config.rs`、`lib.rs`
11. 清 `database/mod.rs`、`database/dao/mod.rs`、`database/dao/profiles.rs` 注释、`database/migration.rs` 的 `migrate_prompts`
12. 删/改前端测试
13. 删/改 Rust 测试
14. 跑 `cargo check` 验证 Rust 编译
15. 跑 `pnpm test` 与 `cargo test` 验证测试通过
16. 跑 `pnpm tauri:build` 验证整体构建

每一步结束都跑一次对应编译，确保中间状态可编译。

## 风险与注意点

- **`prompts.loading` 共用 key**：Hermes / Workspace 三个组件复用该 key 作为通用 Loading 文案。优先改指到通用 key（如无则在 `common` 下新增或保留 `prompts.loading` 单独一个 key），否则删 key 后这三处显示原始 key 字符串。
- **`ProfilePayload.prompts` 兼容性**：profiles 表存 JSON，删除字段后 serde 反序列化旧 profile 快照需确认是否 `deny_unknown_fields`（现有代码用 `#[serde(default)]`，读取兼容；旧快照里的 prompts 槽位将被静默忽略）。
- **`migration.rs` 的 `migrate_prompts`**：依赖即将删除的 `Prompt` / `PromptRoot`。参照 Skills 先例将 `config.prompts` 改为 `Option<serde_json::Value>` 占位；`migrate_prompts` 建议直接删除（迁入数据已无人读取），但需保证旧 JSON 配置反序列化不报错。
- **`backup.rs` 的 `REQUIRED_TABLES`**：保留 `"prompts"`（表还在，旧备份校验不受影响）；不要顺手从 schema 删表。
- **`sync_protocol.rs` 自动同步触发表**：删 `"prompts"` 后，旧版本客户端写 prompts 表不再触发本端自动同步；prompts 表仍随整库 dump 同步，无害。
- **i18n key 删除**：`managementListLocales.test.ts` 校验 locale key 一致性，四份文件必须同步删；同时删该测试中 prompts 必填 key。
- **`pi_prompt_files.rs` 决策**：Pi 的 AGENTS.md 保护与 slash-command 模板管理仅通过 prompt commands 暴露，确认无其他入口后随功能整删；若后续想让 Pi 文件管理独立存活，需重新设计入口（本方案不做）。
- **deeplink 旧链接**：已分发的 `resource=prompt` deeplink 将报"不支持的资源类型"错误，属预期行为（与 Skills 移除一致）。
