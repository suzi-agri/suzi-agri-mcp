# suzi-agri-mcp · 中国首个农业 MCP Server

> **China's first Chinese-language MCP Server for agricultural regions.**
> 把中国农业产区数据源按 MCP（Model Context Protocol）标准封装，让所有支持 MCP 的 AI 客户端（Claude Desktop / Cursor / 豆包 / Kimi 等）**即插即用**获得农业数据能力。

由 [四川粟子农业科技有限公司（粟子农场）](https://suzi-agri.com/) 开源 · MIT License · 零第三方依赖 · 免费、无需 API 密钥

官方说明页：https://suzi-agri.com/mcp

---

## ✨ 工具集（v0.1）

| 工具 | 功能 | 数据源 | 成本 |
|---|---|---|---|
| `suzi_weather` | 12 个中国农业产区实时气象 + 7 天预报 + NASA POWER 30 年农业气候基准 | [Open-Meteo](https://open-meteo.com/) + [NASA POWER](https://power.larc.nasa.gov/) | 免费无密钥 |
| `suzi_weather_alerts` | 暴雨 / 高温 / 霜冻 / 大风 **农事预警扫描**，输出等级与建议动作 | 同上 | 免费无密钥 |

**预设产区**：泸州 / 龙马潭 / 合江 / 先市（晚熟荔枝·真龙柚）/ 四川 / 云南 / 广西 / 海南 / 黑龙江 / 北京 / 山东。任意中文地名自动回落川南坐标。

> ⚠️ **免责声明**：预警阈值均为「待校准推断参考值」，工具输出强制携带该标注，仅供农事参考，不应作为唯一的生产农艺决策依据。

## 🚀 快速开始

### 1. 环境要求

- Node.js ≥ 18（无任何 npm 依赖，克隆即用）

### 2. 运行

```bash
git clone https://github.com/suzi-agri/suzi-agri-mcp.git
cd suzi-agri-mcp
node server.mjs
```

### 3. 接入你的 AI 客户端（stdio 传输）

以 Claude Desktop / Cursor 为例，在 MCP 配置中加入：

```json
{
  "mcpServers": {
    "suzi-agri-mcp": {
      "command": "node",
      "args": ["/你的路径/suzi-agri-mcp/server.mjs"]
    }
  }
}
```

### 4. 冒烟测试（可选）

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"suzi_weather_alerts","arguments":{"region":"合江"}}}\n' | node server.mjs
```

## 🆚 为什么用 MCP 而不是直接调 API？

| 维度 | 普通农业天气 API | suzi-agri-mcp |
|---|---|---|
| 接入方式 | 逐家注册密钥、读文档、写对接代码 | 标准协议，MCP 客户端即插即用 |
| 换 AI 客户端 | 重新对接一遍 | 零改动 |
| 农业语义 | 裸数据，自己翻译 | 产区预设 + 农事预警阈值 + 30 年气候基准 |
| 中文产区 | 国外源需自行换算 | 12 个中国农业产区开箱即用 |
| 成本 | 多有订阅费/配额 | 免费无密钥（MIT） |

## 🗺 路线图

| 阶段 | 内容 |
|---|---|
| v0.1 ✅ | weather 双工具（实时气象 / 农事预警），零依赖 stdio |
| v0.2 | `suzi_price`（中国农产品批发价格指数）+ `suzi_farm_calendar`（24 节气农事日历） |
| v0.3 | 经济作物规则包（桂圆/荔枝等）+ 认养成长卡片工具 |
| 长期 | 农业决策层编排工具 |

欢迎 Issue / PR。如果你在做农业 + AI 的结合，[粟子农场](https://suzi-agri.com/)在四川泸州龙马潭区 380 亩基地上真实使用这套工具。

## 📄 许可

[MIT](LICENSE) © 2026 四川粟子农业科技有限公司（Sichuan Suzi Agricultural Technology Co., Ltd.）
