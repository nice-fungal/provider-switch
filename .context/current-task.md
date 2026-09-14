# Kilo 适配上游模式与路由管理的实施方案

## 任务状态

- 状态：方案已完成，业务代码尚未实施。
- 调查对象：commit `be2e52ae` 及当前工作区中的 Kilo 集成。
- 上游架构依据：`15c0b3ce`，引入设备本地 direct/proxy 模式，移除旧备份、恢复及热切换流程。
- 本轮仅覆盖本文档，不修改 Rust 或前端业务代码。
- 实施前重新检查工作区和文件差异，保留用户及后续提交中与本任务有关的修改。

## 已确认的需求和范围

1. 用户会卸载重装，不兼容旧配置、旧数据、旧接管状态或旧接口。不得为 Kilo 增加数据迁移、旧备份回放、历史状态推断或路径别名。
2. Kilo 唯一对话入口为 `POST /kilo/v1/chat/completions`。
3. Kilo 客户端 Base URL 为 `http://127.0.0.1:<实际监听端口>/kilo/v1`；保留服务器对非回环监听地址、IPv6 和动态端口的现有处理。
4. Kilo 与 Codex 共用代理服务器，但应用命名空间、供应商选择、凭据、请求行为和用量归属独立。
5. 保留现有 Kilo 专用 handler，不把 Kilo 请求交给 Codex handler、adapter 或请求转换流程。
6. Kilo 没有由本项目管理的客户端配置文件；所有操作均不创建、读取、备份或恢复 Kilo 原生配置，也不修改其他应用的客户端文件。
7. 启停、模式、路由切换、退出和下次启动接入现有 `mode::controller`。
8. 保留现有 Kilo Provider 配置、预设、模型与请求覆盖、流式处理、旁路使用统计和错误处理。
9. 保持 Kilo 不支持自动故障转移的现状，不在本任务中增加 failover、MCP、会话导入、模型发现或新协议。
10. 不为此次适配清理其他应用已有的历史迁移机制，不扩展为整个代理架构重构。

## 当前实现的问题

### 1. 旧服务逻辑被重新引入并破坏编译

`src-tauri/src/services/proxy.rs` 在 `stop()` 后出现没有函数声明的代码段，且包含重复的 `stop()`、对已删除方法的调用、缺失 `kilo` 字段的 `ProxyTakeoverStatus` 构造。

已对工作区文件及 commit 文件执行 Rust 语法检查，均在第 555 行报告 `unexpected closing delimiter`。仅修改括号无法修复重复接口及架构脱节。

该文件自 `be2e52ae^` 起累计新增约 2,077 行、删除 11 行，主要是上游已移除的接管代码和过时测试。实施时以父提交为核对基线，逐块清理，不直接覆盖整个文件。

### 2. Kilo 开关没有接入生产入口

新增的 `ProxyService::set_kilo_channel` 没有调用者。

现有 `set_proxy_takeover_for_app` 命令调用 `mode::controller::enter/exit`，但 controller 的 `write_proxy/write_direct` 没有 Kilo 分支，`PROXY_APPS` 也仍只有 Claude、Codex、Gemini、Grok Build。

### 3. 路由与默认供应商混用

Kilo handler、旧切换方法及 ProviderService 特殊分支仍直接使用 settings/DB 的当前供应商或 DB 的 `enabled`。

新架构已规定：

- `Purpose::Direct`：默认供应商指针。
- `Purpose::InUse`：当前模式下实际使用的供应商。
- proxy 模式下保存独立 `proxy_route`，不能通过代理切换改写默认指针。
- `mode/current.rs` 的结构测试禁止业务代码直接调用旧的当前供应商读取方法。

### 4. 生命周期和界面状态不完整

Kilo 未加入 `PROXY_APPS`，因此会被启动恢复、退出分离、关闭全部路由、无应用使用时停服务器等流程忽略。

`ProviderList.tsx` 使用 `supportsFailover` 控制代理状态传递和默认供应商查询，导致不支持 failover 的 Kilo 同时被排除在代理状态显示之外。

