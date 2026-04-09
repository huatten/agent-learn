/**
 * LangChain + MCP (Model Control Protocol) 集成示例
 *
 * 这个示例展示了如何：
 * 1. 连接到本地 MCP 服务器
 * 2. 自动获取 MCP 服务器提供的工具和资源
 * 3. 让大模型自动决定是否调用工具
 * 4. 执行工具调用并将结果返回给大模型继续思考
 * 5. 使用 MCP 服务器提供的静态资源作为系统提示
 *
 * 适合新手学习：理解 AI 如何自主调用工具（工具调用/Function Calling）
 */

// 加载环境变量（从 .env 文件读取配置）
import 'dotenv/config.js'
// chalk 用于给控制台输出添加颜色，让日志更易读
import chalk from "chalk";
// MultiServerMCPClient: LangChain 提供的 MCP 多服务器客户端，用于连接 MCP 服务器
// 它会自动把 MCP 服务器暴露的工具转换为 LangChain 可调用的工具格式
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
// ChatOpenAI: LangChain 封装的 OpenAI 兼容大模型客户端
// 这里可以适配任何 OpenAI 兼容的 API（比如OpenRouter、自定义代理等）
import { ChatOpenAI } from '@langchain/openai'
// LangChain 的消息类型：
// - SystemMessage: 系统提示词，给 AI 设定角色和规则
// - HumanMessage: 用户消息，用户的提问
// - ToolMessage: 工具返回结果，存放工具执行后的结果
import {HumanMessage, SystemMessage, ToolMessage} from '@langchain/core/messages';
// 自定义工具函数：加载动画，提升用户体验
import {startLoadingAnimation} from './utils.mjs'


// ========== 1. 初始化大语言模型 ==========
// 从环境变量读取配置，创建大模型实例
// 这种方式可以灵活切换不同的模型提供商，只要接口兼容 OpenAI
const model = new ChatOpenAI({
    // 模型名称，比如 gpt-4o, claude-3.5-sonnet 等（取决于你的 API 提供商）
    model: process.env.MODEL_NAME,
    // API Key，从环境变量读取，避免硬编码敏感信息
    apiKey: process.env.OPENAI_API_KEY,
    // 额外配置：
    // baseURL: 如果使用第三方代理（如 OpenRouter、字节火山等），需要修改基础 URL
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
});


// ========== 2. 初始化 MCP 客户端 ==========
// MCP (Model Control Protocol) 是一个协议，允许 AI 动态发现和调用工具
// MultiServerMCPClient 可以同时连接多个 MCP 服务器
// 这里我们只连接一个本地的 MCP 服务器（我们自己写的 my-mcp-server.mjs）
const mcpClient = new MultiServerMCPClient({
    // 配置要连接的 MCP 服务器列表
    mcpServers:{
        // 给服务器起个名字
        'my-mcp-server':{
            // 启动服务器的命令：用 node 运行我们的服务器文件
            command: 'node',
            // 命令参数：服务器文件的绝对路径
            args: ['/Users/tengjinhua/Documents/agent-learn/tool-test/src/my-mcp-server.mjs']
        }
    }
});


// ========== 3. 获取工具并绑定到模型 ==========
// 从 MCP 服务器获取所有可用工具
// MCP 适配器会自动把 MCP 工具转换为 LangChain 工具格式
const tools = await mcpClient.getTools();
// 让模型支持工具调用：把工具列表绑定到模型上
// 绑定后，模型就知道有哪些工具可以用，并且知道每个工具的参数要求
const modelWithTools = model.bindTools( tools)


// ========== 4. 定义 Agent 运行函数 ==========
/**
 * 让 AI 带着工具运行，支持多轮工具调用循环
 * @param {string} query - 用户的问题/查询
 * @param {number} maxIterations - 最大迭代次数（防止无限循环），默认 30 轮
 * @returns {Promise<string>} AI 的最终回复
 */
