# Kilo 使用统计调查与改造方案

## 1. 目标与范围

本文聚焦 Kilo 的本地代理使用统计，目标是：

1. 确认 Kilo 与上游 Provider 的协议边界。
2. 判断 Kilo 能否复用现有 OpenAI-compatible usage 解析能力。
3. 说明当前统计系统实际使用的数据维度。
4. 设计 `App + Provider` 维度的用量和缓存命中统计。
5. 在上游并非 OpenAI 公司的前提下，正确处理不同 Provider 的缓存语义。

本文暂不讨论价格计算和费用准确性，也不讨论功能开关或用户配置。

## 2. 术语与目标维度

本文中的 OpenAI 是协议形态，不是 OpenAI 公司。OpenAI-compatible 主要指：

- 请求发往 `/chat/completions`；
- 请求采用 `messages`、`model`、`stream` 等 Chat Completions 风格字段；
- 非流式响应可能使用 `usage.prompt_tokens` 和 `usage.completion_tokens`；
- 流式响应可能在最后一个 SSE chunk 中携带 `usage`。

Provider 可以是 Volc、OpenRouter、DeepSeek 或其他兼容服务。兼容基础协议不等于所有 Provider 都采用 OpenAI 官方完全相同的缓存字段和计数语义。

目标统计归属是：

```text
App + Provider
```

需要进一步分析时细分为：

```text
App + Provider + Model
```

例如：

```text
Kilo + Volc
Kilo + Volc + deepseek-v3
```

## 3. 已确认的 Kilo 请求链路

当前链路是：

```text
Kilo 客户端
  -> CC Switch /kilo/v1/chat/completions
  -> Kilo 专用 handler
  -> Provider {base_url}/chat/completions
```

代码证据：

- `src-tauri/src/proxy/server.rs` 注册独立路由 `/kilo/v1/chat/completions`。
- `src-tauri/src/proxy/kilo.rs` 将其定义为独立的 OpenAI-compatible Chat Completions proxy。
- Kilo Provider 配置形状包含 `npm: "@ai-sdk/openai-compatible"`。
- handler 将上游 URL 固定拼接为 `{base_url}/chat/completions`。
- handler 使用 `Authorization: Bearer <api_key>`，并允许附加 Provider headers。

因此可以确认：

- Kilo 有独立的本地 namespace、Provider 配置和转发 handler。
- 独立 handler 不代表 Kilo 发明了新的上游 Provider 协议。
- 从当前集成边界看，上游使用 OpenAI-compatible Chat Completions。
- CC Switch 当前自行完成 HTTP 转发，没有在运行时调用 `@ai-sdk/openai-compatible`。

## 4. Kilo handler 当前行为与缺口

Kilo handler 在转发前会：

1. 删除客户端携带的 `provider`、`provider_id`、`providerId`。
2. 使用当前 Kilo Provider 配置强制覆盖 `model`。
3. 使用 Provider 配置强制覆盖 `thinking`。
4. 使用 Provider 配置强制覆盖 `reasoning_effort`。
5. 原则上透传其余请求字段。
6. 将请求发送到 Provider 的 `/chat/completions`。
7. 非流式响应整包透传，流式响应以 SSE 字节流透传。

当前 handler 没有接入通用统计链路：

- 没有进入 `process_response`；
- 没有使用 `SseUsageCollector`；
- 没有调用 `UsageLogger`；
- 成功路径只更新 Provider router 状态和代理全局成功率；
- 失败路径只更新路由失败状态，没有写入请求使用明细。

所以 Kilo 当前没有统计，首要原因是独立 handler 没有接入公共统计基础设施，而不是已经发现 Provider 协议不可解析。

## 5. 流式 usage 请求规则

对 Kilo 的流式出站请求，代理必须直接覆盖：

```json
{
  "stream_options": {
    "include_usage": true
  }
}
```

规则如下：

- 不读取用户配置；
- 不把该选项存入数据库；
- 不把它作为 Provider 配置项；
- 在 outbound request 构造阶段直接覆盖客户端传入的 `stream_options`；
- 即使客户端提供了其他 `stream_options`，也以代理生成的对象为准。

该字段只对 `stream: true` 有意义。非流式响应应直接在响应顶层提供 `usage`，不需要发送 `stream_options`。对非流式请求无条件增加该字段可能降低部分兼容 Provider 的接受度。

强制 `include_usage` 只是要求 Provider 在流式响应末尾返回 usage。Provider 是否实际遵守仍需通过运行数据观察。

## 6. 现有 usage 解析能力

现有 OpenAI-compatible parser 支持以下基础结构：

```json
{
  "id": "...",
  "model": "...",
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 20
  }
}
```

映射为：