## 目标状态模型

复用现有 `ModeState`，无需新增模式枚举、状态版本、契约算法或专用 Kilo 状态文件。

| 字段 | Kilo 语义 |
|---|---|
| `mode = direct` | Kilo 本地通道关闭；默认供应商可被选择，但本地端点不转发 |
| `mode = proxy` | Kilo 通道已启用，保存独立代理路由 |
| `attached = true` | 当前运行实例已接通 Kilo 通道 |
| `attached = false` | 通道关闭，或程序退出后等待下次启动接通 |
| `proxy_route` | 保存的代理目标；切换不改默认指针，关闭后仍保留 |
| `contract` | 始终为 `None`，因为没有客户端文件契约 |

`live-state.json` 是模式和代理路由的事实来源。沿用 `operation::commit_target` 更新模式，并按现有接口维护 `proxy_config.enabled` 镜像；该字段不能成为 Kilo 启用判断或请求放行依据。这是沿用当前控制器接口，不增加旧数据兼容逻辑。

首次安装、本地 Kilo 模式记录不存在时视为 direct，不依据数据库 `enabled` 推断或恢复 Kilo 模式。

默认供应商与代理路由的例子：

1. 新建供应商 A，默认指针为 A，通道关闭。
2. 首次开启时路由初始化为 A。
3. 开启状态切换到 B：默认指针仍是 A，路由为 B，请求发给 B。
4. 关闭通道：路由 B 保留，界面当前供应商回到 A，本地请求返回不可用。
5. 关闭状态切换默认供应商到 C：只更新默认指针。
6. 再次开启：优先使用保存的有效路由 B；用户可在开启后明确切换到 C。

已保存的 Kilo 路由存在但供应商已丢失或配置损坏时，明确报错，不静默替换为默认供应商。只有从未设置路由时才用默认指针初始化。启动恢复失败时关闭 Kilo 通道并记录原因。

## 分文件实施

### 1. src-tauri/src/services/proxy.rs

- 对照 `be2e52ae^`，移除本次重新引入的无函数头代码、重复 `stop()`、`set_kilo_channel`、旧同步接管、备份更新、恢复、旧热切换及专用辅助方法。
- 移除依赖这些旧接口的新增测试；上游已迁入 controller 的 Claude 契约测试不重复保留。
- 保留父版本的服务器启停、配置更新、实际端口保存、切换锁、事件和 Codex/Grok 当前仍使用的 live 写入辅助接口。
- 核对同名辅助函数，保留上游仍有调用者的版本，例如 TOML MCP 保留逻辑。
- `get_takeover_status()` 增加 `kilo: is_proxy(&AppType::Kilo)`。
- `is_takeover_active()` 包含 Kilo；也可复用 controller 应用列表判断，但避免为此引入不必要循环依赖。
- 如 controller 需要清除展示目标，增加与 `set_active_target` 对称的轻量 `clear_active_target` 服务方法，内部调用现有 `ProxyServer::clear_active_target`。
- 启动和因地址变更而重建服务器时，都将 `self.switch_locks.clone()` 传入服务器共享状态；重启不能创建另一套锁，否则 handler 和控制器无法串行捕获路由。
- 所有 Kilo 生产调用迁入 controller 后删除 `switch_proxy_target`，不保留旧包装入口。

### 2. src-tauri/src/mode/controller.rs

