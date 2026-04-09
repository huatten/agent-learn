/**
 * MCP (Model Control Protocol) 服务器示例
 *
 * 这个文件实现了一个简单的 MCP 服务器，展示了：
 * 1. 如何创建一个 MCP 服务器
 * 2. 如何注册工具（tools）供 AI 调用
 * 3. 如何注册资源（resources）供客户端读取
 * 4. 如何通过 stdio 传输与客户端通信
 *
 * 什么是 MCP？
 * - MCP = Model Control Protocol，是一种让 AI 能够安全调用外部工具的协议
 * - MCP 服务器向外暴露工具（tools）和资源（resources）
 * - MCP 客户端（比如我们的 langchain-mcp-test.mjs，或者 Cursor 编辑器）连接服务器后，
 *   可以发现这些工具，并让 AI 自动决定何时调用它们
 *
 * 这个示例中，我们实现了一个模拟用户数据库，提供查询用户信息的工具
 */

// 从官方 SDK 导入 McpServer 类，这是创建 MCP 服务器的核心类
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// StdioServerTransport：使用标准输入输出进行通信的传输层
// 这是本地 MCP 服务器最常用的传输方式：客户端启动服务器进程，通过 stdin/stdout 通信
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// Zod：一个 TypeScript 优先的 schema 验证库
// MCP 使用 Zod 来定义工具输入参数的 schema，这样客户端知道需要传什么参数
import { z } from "zod";


// ========== 模拟数据库 ==========
// 我们用一个简单的 JavaScript 对象模拟数据库
// 在实际项目中，这里可能会连接真实的 MySQL、PostgreSQL 等数据库
const database = {
    // 用户表：key 是用户 ID，value 是用户信息
    users: {
        '001': { id: '001', name: '张三', email: 'zhangsan@example.com', role: 'admin' },
        '002': { id: '002', name: '李四', email: 'lisi@example.com', role: 'user' },
        '003': { id: '003', name: '王五', email: 'wangwu@example.com', role: 'user' },
    }
};

// ========== 创建 MCP 服务器实例 ==========
// 初始化 MCP 服务器，给服务器起名字和版本号
// 这些元信息会被客户端用来识别服务器
const server = new McpServer({
    name: 'my-mcp-server',  // 服务器名称
    version: '1.0.0'        // 版本号
});


// ========== 注册工具（Tool）==========
// 工具是什么？工具就是 AI 可以调用的函数，用来获取信息或执行操作
// 这里我们注册一个"查询用户信息"的工具

// 参数说明：
// 1. 第一个参数：工具名称（字符串），AI 和客户端通过名字识别工具
// 2. 第二个参数：工具的描述信息 + 输入参数的 schema（用 Zod 定义）
//    - description: 对工具功能的描述，AI 会根据这个描述决定是否调用它
//    - inputSchema: 定义输入参数的类型、是否必填、描述
// 3. 第三个参数：实际执行工具逻辑的异步函数，接收输入参数，返回结果
server.registerTool('query_user',{
    description: '查询数据库中的用户信息。输入用户 ID，返回该用户的详细信息（姓名、邮箱、角色）。',
    // 使用 Zod 定义输入参数的结构
    // 这里我们要求输入必须有一个 userId 字段，类型是字符串
    // .describe() 的描述会给 AI 看，帮助 AI 理解这个参数是干什么的
    inputSchema: z.object({
        userId: z.string().describe('用户 ID'),
    }),
}, async ({userId})=>{
    // 从模拟数据库中查询用户
    const user = database.users[userId]

    // 如果用户不存在，返回错误提示
    if (!user) {
        return {
            // content 是一个数组，可以返回多个内容块
            // 每个内容块需要指定类型和内容，这里我们只返回一个文本块
            content: [
                {
                    type: 'text',
                    text: `用户 ID ${userId} 不存在。可用的 ID: 001, 002, 003`,
                },
            ],
        };
    }

    // 如果用户存在，返回格式化后的用户信息
    return {
        content: [
            {
                type: 'text',
                text: `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}`,
            },
        ],
    };
})

// ========== 注册资源（Resource）==========
// 资源是什么？资源就是服务器提供的静态或动态信息
// 和工具不同：工具是 AI 主动调用来完成某个操作，资源是客户端预先读取的信息
// 常见用法：把文档、说明、配置信息等作为资源，提前让 AI 知道

// 参数说明：
// 1. 第一个参数：资源名称
// 2. 第二个参数：资源的 URI，用来唯一标识这个资源（类似 URL）
// 3. 第三个参数：配置项 + 读取资源内容的回调函数
server.registerResource('使用指南', 'docs://guide',{
    description: '本工具用于查看使用指南。',  // 资源描述
    mimeType: 'text/plain'                   // MIME 类型，告诉客户端这是纯文本
    }, async ()=>{
        // 返回资源内容
        return {
            contents:[
                {
                    uri: 'docs://guide',      // 资源 URI，必须和上面一致
                    mimeType: 'text/plain',   // MIME 类型
                    // 资源的实际文本内容，客户端读到后可以放到系统提示里给 AI
                    text: `MCP Server 使用指南
功能：提供用户查询等工具。
使用：在 Cursor 等 MCP Client 中通过自然语言对话，Cursor 会自动调用相应工具。`,
                },
            ]
        }
    }
)

// ========== 启动服务器 ==========
// 创建一个基于标准输入输出的传输层
// 当客户端（比如 langchain-mcp-test）用 node 启动这个文件时，
// 客户端通过进程的 stdin 发请求，通过 stdout 收响应
const transport = new StdioServerTransport();
// 连接服务器和传输层，开始监听请求
// 至此，服务器启动完成，等待客户端调用
await server.connect(transport)