```text
input_tokens  <- prompt_tokens
output_tokens <- completion_tokens
message_id    <- id
model         <- model
```

流式解析器会从 SSE 事件中倒序寻找最后一个非空 `usage`，然后使用相同规则。

当前 parser 尝试从以下候选字段读取缓存命中：

```text
usage.cache_read_input_tokens
usage.input_tokens_details.cached_tokens
usage.prompt_tokens_details.cached_tokens
usage.prompt_cache_hit_tokens
```

缓存写入候选字段包括：

```text
usage.cache_creation_input_tokens
usage.input_tokens_details.cache_write_tokens
usage.prompt_tokens_details.cache_write_tokens
```

这些只是兼容性候选字段，不代表所有 Provider 都支持，也不代表它们的计数语义完全一致。

## 7. 当前统计维度：以 Codex 为例

### 7.1 请求明细粒度

`proxy_request_logs` 每行对应一次请求，核心字段包括：

```text
request_id
app_type
provider_id
model
request_model
pricing_model
input_tokens
output_tokens
cache_read_tokens
cache_creation_tokens
input_token_semantics
status_code
session_id
data_source
is_streaming
created_at
```

一条 Codex 代理请求可能形成：

```text
app_type      = codex
provider_id   = volc-1
request_model = gpt-5.x-codex
model         = provider-response-model
pricing_model = provider-response-model
data_source   = proxy
```

因此数据库明细粒度是：

```text
单次请求
  + App
  + 实际 Provider
  + 响应模型
  + 请求模型
  + 计价模型
  + 时间
```

`outbound_model` 当前没有独立数据库列。它只会在选择按请求模型计价时影响 `pricing_model`。

### 7.2 Provider 统计维度

现有 Provider 统计内部使用：

```sql
GROUP BY provider_id, app_type
```

选择 Codex 后，Provider 表实际表达：

```text
Codex + Volc
Codex + OpenRouter
Codex + 其他 Provider
```

数据库通过 `(provider_id, app_type)` 与 Provider 表关联，这一归属维度已经够用。

但 Dashboard 顶部 Provider 筛选目前使用 `provider_name`，不是 `provider_id`。如果两张 Provider 卡片同名，汇总筛选会把它们一起统计。精确筛选应使用 `(app_type, provider_id)`，名称只用于显示。

### 7.3 模型统计维度

模型统计使用“有效计价模型”分组：

```text
pricing_model 非空 -> pricing_model
否则              -> response model
```

因此：

- 只筛选 Codex 时，相同模型会跨 Codex Provider 合并；
- 筛选 Codex + Volc 后，结果相当于 `Codex + Volc + Model`；
- `request_model` 保留在明细和日汇总中，但不是当前模型统计表的默认分组键。

### 7.4 日汇总维度

明细压缩为日汇总后，主键保留：

```text
Date
+ App
+ Provider
+ Response Model
+ Request Model
+ Pricing Model
```

日汇总同时保留 input、output、cache read、cache creation、请求数和成功数。因此明细清理后仍可按 App + Provider 统计。

### 7.5 Codex 的双数据来源

Codex 数据可能来自：

```text
代理实时记录：
  app_type = codex
  provider_id = 实际 Provider
  data_source = proxy

本地会话导入：
  app_type = codex
  provider_id = _codex_session
  data_source = codex_session
```

系统使用 request ID，以及时间、模型、token 等指纹，尝试消除代理记录与会话导入的重复数据。

Kilo 当前没有本地会话 importer，因此首期只处理代理实时记录，不需要复制 Codex 的跨数据源导入逻辑。

## 8. 当前界面展示能力

数据库维度基本足够，但界面只使用了其中一部分。

当前以 Codex 为例：

- 可以选择 Codex；
- Provider 表按 Codex + Provider 分组；
- 可以通过 Provider 名称进一步筛选；
- 顶部总览可以显示当前筛选范围的缓存读取量和缓存命中率；
- Provider 表本身没有缓存读取量和缓存命中率列；
- 无法在一个表中直接比较 Codex 各 Provider 的缓存表现；
- Provider 筛选使用名称，不能精确区分同名 Provider 卡片。

Kilo 还存在额外缺口：

- Kilo 不在统计页面的 App 类型和筛选按钮列表中；
- Kilo 没有独立的统计主题和图标映射；
- 即使后端写入 `app_type = kilo`，数据可能进入“全部”汇总，但用户无法单独选择 Kilo。

目标界面应表达：

```text
选择 Kilo
  -> 查看所有 Kilo Provider 的汇总
  -> 选择或比较 Volc、OpenRouter 等 Provider
  -> 查看每个 Provider 的 input、output、cache read、cache hit rate
```

## 9. 缓存语义边界