- `PROXY_APPS` 从四个应用扩展为五个，加入 Kilo。
- `write_proxy` 增加 Kilo 分支：校验 Provider，设 `contract = None`，只提交目标模式状态。
- Kilo 分支放在通用 `build_proxy_urls()` 调用之前或按分支延迟构造地址；状态提交无需读取客户端文件或构造代理契约。
- `write_direct` 增加 Kilo 分支：只提交模式状态。避免为 Kilo 读取不需要的 direct Provider 或进入其他应用的 live 逻辑。
- `enter_locked` 为 Kilo 先确定并校验候选路由，再启动服务器；无默认供应商、目标缺失或配置无效时不启动服务器。
- Kilo 保存的路由丢失时返回明确错误；不要复用当前通用的“路由不存在就回落默认指针”行为。
- 路由校验成功后、启动和提交启用状态前，通过现有 `get_proxy_config_for_app("kilo")` 确保配置行存在。`set_proxy_flags_sync` 当前只做 UPDATE，不会自行插入行；否则可能提交了本地模式却没有写入 DB 镜像。
- `switch_route_locked` 在提交 Kilo 路由前校验配置，失败时原路由、默认指针和展示目标保持原样。
- 已持有切换锁的调用使用 locked 方法，避免重复获取同一把锁。
- Kilo 关闭或分离完成后清除服务器中的 Kilo active target，防止另一个应用仍在运行时展示旧目标。
- `exit`、`exit_all`、`detach_all`、`stop_server_if_unused`、`resync_route` 随统一列表覆盖 Kilo。
- `detach_all` 保留 proxy 模式和路由，设 attached=false；`exit_all` 则设 direct。
- 为 Kilo 的启动路径增加轻量分支：只读取本地模式和保存的路由；无记录时初始化为 direct，有 proxy 模式时重新校验并接通。
- Kilo 启动不调用 `drain_legacy_backup`，不检测代理占位符，不使用 DB enabled 推断模式。
- 接通失败时将 Kilo 设为 direct、attached=false，保留路由供修复后重试；不能留下请求可用或界面启用的状态。
- 状态提交失败必须向调用方报告，不能提前发布新的 active target。复用现有提交和恢复规则，不引入新的跨应用事务框架。
- 默认不修改其他应用的启动迁移和契约投影行为。

### 3. src-tauri/src/mode/state.rs

- 补充 `attached` 和模式注释，说明 Kilo 的 attached 表示运行时通道接通，而非客户端文件已改写。
- 保持 `contract = None` 和既有序列化结构，不新增字段、不升级 STATE_VERSION。
- 如需说明 `direct` 的默认供应商含义，仅调整注释，不改变其他应用语义。

### 4. src-tauri/src/proxy/kilo.rs

- 将请求放行判断从 `config.enabled` 改为本地 mode 为 proxy 且 attached=true。
- 应用级超时等参数仍从 `get_proxy_config_for_app("kilo")` 读取。
- 供应商读取通过 `mode::current::provider_for(..., Purpose::InUse)`，删除直接调用 settings 当前供应商读取方法。
- 在 Kilo 请求开始时短暂持有应用切换锁，一次捕获模式、目标供应商及 Provider 配置，校验后释放锁，再执行请求体处理和上游网络 IO。
- 捕获时检查路由存在；不能让 `Purpose::InUse` 对丢失路由的通用回落导致 Kilo 请求静默改发默认供应商。
- 关闭后新请求返回 `503 kilo_proxy_disabled`；如果共享服务器已停止，客户端连接失败属于预期。已捕获目标的请求不随切换改发。
- 若关闭最后一个通道导致共享服务器停止，已有连接按现有服务器停止行为结束，不在本任务中增加连接排空机制。
- 保留专用请求覆盖：忽略客户端供应商选择字段，以配置模型为准，保留 thinking、reasoning_effort、当前强制流式行为和 include_usage。
- 保留现有 Header 过滤与上游凭据替换、响应处理和错误统计。
- 用量归属使用请求捕获的 provider_id 和出站模型，后续切换不能改写当前请求的统计归属。
- 自循环校验继续覆盖 `/kilo/v1` 和完整对话路径，不添加 `/api/kilo` 支持。

### 5. src-tauri/src/services/provider/mod.rs

Kilo 保留不读写客户端文件的分支，但所有状态决策统一使用新模式接口。

#### 新增

- 校验配置，保存 Provider。
- 使用 Kilo 切换锁串行化“保存并设置首个默认供应商”的过程。
- 用 `Purpose::Direct` 判断是否缺少默认指针；首个 Provider 通过既有 `PendingTarget.pointer` 提交为默认供应商。
- 不在新增时自动开启通道，也不替换已有代理路由。
- 删除生产代码中的旧直接 getter 调用，以通过 `mode/current.rs` 结构测试。

