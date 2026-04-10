# AI 工具调用学习实践笔记

> 基于 LangChain + Model Context Protocol 实现大模型自动调用外部工具

## 📋 项目简介

这个项目是一个**新手学习大模型工具调用**的完整实践示例，包含：
- 自定义 MCP 服务器开发
- 连接第三方官方 MCP 服务
- 实现 mini Cursor：让 AI 自动读取文件、执行命令
- QPS 限流、JWT 动态生成等实战问题解决

---

## 📁 项目结构

```
tool-test/
├── .env                      # 环境变量配置（API Key 等敏感信息）
├── .gitignore                # Git 忽略配置
├── package.json              # Node.js 依赖配置
├── README.md         # 本学习笔记
└── src/
    ├── hello-langchain.mjs   # 👉 LangChain 入门：最简单的大模型调用
    ├── langchain-mcp-test.mjs # 👉 主程序：LangChain + 自定义 MCP 客户端
    ├── my-mcp-server.mjs     # 自定义 MCP 服务器示例（模拟用户数据库）
    ├── weather-mcp-server.mjs # 和风天气查询 MCP 服务器（动态 JWT 认证）
    ├── open-mcp-test.mjs     # 👉 连接高德官方开放 MCP 服务示例
    ├── mini-cursor.mjs       # 实现迷你 Cursor：AI 自动读取文件+执行命令
    ├── tool-file-read.mjs    # 文件读取工具示例
    ├── node-exec.mjs         # Node 命令执行工具
    ├── utils.mjs             # 工具函数（加载动画等）
    └── al-tools.mjs          # 其他工具集合
```

---

## 🧩 核心知识点

### 什么是 MCP (Model Context Protocol)

MCP 是 Anthropic 推出的**模型上下文协议**，允许 AI 大模型**动态发现和调用外部工具**。

**核心优势：**
- 🔌 **热插拔**：添加/删除工具不需要改模型代码
- 🎯 **标准化**：统一接口规范
- 🌐 **多种传输**：支持本地进程 stdio、远程 HTTP
- 🤝 **生态复用**：直接使用别人写好的工具

**工作流程：**
```
用户提问 
  ↓
AI 思考是否需要调用工具
  ↓
需要调用 → MCP 客户端调用 MCP 服务器
  ↓
MCP 服务器执行工具返回结果
  ↓
AI 基于结果继续思考
  ↓
得到最终答案回复用户
```

**架构图：**
```
[大语言模型] ←→ [LangChain MCP 客户端] ←→ [MCP 服务器 1, MCP 服务器 2, ...]
```

### ReAct 模式：多轮工具调用循环

```javascript
const runAgentWithTools = async(query, maxIterations = 30)=>{
    const messages = [new HumanMessage(query)];

    // 多轮迭代：思考 → 行动 → 观察 → 重复
    for (let i = 0; i < maxIterations; i++){
        // AI 思考
        const response = await modelWithTools.invoke(messages);
        
        // 如果 AI 决定不调用工具，直接返回最终答案
        if (!response.tool_calls?.length) {
            return response.content;
        }

        // 执行每个工具调用
        for (const toolCall of response.tool_calls) {
            const toolResult = await fundTool.invoke(toolCall.args);
            messages.push(new ToolMessage({
                tool_call_id: toolCall.id,
                content: toolResult,
            }));
            // QPS 限流延迟（应对第三方 API 限制）
            if (TOOL_CALL_DELAY > 0) await delay(TOOL_CALL_DELAY);
        }
        // 下一轮循环，AI 基于工具结果继续思考
    }
}
```

---

## 📁 文件逐个讲解

### 🔰 基础入门

### 1. `src/hello-langchain.mjs` - LangChain 入门：最简单的大模型调用

**这是你的第一个 LangChain 程序**，教你怎么连接大模型。

代码非常简单：
```javascript
import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";

// 创建模型实例，配置从环境变量读取
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 调用模型，获取回复
const response = await model.invoke([
  { role: "user", content: "你介绍一下你自己" }
]);

console.log(response.content);
```

运行测试：
```bash
node src/hello-langchain.mjs
```

确认你的大模型 API 配置正确，可以正常调用后，再继续学习工具调用。

---

### 🛠️ 基础工具

### 2. `src/tool-file-read.mjs` - 文件读取工具