可以先假设 OpenAI-compatible Provider 会返回基础 usage 字段，并尝试解析：

```text
prompt_tokens
completion_tokens
```

但不能仅凭 `/chat/completions` 或 `app_type = kilo` 推导：

- `prompt_tokens` 是否包含缓存命中 token；
- Provider 是否返回缓存明细；
- 缓存字段位于哪个路径；
- 缓存字段是子集、增量还是独立计数；
- 不同模型是否采用相同语义。

这些行为由实际 Provider 决定。后端不是 OpenAI 公司并不妨碍基础协议兼容，但意味着必须验证兼容程度，不能无条件套用 OpenAI 官方缓存语义。

数据库已有 `input_token_semantics`，可以表达：

```text
TOTAL   input 已包含 cache read/write
FRESH   input 不包含 cache read/write
LEGACY/UNKNOWN 旧记录或语义未明确
```

当前代理写入逻辑主要根据 `app_type` 决定语义。cache-inclusive App 白名单目前是：

```text
codex
gemini
grokbuild
```

这意味着所有 Codex Provider 都被统一解释为 TOTAL。数据库结构支持逐行语义，但当前写入逻辑没有充分使用 Provider 维度。

因此，Kilo 不应简单加入这个 App 白名单。否则所有 Kilo Provider 都会被强制解释为同一种缓存语义，而这正是尚未验证的内容。

假设 Provider 返回：

```text
input = 1000
cache_read = 800
```

如果语义是 TOTAL：

```text
fresh input = 1000 - 800 = 200
cache input = 800
```

如果语义是 FRESH：

```text
fresh input = 1000
cache input = 800
```

两种情况下缓存命中率分母不同。只保存数值但错误解释语义，仍会得到错误的用量和缓存命中率。

## 10. Kilo 目标数据模型

每条 Kilo 请求至少应记录：

| 字段 | 含义 |
|---|---|
| `app_type` | 固定为 `kilo` |
| `provider_id` | 实际完成请求的 Provider ID |
| `provider_name` | 查询时通过 ID 关联，仅用于展示 |
| `request_model` | Kilo 客户端原始模型 |
| `model` | Provider 响应模型；缺失时回退到实际出站模型 |
| `input_tokens` | Provider usage 中解析出的输入字段原值 |
| `output_tokens` | Provider usage 中解析出的输出字段原值 |
| `cache_read_tokens` | Provider usage 中解析出的缓存读取字段原值 |
| `cache_creation_tokens` | Provider usage 中解析出的缓存写入字段原值 |
| `input_token_semantics` | 本条数据的 TOTAL/FRESH/UNKNOWN 解释 |
| `is_streaming` | 是否流式 |
| `status_code` | 实际上游结果 |
| `request_id` | Provider 响应 ID，缺失时生成 UUID |
| `session_id` | 请求关联标识 |
| `created_at` | 请求时间 |

Provider 归属必须使用转发完成后实际使用的 Provider，而不是请求开始时的候选 Provider。Codex 当前在 forwarder 返回后使用实际 `result.provider`；Kilo 即使首期没有故障转移，也应保持这一语义。

## 11. 改造方案

### 11.1 第一阶段：接入基础用量统计

目标：获得可靠的 Kilo + Provider 请求、input 和 output 数据，并收集缓存兼容性证据。

1. 在 Kilo handler 中建立统计上下文：
   - `app_type = kilo`；
   - 捕获客户端原始 `request_model`；
   - 记录 Provider 配置覆盖后的实际出站模型；
   - 记录实际 Provider ID；
   - 记录开始时间、session ID、是否流式。
2. 对 `stream: true` 的 outbound request 强制覆盖：

   ```json
   "stream_options": { "include_usage": true }
   ```

3. 非流式响应复用 OpenAI-compatible response parser。
4. 流式响应复用 SSE collector 和 OpenAI-compatible stream parser。
5. 继续透明地向 Kilo 客户端透传响应，统计作为旁路观察，不改变响应协议。
6. 落库使用 `app_type = kilo` 和实际 `provider_id`。
7. 未返回 usage 的成功响应记录 `usage unavailable` 诊断，不能把未知 token 描述成真实的 0。
8. 错误请求也记录状态，以保证请求数和成功率口径完整；错误请求不伪造 usage。

首期不做：

- 不根据 `app_type = kilo` 统一推断缓存语义；
- 不把 `stream_options` 做成用户配置；
- 不增加 Kilo session importer；
- 不因统计失败阻断或改变业务响应。

### 11.2 第二阶段：Provider 兼容性观察

按 `App + Provider + Model` 观察：