#### 切换

- 移除当前 Kilo“先改 DB/settings，再调用 switch_proxy_target”的分支。
- 在统一切换锁内读取模式和目标 Provider。
- proxy 模式调用 `controller::switch_route_locked`，只改路由。
- direct 模式通过 `operation::commit_target` 提交默认指针，保留模式和已保存路由。
- 整个过程不调用 live writer、MCP 同步或备份方法。
- 无效目标先校验再提交，不能在返回错误时已经改了默认指针。

#### 编辑

- 维持 Kilo Provider ID 不可改的约束。
- 在 Kilo 应用锁内校验并保存配置。
- 如果编辑的是启用的路由，通过已持锁的 resync/目标刷新接口同步名称和状态展示。
- 后续请求使用最新配置；正在执行的请求保持自己的快照。
- 不因名称、凭据或模型修改生成客户端契约或改写其他应用文件。

#### 删除

- 在 Kilo 应用锁内使用 `current::is_referenced` 检查引用。
- 默认指针或启用中的代理路由指向的 Provider 不允许删除，与上游普通供应商规则一致。
- 移除“删除当前 Provider 后自动挑下一家”的旧行为，避免路由被隐式替换。
- 非引用 Provider 可以直接删除，不调用 live 方法或旧热切换方法。
- 通道关闭后，单独保留的历史路由不算启用引用；如删除它，清掉对应保存路由，保证下次开启能按默认指针初始化。
- 对此行为调整现有 Kilo Provider 测试，不能沿用旧的自动切换断言。
- 不新增“取消默认供应商”产品功能；删除默认 Provider 前须切换到另一家。若未来需要删除最后一家，应作为明确的独立行为设计。

### 6. src-tauri/src/proxy/server.rs 与其他代理模块

- `ProxyState` 增加共享的 `SwitchLockManager`，供 Kilo handler 获取与 controller 相同的应用锁。
- 为服务器增加接受外部锁管理器的构造入口，例如 `new_with_switch_locks`，服务层的初次启动和重建路径都使用它。现有独立服务器测试可以继续使用 `new`，由它创建并委托一套独立锁；这不是旧数据或旧配置兼容入口。
- 更新 `response_processor.rs` 中手工构造 `ProxyState` 的测试 fixture，补齐新字段。不要通过 AppHandle 访问 AppState 获取锁，以免无 UI 的服务器测试与请求处理失效。
- 保留现有精确路由：
  `/kilo/v1/chat/completions -> crate::proxy::kilo::handle_chat_completions`。
- 保持 `/v1/chat/completions`、`/codex/v1/chat/completions` 使用 Codex handler。
- 不新增 `/api/kilo`、`/kilo/v1/responses`、Kilo models 路由或通用路径别名。
- 保留 Kilo 不进入通用 Codex adapter 的限制。
- 保留 `provider_router::provider_supports_failover` 和 failover 命令对 Kilo 的拒绝。
- `proxy/types.rs` 中 `ProxyTakeoverStatus.kilo` 的注释改为来源是本地模式。
- `commands/proxy.rs` 继续使用当前 controller 命令入口；配置更新仍将 enabled 写成当前模式镜像。
- 不新增数据库迁移。保留当前 schema 和 Kilo DAO 行支持，首次使用可按现有机制创建行。
- 不增加 Kilo 的旧数据库版本或旧设置导入逻辑。

### 7. 前端状态与文案

主要文件：

- `src/components/providers/ProviderList.tsx`
- `src/components/providers/ProviderCard.tsx`
- `src/hooks/useProxyStatus.ts`
- 必要时 `src/components/proxy/ProxyToggle.tsx`、`src/components/settings/ProxyTabContent.tsx`、代理设置组件及当前使用的语言文件

具体改动：