给 AI 添加**读取本地文件**的能力，AI 可以自己看代码，理解项目结构。

### 3. `src/node-exec.mjs` - Node 命令执行工具

让 AI 能够执行终端命令，比如安装依赖、运行测试、git 操作等。

### 4. `src/mini-cursor.mjs` - 实现迷你 Cursor

**功能：** 模仿 Cursor 编辑器，让 AI 自动读取文件 + 执行终端命令，帮你改代码。

**核心逻辑：**
- 你提出问题
- AI 自动读取相关文件
- AI 分析代码，制定修改方案
- 需要执行命令时 AI 自动执行
- 把执行结果反馈给 AI，AI 继续分析

这就是现在流行的**AI 编码代理**的极简实现。

### 5. `src/utils.mjs` - 工具函数

提供**加载动画**，提升用户体验，让你知道 AI 在思考。

---

### 🔌 MCP 服务器开发

### 7. `src/my-mcp-server.mjs` - 自定义 MCP 服务器入门

这是第一个 MCP 服务器示例，**从零教你写一个 MCP 服务器**。

**功能：** 模拟用户数据库，提供查询用户信息工具

**代码骨架：**
```javascript
// 1. 导入依赖
import 'dotenv/config.js';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 2. 创建服务器实例
const server = new McpServer({
    name: 'my-mcp-server',
    version: '1.0.0'
});

// 3. 注册工具
server.registerTool('query_user', {
    description: '查询数据库中的用户信息。输入用户 ID，返回该用户的详细信息。',
    inputSchema: z.object({
        userId: z.string().describe('用户 ID'),
    }),
}, async ({userId}) => {
    // 工具逻辑...
    return {
        content: [{
            type: 'text',
            text: '返回结果文本'
        }]
    };
});

// 4. 注册资源（静态信息）
server.registerResource('使用指南', 'docs://guide',{
    description: '本工具使用指南',
    mimeType: 'text/plain'
}, async () => {
    return { contents: [...] };
});

// 5. 启动服务器
const transport = new StdioServerTransport();
await server.connect(transport);
```

**关键知识点：**
| 知识点 | 说明 |
|--------|------|
| `zod` | 用于定义输入参数 schema，AI 知道该传什么参数 |
| `StdioServerTransport` | 本地 MCP 使用标准输入输出通信 |
| `console.error` | stdout 被 MCP 占用了，调试日志必须用 error 输出 |
| Tools vs Resources | Tools 是可调用函数，Resources 是供 AI 读取的静态信息 |

---

### 8. `src/weather-mcp-server.mjs` - 和风天气 MCP 服务器

实战项目：**完整的天气查询 MCP 服务**，包含动态 JWT 认证。

**功能：**
- `get_current_weather` - 查询实时天气
- `get_weather_forecast` - 查询未来 7 天天气预报

**特色：动态 JWT 缓存刷新**

和风天气要求使用 JWT 认证，JWT 有过期时间。我们实现了自动刷新：

```javascript
// 全局缓存
let cachedJwt = null;
let cachedExpiresAt = 0;

async function getValidJwt() {
    const now = Math.floor(Date.now() / 1000);
    // 缓存有效直接返回（提前 30 秒刷新）
    if (cachedJwt && cachedExpiresAt > now + 30) {
        return cachedJwt;
    }
    // 过期了重新生成
    const jwt = await generateJwt();
    cachedJwt = jwt;
    cachedExpiresAt = exp;
    return jwt;
}
```

**环境变量配置：**
```env
HF_WEATHER_PROJECT_ID=项目ID
HF_WEATHER_KID=凭据ID
HF_WEATHER_PRIVITE_KEY=Ed25519私钥
HF_WEATHER_APIKEY=API Key
HF_WEATHER_API_HOST=API网关
JWT_EXPIRE_SECONDS=3600  # JWT过期时间（秒）
```

**工作流程：**
```
用户：北京今天天气怎么样？
  ↓
AI 提取城市名 → 调用 get_current_weather(city="北京")
  ↓
MCP：获取有效 JWT → 调用 Geo API → 获取 Location ID → 调用天气 API
  ↓
返回格式化天气信息
  ↓
AI 整理结果回复用户
```

---

### 🎯 MCP 客户端集成