- 流式请求是否返回 usage；
- usage 使用 `prompt_tokens/completion_tokens` 还是其他字段；
- 是否返回缓存读取字段；
- 缓存字段的实际路径；
- 重复相同前缀请求后缓存数值是否合理变化；
- input 与 cache read 的包含关系；
- 同一 Provider 的不同模型是否一致。

诊断数据只保存 usage 元数据、Provider ID、模型和状态，不保存 messages、生成内容、API key 或 Authorization header。

兼容性矩阵建议如下：

| App | Provider | Model | 非流式 usage | 流式 usage | cache 字段 | input 语义 | 结论 |
|---|---|---|---|---|---|---|---|
| Kilo | Volc | 待测 | 待测 | 待测 | 待测 | UNKNOWN | 待验证 |
| Kilo | OpenRouter | 待测 | 待测 | 待测 | 待测 | UNKNOWN | 待验证 |

语义确认后，应写入每条记录的 `input_token_semantics`，或者由明确的 Provider response dialect 推导。不要继续把 Kilo 的语义硬编码成单一 App 规则。

### 11.3 第三阶段：界面按 App + Provider 展示

1. 将 `kilo` 加入统计 App 类型、筛选项、图标和标题主题。
2. Provider 筛选值改为稳定的 `(app_type, provider_id)`，名称只作为 label。
3. Kilo Provider 表至少展示：
   - 请求数；
   - input tokens；
   - output tokens；
   - cache read tokens；
   - 缓存命中率；
   - usage 捕获率或缺失数量。
4. 支持从 Provider 行进入相同筛选范围的请求明细。
5. 缓存语义 UNKNOWN 时：
   - 可以展示 Provider 原始上报的 input 和 cache read；
   - 不展示看似精确的缓存命中率；
   - 标记“缓存计数语义待确认”。
6. Provider 没有返回缓存字段时，显示“未报告”或 N/A，不把 0 命中解释成确定事实。

## 12. 建议的后端边界

建议将职责拆成三层：

```text
协议解析层
  从响应中提取 Provider 原始 usage 数值

语义解释层
  判断 input 是 TOTAL、FRESH 还是 UNKNOWN

统计聚合层
  按 App + Provider + Model + 时间聚合和展示
```

避免以下错误耦合：

```text
使用 OpenAI-compatible endpoint
  != 上游是 OpenAI 公司
  != 所有 Provider 的缓存字段相同
  != 所有 Provider 的 input/cache 包含关系相同
```

Kilo 复用现有 OpenAI parser 是合理的第一步，但 parser 只负责提取候选字段，不应单独决定 Provider 的缓存计数语义。

## 13. 验收标准

### 13.1 基础请求

- Kilo 非流式请求返回标准 usage 时，数据库存在 `app_type = kilo`、实际 `provider_id` 的记录。
- Kilo 流式出站请求始终覆盖 `stream_options.include_usage = true`。
- 流式最后一个 chunk 返回 usage 时能正确记录。
- 统计旁路不能改变返回给 Kilo 的 SSE 内容和顺序。

### 13.2 Provider 归属

- Kilo 使用 Volc 时，只计入 `Kilo + Volc`。
- 切换 Provider 后，新请求计入新 Provider，历史记录归属不改变。
- 两张同名 Provider 卡片可以通过 Provider ID 分开统计。

### 13.3 缓存数据

- Provider 返回 cache read 字段时保存原始数值。
- Provider 不返回缓存字段时显示未报告，而不是确定的 0 命中。
- UNKNOWN 语义不计算误导性的缓存命中率。
- TOTAL/FRESH 经验证后，缓存命中率计算符合该 Provider 的实际包含关系。

### 13.4 界面

- Dashboard 可以独立选择 Kilo。
- 可以查看 Kilo 各 Provider 的 input、output 和 cache read。
- 可以比较 Kilo 各 Provider 的缓存命中表现。
- 点击或筛选 Provider 后，请求明细与汇总口径一致。

## 14. 最终架构判断

1. Kilo 当前使用独立代理 handler，但上游边界是 OpenAI-compatible Chat Completions。
2. 可以先假设主流 Provider 支持基础 usage 字段，并复用现有 OpenAI-compatible parser。
3. 流式请求由代理直接覆盖 `stream_options.include_usage = true`，与用户配置和数据库配置无关。
4. 最终统计归属是 App + Provider，必要时细分 Model。
5. 现有数据库明细和日汇总维度基本足以支持 Kilo + Provider 统计。
6. 当前界面没有完整展示 Provider 级缓存信息，且 Kilo 尚未进入统计筛选。
7. 缓存语义不能由 Kilo 或协议名称统一推断，必须根据实际 Provider 响应验证，并落实到每条记录或明确的 Provider dialect。
8. 首期应优先获得真实 usage 数据和捕获率，再依据观察结果扩展缓存兼容规则。