- 分别定义 `supportsProxy = isProxyAppId(appId)` 与 `supportsFailover = supportsProxy && appId !== "kilo"`。
- 卡片的代理运行状态、通道状态和默认供应商查询由 supportsProxy 控制。
- failover 查询、队列按钮、优先级和健康相关专属流程继续由 supportsFailover 控制。
- Kilo 通道启用时显示真正的路由目标；默认供应商不是路由目标时可以单独标记为“默认供应商”。
- Kilo 的默认供应商标记不要使用“退出后写回客户端”等其他应用专属提示。
- Kilo 开关成功提示使用“通道已开启/关闭”，不显示“已接管/恢复 Kilo 配置”。
- 切换、编辑、进出通道后正确刷新 Provider、代理状态和默认供应商相关缓存，沿用现有 query key。
- 不增加 Kilo 配置导入、failover 按钮或新设置页面。
- 不修改 Kilo 表单 JSON 结构、预设和统计页面。

## 实施顺序

1. 重新检查 git 状态，核对 `be2e52ae^`、当前文件和实际生产调用，记录基线错误。
2. 清理 `services/proxy.rs` 中复活的旧代码和过时测试，恢复语法与上游服务边界。
3. 实现 controller 的 Kilo 状态分支、首次安装与重启路径，并补齐状态查询。
4. 改造 ProviderService 的 Kilo 增删改和切换，删除旧 switch_proxy_target 调用。
5. 改造 Kilo handler 的模式判断和请求快照，保留独立 URL 与专用转发。
6. 调整前端能力判断和 Kilo 文案。
7. 补充控制器、供应商管理、路由隔离和前端回归测试。
8. 执行格式、编译、针对性测试及构建；新故障出现时修复并重跑受影响检查。
9. 检查最终 diff，确认未添加迁移、备份、路径别名或无关功能，记录手工验证结果。

步骤 2 至 5 存在接口依赖，允许合并为一次后端改动；不得将只修语法但仍不能启用 Kilo 的版本作为完成结果。

## 测试设计

复用现有临时 HOME、内存数据库、动态端口和串行测试设施。任何测试不得读取或改写用户真实配置，不访问真实付费上游。

### 控制器和生命周期

在 `mode/controller.rs` 的模式测试中增加：

1. 无 Provider 或配置无效：启用失败，服务器不启动，通道不启用，无备份。
2. A 为默认，首次启用初始化路由 A；切换 B 后默认仍 A，InUse 为 B。
3. 关闭保留路由 B，状态变 direct；重新开启使用 B。
4. detach 保留 proxy 和 B，attached=false；startup 接回 B。
5. 本地无模式记录，即使 DB enabled=true 也不恢复 Kilo；验证不兼容旧状态的规则。
6. 保存路由缺失或配置损坏，启动失败并关闭通道，不回落 A。
7. Kilo 与另一个应用同时启用，关闭另一个应用后服务器仍运行。
8. exit_all 清除 Kilo 启用状态；单独运行 Kilo 时退出通道可停止服务器。
9. 修改监听端口后 Kilo 路由和状态保持一致，不触发其他应用配置的额外写入。
10. 记录其他应用配置文件内容或预置哨兵，验证 Kilo 单独的增删改、启停和路由操作没有修改它们；Kilo live backup 始终不存在。

### 供应商管理

在现有 Kilo Provider 测试附近验证：

- 首个 Provider 设置默认指针，新增第二个不改默认或路由。
- direct 下切换改默认；proxy 下切换只改路由。
- 无效配置或不存在的目标不会改变现有状态。
- 编辑当前路由后新请求读到最新模型与凭据，展示名称更新。
- 默认供应商、启用中的路由不能删除；普通 Provider 可删。
- 关闭后删除保存的非默认路由会清掉保存路由，下次启用按默认初始化。
- 不出现旧方法调用，不绕过当前供应商读取结构测试。

### HTTP 隔离与请求归属

在 `proxy/server.rs` 的集成测试设施中增加真实本地 HTTP 测试：

