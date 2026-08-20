/**
 * 通过 LCEL Runnable 链驱动的 MCP 智能助手
 *
 * 这个文件演示的是「使用 Runnable 组合链 + MCP 工具实现多轮对话」。
 *
 * 核心流程：
 * 1. 注册 MCP 工具（高德地图 + 和风天气）
 * 2. 将工具绑定到模型，让模型可以自主决定调用哪些工具
 * 3. 使用 RunnableBranch 实现循环：模型调用工具 → 执行工具 → 结果回传 → 继续思考
 * 4. 直到模型不再需要调用工具，直接给出最终回答
 *
 * 与直接在 LLM 调用中静态绑定工具不同，这里通过 RunnableBranch 和循环
 * 实现了完整的 Agent 推理-行动-观察（ReAct）循环。
 */

import 'dotenv/config'
import chalk from "chalk";
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence, RunnableBranch, RunnablePassthrough } from '@langchain/core/runnables';


// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 创建 MCP 客户端，注册多个 MCP 服务器。
//
// MultiServerMCPClient 会管理所有 MCP 连接的生命周期。
// 每个 MCP 服务器可以是一个远程 HTTP 服务，也可以是一个本地子进程。
const mcpClient = new MultiServerMCPClient({
    mcpServers: {
        // 高德地图 MCP 服务（远程 HTTP 方式）
        // 提供地图搜索、周边搜索、地点详情等能力
        // 官网: https://developer.amap.com/api/mcp-server/gettingstarted
        'amap-maps-streamableHTTP': {
            url: 'https://mcp.amap.com/mcp?key=' + process.env.AMAP_MAPS_API_KEY
        },
        // 和风天气 MCP 服务（本地子进程方式）
        // 提供实时天气、天气预报等能力
        'weather-mcp-server': {
            command: 'node',
            args: ['/Users/tengjinhua/Documents/agent-learn/tool-test/src/weather-mcp-server.mjs']
        }
    }
})

// 获取所有已注册 MCP 工具，并绑定到模型。
//
// getTools() 会连接所有 MCP 服务器并拉取工具列表。
// bindTools(tools) 将工具注册到模型，告诉模型它可以调用这些工具。
// 模型在推理时会自主判断是否需要调用工具，以及调用哪个工具。
const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools)

// 定义聊天提示词模板。
//
// 使用 MessagesPlaceholder('messages') 作为对话历史占位符，
// 每次调用时传入的 messages 数组会包含用户消息、工具调用结果等。
const prompt = ChatPromptTemplate.fromMessages([
    ['system', '你是一个可调用 MCP 服务的智能助手，你可以根据用户的问题，调用 MCP 服务来获取信息。'],
    new MessagesPlaceholder('messages'),
])

// 将提示词模板和绑定工具的模型组合成 LLM 调用链。
// 输入：{ messages: [...] }
// 输出：模型的 AIMessage（可能包含 tool_calls）
const llmChain = prompt.pipe(modelWithTools)

// 工具执行器：负责执行模型指定的工具调用。
//
// RunnableLambda 将普通函数封装为 Runnable，使其可以参与链式组合。
// 这里的 func 接收 { response, tools }，遍历 response.tool_calls，
// 找到对应的工具并执行，最后将结果包装为 ToolMessage 返回。
const toolExecutor = new RunnableLambda({
    func: async (input) => {
        const { response, tools } = input
        const toolResults = []

        for (const toolCall of response.tool_calls ?? []) {
            const foundTool = tools.find((tool) => tool.name === toolCall.name)
            if (!foundTool) {
                continue
            }

            const toolResult = await foundTool.invoke(toolCall.args)
            // 兼容不同返回格式的字符串化。
            // 有的工具返回字符串，有的返回对象，统一转为字符串再包装。
            const contentString = typeof toolResult === 'string' ? toolResult : (toolResult.text || JSON.stringify(toolResult))

            toolResults.push(new ToolMessage({
                content: contentString,
                tool_call_id: toolCall.id,
            }))
        }

        return toolResults
    }
})

