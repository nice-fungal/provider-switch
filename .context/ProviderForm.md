# KiloProviderForm UI 优化方案

## 1. 目标与范围

优化 Kilo Provider 表单，让用户在填写结构化表单的同时，能够直接看到最终保存到数据库的 Kilo 配置 JSON。

本方案只描述 UI 和数据模型调整，不涉及本轮代码实现。目标组件为：

- `src/components/providers/forms/KiloProviderForm.tsx`
- `src/components/providers/forms/ProviderForm.tsx` 中的 Kilo 分派入口
- 必要的 Kilo 表单测试与国际化文案

## 2. 已确认的产品决策

1. 桌面端使用左右布局，建议宽度比例为 `4:6`：左侧 JSON 预览约 40%，右侧结构化表单约 60%。
2. 左侧使用普通只读 `textarea`，不使用语法高亮或 JSON 编辑器组件。
3. 左侧显示格式化后的 JSON，内容就是最终保存进数据库的 Kilo `settingsConfig`。
4. JSON 只读，用户只能通过右侧表单修改配置。
5. API Key 属于应展示的配置内容：右侧表单使用明文输入，左侧 JSON 也显示明文。
6. 删除 `npm` 字段。它是客户端/AI SDK 侧的信息，不是 CC Switch Kilo 代理配置的一部分。
7. 删除配置 JSON 顶层 `name` 字段。Provider 名称已经作为数据库记录的独立 `name` 字段保存，Kilo 代理不读取 `settingsConfig.name`。

## 3. 推荐布局

桌面端：

```text
┌──────────────────────┬──────────────────────────────┐
│ Kilo 配置 JSON       │ Kilo Provider 表单            │
│                      │                              │
│ 只读 textarea        │ Provider Name                │
│ 等宽字体             │ Base URL / API Key           │
│ 可滚动               │ Headers / Model / Request... │
│                      │ Extra Options                │
└──────────────────────┴──────────────────────────────┘
             40%                    60%
```

- 两列应共享外层表单容器，不再给左右区域各自叠加独立卡片。
- 使用边框或分隔线区分两侧，保持现有玻璃质感和表单间距。
- 左侧 JSON 区域建议 `position: sticky`，在右侧较长表单滚动时保持可见。
- textarea 使用等宽字体、可滚动、合理的最小高度；内容过长时只在自身区域滚动。
- 窄屏切换为上下布局，右侧表单在上、左侧 JSON 在下，避免横向溢出。

## 4. 唯一配置对象与数据流

左右两侧不维护两份状态，也不做“表单状态同步 JSON 状态”。应只有一个规范化的 Kilo 配置对象：

```text
kiloConfig
├── models
├── thinking
├── reasoning_effort
└── options
```

数据流：

```text
右侧表单字段
      ↓
唯一 kiloConfig 对象
      ├── JSON.stringify(kiloConfig, null, 2) → 左侧只读预览
      └── 保存时直接作为 settingsConfig 提交
```

实现要求：

- 预览和提交必须使用同一个配置构建入口。
- 不单独保存 `jsonState`，避免两份数据发生漂移。
- 左侧格式化产生的缩进、换行只属于展示层；字段、层级和值必须与数据库配置一致。
- 编辑已有 Provider 时，表单从数据库 JSON 回填，预览同时由同一对象重新生成。

## 5. 配置 JSON 形状

推荐的最终 Kilo `settingsConfig` 结构：

```json
{
  "models": {
    "glm-5.3": {
      "name": "GLM-5.3"
    }
  },
  "thinking": {
    "type": "enabled"
  },
  "reasoning_effort": "high",
  "options": {
    "baseURL": "https://example.com/v1",
    "apiKey": "secret"
  }
}
```

字段规则：

- `models` 必须包含且仅包含一个非空模型 ID。
- 模型展示名为空时，可回退为模型 ID。
- `thinking.type` 和 `reasoning_effort` 保持后端要求的非空字符串。
- `options.baseURL` 和 `options.apiKey` 为实际代理请求使用的字段。
- 自定义 Headers 仅在存在有效条目时写入 `options.headers`。
- Extra Options 仅在存在有效键值时写入 `options`。
- 不生成空模型键、不输出只存在于 UI 草稿中的临时条目。
- 不再生成 `npm` 和顶层 `name`。

后端当前会校验 URL、API Key、单模型、thinking/reasoning 字段以及禁止覆盖的 Header。UI 优化不能削弱这些约束。

## 6. 字段与交互

右侧保留现有表单能力：

- Provider Name：保存到 Provider 记录的独立 `name` 字段，不写入 `settingsConfig`。
- Base URL：明文输入，提交前由后端校验绝对 HTTP/HTTPS 地址及代理递归地址。
- API Key：改为明文输入，关闭密码遮罩；左侧 JSON 同样显示明文。
- Headers：沿用现有 `RequestHeadersEditor`，新增、改名、删除实时反映到 JSON。
- Model ID / Model Name：单模型配置，实时反映到 `models`。
- Thinking Type / Reasoning Effort：实时反映到对应顶层字段。
- Extra Options：新增、编辑、删除实时反映到 `options`。

左侧 textarea：

- `readOnly`。
- 显示 `JSON.stringify(kiloConfig, null, 2)` 的结果。
- 不提供独立保存、解析、格式化或编辑操作。
- API Key 按产品决策显示真实值。

## 7. 响应式与可用性要求

- 桌面端目标比例为 `4:6`，两栏宽度应稳定，不因输入内容改变布局。
- 移动端或窄窗口使用单列布局，字段和 JSON 均不得横向溢出。
- textarea、输入框和按钮应有稳定高度，长 JSON 通过滚动处理。
- 表单无效时继续显示当前配置草稿，保存按钮仍执行现有必填校验。
- JSON 预览不代表配置已保存；只有提交成功后才更新数据库。

## 8. 实施边界与检查项

实施时需要同步检查：

1. `buildKiloSettingsConfig` 或等价构建函数是否移除 `npm`、顶层 `name`，并成为预览与提交共用入口。
2. 编辑回填逻辑是否能处理旧数据中仍存在的 `npm` / 顶层 `name`：读取时可忽略，下一次保存时不再写回。
3. Rust Kilo 代理只依赖 `models`、`thinking`、`reasoning_effort` 和 `options`，确认移除字段不会影响解析及转发。
4. Provider 名称仍通过 `ProviderFormValues.name` 提交，不能因移除 JSON 顶层 `name` 而丢失。
5. 更新 Kilo 组件测试：移除旧 NPM 字段和 reasoning switch 断言，增加 JSON 预览、明文 API Key、字段实时反映及旧配置回填测试。
6. 检查四份语言文件中是否需要补充 Kilo 专属字段文案；没有翻译时才依赖 `defaultValue`。

## 9. 验收标准

- 桌面端呈现约 `4:6` 的左右布局，窄屏自动变为上下布局。
- 左侧是普通只读 textarea，无语法高亮。
- 任意右侧字段变化后，左侧 JSON 立即反映同一份配置对象。
- 左侧 JSON 与提交后的 `settingsConfig` 在字段、层级和值上完全一致。
- JSON 中不存在 `npm` 和顶层 `name`。
- API Key 在右侧表单和左侧 JSON 中均为明文。
- 单模型、thinking、reasoning、Headers、Extra Options 的校验和保存行为保持正确。
- 编辑已有 Kilo Provider 时，表单和 JSON 预览均能正确回填。