const runAgentWithTools = async(query, maxIterations = 30)=>{
    // 初始化消息列表：
    // - 第一条是系统消息，包含从 MCP 加载的资源信息
    // - 第二条是用户的问题
    const messages = [
        new SystemMessage(resourceContent),
        new HumanMessage(query),
    ];

    // 开始多轮迭代：AI 可以反复调用工具，直到得到最终答案
    // 这就是 "ReAct" 模式：思考 -> 行动 -> 观察 -> 重复
    for (let i = 0; i < maxIterations; i++){
        // 显示加载动画，提升用户体验
        const stopAnimation = startLoadingAnimation('AI 正在思考...');
        // 调用大模型，传入目前为止所有的对话历史
        // 模型会决定：是直接回答，还是调用一个或多个工具
        const response = await modelWithTools.invoke(messages);
        // 停止加载动画
        stopAnimation();

        // 把模型的回复加入对话历史
        messages.push(response)

        // ========== 检查是否需要调用工具 ==========
        // 如果模型没有调用任何工具，说明它已经得到了最终答案
        // 直接返回结果给用户
        if (!response.tool_calls?.length) {
            console.log('\n' + chalk.green('✨  最终回复:'));
            console.log(chalk.white(response.content));
            return response.content
        }

        // ========== 处理所有工具调用 ==========
        // 模型可能一次调用多个工具，所以我们遍历每个工具调用
        for (const toolCall of response.tool_calls) {
            // 打印日志，让用户看到发生了什么
            console.log(chalk.bgBlue(`🔍 检测到${response.tool_calls.length}个工具调用`));
            console.log(chalk.bgBlue(`🔍 工具调用: ${toolCall.name}`));

            // 在工具列表中查找对应名称的工具
            const fundTool = tools.find(t => t.name === toolCall.name);
            // 如果找不到工具，报错返回
            if (!fundTool) {
                console.log(`\n${chalk.red.bold('❌ 错误:')} ${chalk.red(`工具 ${toolCall.name} 不存在`)}\n`);
                return `工具 ${toolCall.name} 不存在`;
            }

            // 执行工具调用：传入模型生成的参数，得到工具返回结果
            const toolResult = await fundTool.invoke(toolCall.args);
            // 将工具返回结果加入对话历史，作为下一步观察
            // ToolMessage 必须包含 tool_call_id，让模型知道这是哪个工具调用的结果
            messages.push(new ToolMessage({
                tool_call_id: toolCall.id,
                content: toolResult,
            }))
        }
        // 工具调用执行完后，会进入下一轮循环，让 AI 基于工具结果继续思考
    }

    // 如果达到最大迭代次数还没结束，返回最后一条消息
    const finalResult = messages[messages.length - 1].content;
    return finalResult;
}


// ========== 5. 加载 MCP 资源 ==========
// MCP 不仅提供工具，还提供资源（resources）
// 资源是什么？就是一些静态信息，比如文档、配置、数据等
// 我们可以把这些资源读出来，放到系统提示词里，让 AI 知道这些信息

// 测试：先获取所有服务器提供的资源列表
const res = await mcpClient.listResources()
// 拼接所有资源内容，用于后续放到系统提示中
let resourceContent =  ''
// 遍历每个服务器
for (const [serverName, resources] of Object.entries(res)){
    // 遍历服务器提供的每个资源
    for (const resource of resources){
        // 读取资源的实际内容
        const content = await mcpClient.readResource( serverName,  resource.uri)
        // 拼接到 resourceContent
        resourceContent += content[0].text
    }
}
// 现在 resourceContent 包含了所有 MCP 资源的文本，我们把它放到 SystemMessage 里了


// ========== 6. 运行测试 ==========
// 可以测试用户查询工具调用：
// await runAgentWithTools('查一下用户 003 的信息')

// 这里我们测试问答，问题答案在我们加载的资源里
await runAgentWithTools("MCP Server 的使用指南是什么？")

// 最后关闭 MCP 客户端，释放进程
await mcpClient.close()