// Agent 单轮处理链：处理一轮"思考 → 行动"。
//
// 执行流程：
// 1. RunnablePassthrough.assign({ response: llmChain })：
//    调用大模型，将结果挂到 state.response 上
// 2. RunnableBranch：根据模型返回是否有 tool_calls 做分支
//    - 没有 tool_calls → 本轮结束，返回最终回答
//    - 有 tool_calls → 执行工具，将结果追加到 messages，继续下一轮
const agentStepChain = RunnableSequence.from([
    // step 1：调用大模型，将输出挂到 state.response 上。
    // assign 的作用是在不改变原有 state 的前提下，新增一个 response 字段。
    RunnablePassthrough.assign({ response: llmChain }),
    // step 2：使用 RunnableBranch 根据是否有 tool_calls 选择执行路径。
    RunnableBranch.from([
        // 分支1：没有 tool_calls，认为本轮已完成。
        [
            // 检查 tool_calls 是否为空或不存在。
            // 当 state.response?.tool_calls?.length 为 0 或 undefined 时，
            // ! 取反为 true，进入"完成"分支。
            (state) => !state.response?.tool_calls?.length,
            new RunnableLambda({
                func: async (state) => {
                    const { messages, response } = state
                    const newMessages = [...messages, response]
                    // 当模型返回中没有 tool_calls 时，response.content 就是最终回答。
                    // 如果 content 为空，尝试从 response 中提取文本。
                    const finalContent = response.content || response.text || JSON.stringify(response)
                    return {
                        ...state,
                        messages: newMessages,
                        done: true,
                        final: finalContent
                    }
                }
            })
        ],
        // 默认分支：有 tool_calls，调用工具并把 ToolMessage 加入到 messages 中。
        RunnableSequence.from([
            new RunnableLambda({
                func: async (state) => {
                    const { messages, response } = state
                    const newMessages = [...messages, response]
                    console.log(chalk.bgBlue.white(`检测到有 ${response.tool_calls?.length} 个 tool_calls工具调用`))

                    console.log(chalk.bgBlue.white(`工具调用:${response.tool_calls
                        .map((t) => t.name)
                        .join(', ')}`))
                    return {
                        ...state,
                        messages: newMessages,
                    }
                }
            }),
            // 调用工具执行器，将结果挂到 state.toolMessages 上。
            RunnablePassthrough.assign({ toolMessages: toolExecutor }),
            new RunnableLambda({
                func: async (state) => {
                    const { messages, toolMessages } = state
                    const newMessages = [...messages, ...toolMessages]
                    return {
                        ...state,
                        messages: newMessages,
                        done: false,
                    }
                }
            })
        ])
    ])
])

// 运行 Agent 多轮对话，直到获得最终回答或达到最大迭代次数。
//
// 工作原理：
// 1. 初始化 state，包含用户消息和所有可用的 MCP 工具
// 2. 循环调用 agentStepChain，每一轮模型都会：
//    a. 根据当前 messages 决定是否需要调用工具
//    b. 如果需要，调用工具并将结果加回 messages
//    c. 带着更新后的 messages 进入下一轮
// 3. 当模型不再调用工具时，返回最终回答
//
// 这种"循环调用链"的方式，实现了类似 ReAct（Reasoning + Acting）的 Agent 模式。
async function runAgentWithTools(query, maxIterations = 30) {
    let state = {
        messages: [new HumanMessage(query)],
        done: false,
        final: null,
        tools
    }

    for (let i = 0; i < maxIterations; i++) {
        console.log(chalk.bgBlue.white(`正在等待AI思考第${i}轮...`))
        // 每一轮都通过一个完整的 agentStepChain 来处理。
        state = await agentStepChain.invoke(state)

        if (state.done) {
            console.log(chalk.bgGreen.white(`AI思考完成，结果为：${state.final}`))
            return state.final
        }
    }
    return state.messages[state.messages.length - 1].content
}

// 执行入口：提问并获取回答。
await runAgentWithTools('青岛的天气怎么样？我想在五四广场附近住宿，推荐一些酒店吧')