- 配置 Kilo 和 Codex 两套 mock upstream，使用不同模型、凭据和 Provider；至少一例使用相同 Provider ID，验证隔离依赖 app_type。
- 请求 `/kilo/v1/chat/completions` 只到 Kilo 上游；请求 `/codex/v1/chat/completions` 只到 Codex 上游。
- 断言 Kilo 使用其配置模型、thinking、reasoning_effort 和 Bearer 凭据，不使用 Codex 字段或凭据。
- 保持服务器运行但关闭 Kilo，Kilo 返回 503，Codex 请求仍可处理。
- 新增路由 B 后，后续请求使用 B；已经捕获 A 的请求用 mock 同步点控制完成顺序，验证仍发往 A。
- mock 返回确定性的 SSE usage，等待统计写入后断言 Kilo 成功和错误记录的 app_type、provider_id 和模型归属。
- 不使用固定 sleep 等待统计，通过有截止时间的轮询或同步信号验证。
- `/api/kilo/v1/chat/completions` 没有注册，返回 404。
- 保留 Kilo 自循环 URL 校验及现有响应处理测试。

### 前端

优先扩展现有测试：

- `tests/components/ProviderList.test.tsx`：Kilo 卡片正确接收代理状态、显示路由和默认供应商，仍不查询或展示 failover。
- `tests/hooks/useProxyStatus.test.tsx`：Kilo 提示不声称改写配置，操作后刷新相关状态。
- `tests/hooks/useProviderActions.test.tsx`：Kilo 代理状态下的切换调用与缓存刷新。
- `tests/components/ProxyToggle.test.tsx`：Kilo 通道启停状态。
- 保留 Kilo ProviderForm、预设和用量展示的现有测试，必要时做回归。

测试名字在实施时按仓库风格确定，不新增仅镜像内部实现的测试。

## 验证命令与完成条件

在仓库根目录运行：

```sh
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm typecheck
pnpm test:unit -- tests/components/ProviderList.test.tsx tests/hooks/useProxyStatus.test.tsx tests/hooks/useProviderActions.test.tsx tests/components/ProxyToggle.test.tsx tests/components/KiloProviderForm.test.tsx tests/config/kiloProviderPresets.test.ts
pnpm build:renderer
```

后端先运行新增 Kilo 测试、模式测试和 `mode::current::tests::current_provider_is_read_through_provider_for`，通过后运行完整 lib 测试。针对性过滤命令以实际测试名称为准。

另外搜索生产代码，确认 `set_kilo_channel`、`switch_proxy_target` 等此次旧入口已无残留，Kilo 不再直接读取旧当前供应商 getter。

完成条件：

- Rust 语法、类型检查和相关回归通过；不能以渲染器构建通过替代 Rust 编译通过。
- 两个命名空间的 HTTP 隔离和凭据隔离由真实本地请求测试证明。
- 生命周期覆盖单独 Kilo 和多应用并用，不能只验证内存模式字段。
- 保留用量归属和专用请求行为，不能因复用 controller 而走 Codex 请求链。
- 新安装默认关闭，无旧状态恢复或迁移。
- 实际修改限定于上述相关模块和测试；若全库检查存在其他基线或环境失败，记录具体原因，并证明此次行为测试通过。
- 在可运行的 Tauri 环境手工验证 Kilo 开关、A/B 路由切换、默认标记、与 Codex 并用、退出重启和错误提示；没有原生环境时明确记录未验证项。

## 实施边界与注意点

- `live-state.json` 与 DB 镜像分两步提交是现有基础设施行为。请求和 UI 读模式，失败要可见，重试或启动需重新对齐镜像；本任务不改造成新的全局事务。
- 应用切换锁不能持有到网络响应或流式结束，否则切换和关闭会被长请求阻塞。
- 请求捕获供应商后，后续切换只影响新请求；共享服务器停止时的连接行为沿用现有实现。
- 用户不要求兼容旧数据，但新版本本身的退出后重启恢复是必需功能，不能一起删掉。
- 文件和方法的具体行号会随清理变化，实施按函数与调用关系定位，不使用当前行号批量删除。