### 9. `src/langchain-mcp-test.mjs` - LangChain + 自定义 MCP 客户端

这是自定义 MCP 客户端主程序，**连接 MCP 服务器 + 运行 AI 工具调用循环**。

**客户端配置 MCP 服务器：**
```javascript
const mcpClient = new MultiServerMCPClient({
    mcpServers:{
        // 本地 MCP 服务器（启动子进程）
        'my-mcp-server':{
            command: 'node',
            args: ['/absolute/path/to/src/my-mcp-server.mjs']
        },
        // 远程 HTTP MCP 服务器
        'weather-mcp-server':{
            url: 'https://...'
        }
    }
});

// 获取所有工具，绑定到模型
const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);
```

`MultiServerMCPClient` 自动完成：
- 启动本地 MCP 服务器进程
- 连接远程 HTTP 服务器
- 获取工具列表
- 转换为 LangChain 工具格式

---

### 10. `src/open-mcp-test.mjs` - 连接高德官方 MCP 服务

**特色：** 直接使用高德官方提供的 MCP 服务，不需要自己实现工具。

**配置方法：**
```javascript
const mcpClient = new MultiServerMCPClient({
    mcpServers:{
        'amap-maps-streamableHTTP':{
            url: 'https://mcp.amap.com/mcp?key=' + process.env.AMAP_MAPS_API_KEY
        },
    }
});
```

LangChain 会自动发现高德提供的所有工具：
- `maps_text_search` - 文本搜索地点
- `maps_around_search` - 周边搜索
- `maps_geocode` - 地理编码（地址 → 经纬度）
- `maps_regeocode` - 逆地理编码（经纬度 → 地址）
- `maps_direction` - 路径规划

**QPS 限流处理：**

高德免费版有 QPS 限制，我们在客户端添加延迟：

```javascript
const TOOL_CALL_DELAY = parseInt(process.env.AMAP_REQUEST_DELAY || '1000', 10);

// 每个工具调用后等待
if (response.tool_calls.length > 0 && TOOL_CALL_DELAY > 0) {
    await delay(TOOL_CALL_DELAY);
}
```

这样保证每秒不超过一次请求，不会触发限流。

**实际案例：** 查询 "武汉市融创智谷附近的酒店"

1. AI → `maps_text_search("融创智谷")` → 获取坐标
2. AI → `maps_around_search(坐标, keywords="酒店")` → 获取周边酒店列表
3. AI → 整理结果 → 推荐给用户

---

## ⚙️ 完整环境变量配置

| 变量名 | 说明 | 是否必填 |
|--------|------|----------|
| **大模型配置** | | |
| `OPENAI_API_KEY` | 大模型 API Key（OpenAI 兼容格式） | ✅ 必填 |
| `OPENAI_BASE_URL` | API 基础 URL，第三方兼容服务需要配置（例如：`https://open.bigmodel.cn/api/paas/v4/`） | ✅ 必填 |
| `MODEL_NAME` | 模型名称（例如：`glm-5`、`gpt-4o`） | ✅ 必填 |
| **和风天气** | | |
| `HF_WEATHER_PROJECT_ID` | 和风天气项目 ID | ✅ 使用天气功能必填 |
| `HF_WEATHER_KID` | 和风天气凭据 ID (kid) | ✅ 使用天气功能必填 |
| `HF_WEATHER_PRIVITE_KEY` | 和风天气 Ed25519 私钥 | ✅ 使用天气功能必填 |
| `HF_WEATHER_APIKEY` | 和风天气 API Key | ✅ 使用天气功能必填 |
| `HF_WEATHER_API_HOST` | 和风天气 API 网关地址 | ✅ 使用天气功能必填 |
| `JWT_EXPIRE_SECONDS` | JWT 过期时间，单位秒，默认 `3600` (1小时) | ⚙️ 可选 |
| **高德地图** | | |
| `AMAP_MAPS_API_KEY` | 高德地图 API Key | ✅ 使用高德 MCP 必填 |
| `AMAP_REQUEST_DELAY` | 工具调用间隔毫秒数，用于 QPS 限流，默认 `1000` (1秒) | ⚙️ 可选 |
| **其他** | | |
| `ALLOWED_PATHS` | 文件系统 MCP 允许访问的路径，多个用逗号分隔 | ⚙️ 可选 |
| `AMAP_MAPS_APIKEY` | 高德地图 API Key（兼容旧配置名） | ⚙️ 兼容 |
| `HF_WEATHER_APIKEY` | 和风天气 API Key（兼容旧配置名） | ⚙️ 兼容 |

```env
# .env 文件示例
# ========== 大模型配置 ==========
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
MODEL_NAME=glm-5

# ========== 和风天气配置 ==========
HF_WEATHER_PROJECT_ID=your-project-id
HF_WEATHER_KID=your-kid
HF_WEATHER_PRIVITE_KEY=-----BEGIN PRIVATE KEY-----...
HF_WEATHER_APIKEY=your-api-key
HF_WEATHER_API_HOST=https://xxx.re.qweatherapi.com
JWT_EXPIRE_SECONDS=3600

# ========== 高德地图配置 ==========
AMAP_MAPS_API_KEY=your-amap-key
AMAP_REQUEST_DELAY=1000

# ========== 其他配置 ==========
ALLOWED_PATHS=/path/1,/path/2
```

---

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp .env .env.local
# 编辑 .env.local 填入你的 API Key
```

### 3. 运行自定义 MCP 示例
```bash
node src/langchain-mcp-test.mjs
```

### 4. 运行高德 MCP 示例
```bash
node src/open-mcp-test.mjs
```

### 5. 调试 MCP 服务器
使用官方 MCP Inspector：
```bash
npx @modelcontextprotocol/inspector@latest --port 8080 node src/weather-mcp-server.mjs
```

---

## ❓ 新手常见问题

### Q: 为什么看不到 console.log 输出？
**A:** MCP 占用了标准输出 (stdout) 通信，调试日志必须用 `console.error`。

### Q: MCP 服务器为什么要自己 import 'dotenv/config'？
**A:** MCP 服务器是独立进程，客户端的环境变量不会自动共享，必须自己加载。

### Q: JWT 为什么要动态生成？
**A:** JWT 有过期时间，动态生成可以保证一直有效，不用手动更新。缓存机制避免重复生成。

### Q: AI 没有正确提取参数怎么办？
**A:** 在参数描述写清楚要求，比如：
```javascript
city: z.string().describe('只需要纯城市名称，用户问"北京今天天气"，这里填"北京"')
```

### Q: 怎么添加新工具？
**A:** 在 MCP 服务器文件用 `server.registerTool()` 添加，客户端不用改代码，重启客户端自动发现。

### Q: 遇到 "Error Connecting to MCP Inspector Proxy" 怎么办？
**A:** 
1. 换端口：`npx @modelcontextprotocol/inspector --port 8080 ...`
2. 更新到最新版本：`npx @modelcontextprotocol/inspector@latest ...`
3. 检查端口是否被占用：`lsof -i :6274`

---

## 📊 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 自定义 MCP 服务器开发 | ✅ | 完整示例，带详细注释 |
| LangChain MCP 客户端集成 | ✅ | 多轮工具调用循环 |
| 动态 JWT 认证缓存刷新 | ✅ | 和风天气实战 |
| 连接官方开放 MCP 服务 | ✅ | 高德地图示例 |
| QPS 限流控制 | ✅ | 工具调用间隔延迟 |
| 迷你 Cursor 实现 | ✅ | AI 自动读文件执行命令 |
| 详细注释新手友好 | ✅ | 每一行关键代码都有注释 |

---

## 🔗 相关链接

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [LangChain MCP Adapters](https://js.langchain.com/docs/modules/agents/tools/mcp/)
- [和风天气开发者平台](https://dev.qweather.com/)
- [高德地图 MCP 文档](https://developer.amap.com/api/mcp-server/gettingstarted)
- [jose - JWT 库](https://github.com/panva/jose)

---

## 📝 总结

通过这个项目，你可以学会：

1. ✅ MCP 协议的工作原理
2. ✅ 从零开发自定义 MCP 服务器
3. ✅ 使用 LangChain 连接 MCP 实现 AI 自动工具调用
4. ✅ 处理实战问题：JWT 过期、QPS 限流、调试日志输出
5. ✅ 连接官方提供的 MCP 服务，直接使用现成工具

这个项目适合想要学习**大模型 + 工具调用**的新手，所有代码都有详细注释，可以直接运行测试。
