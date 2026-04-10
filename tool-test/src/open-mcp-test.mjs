
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
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
// 自定义工具函数：加载动画，提升用户体验
import { startLoadingAnimation } from './utils.mjs'


// ========== QPS 控制配置 ==========
// 高德官方 MCP 服务 QPS 限制，每次工具调用后延迟多少毫秒
// 默认 1000ms = 1秒，符合大多数免费版限制
// 可以通过环境变量 AMAP_REQUEST_DELAY 修改
const TOOL_CALL_DELAY = parseInt( '1000', 10);

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


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
const mcpClient = new MultiServerMCPClient({
    // 配置要连接的 MCP 服务器列表
    mcpServers:{
        // 配置高德地图MCP服务 https://developer.amap.com/api/mcp-server/gettingstarted
        'amap-maps-streamableHTTP':{
            url: 'https://mcp.amap.com/mcp?key='+ process.env.AMAP_MAPS_API_KEY
        },
        "filesystem": {
            "command": "npx",
            "args": [
                "-y",
                "@modelcontextprotocol/server-filesystem",
                ...(process.env.ALLOWED_PATHS.split(',') || [])
            ]
        },
        "chrome-devtools": {
            "command": "npx",
            "args": [
                "-y",
                "chrome-devtools-mcp@latest",
                "--isolated",
                "--no-performance-cru",
                "--no-usage-statistic"
            ]
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
            // 确保 content 是字符串类型
            let contentStr = ''
            // 一般我们写 tool 都是直接返回字符串，但是FileSystemMCP封装的这些 tool 返回的是对象，有 text 属性
            if (typeof toolResult === 'string'){
                contentStr = toolResult;
            }else if (toolResult && toolResult.text){
                contentStr = toolResult.text;
            }
            // 将工具返回结果加入对话历史，作为下一步观察
            // ToolMessage 必须包含 tool_call_id，让模型知道这是哪个工具调用的结果
            messages.push(new ToolMessage({
                tool_call_id: toolCall.id,
                content: contentStr,
            }))

            // QPS 控制：如果有多个工具调用，每个之间添加延迟，避免超过高德 API 的 QPS 限制
            // 如果不是最后一个工具调用，添加延迟
            if (response.tool_calls.length > 1 && TOOL_CALL_DELAY > 0) {
                console.log(chalk.yellow(`⏳ QPS 控制，等待 ${TOOL_CALL_DELAY}ms...`));
                await delay(TOOL_CALL_DELAY);
            }
        }

        // 一轮工具调用全部完成后，如果有多个工具调用，添加延迟
        if (response.tool_calls.length > 0 && TOOL_CALL_DELAY > 0) {
            await delay(TOOL_CALL_DELAY);
        }
        // 工具调用执行完后，会进入下一轮循环，让 AI 基于工具结果继续思考
    }

    // 如果达到最大迭代次数还没结束，返回最后一条消息
    const finalResult = messages[messages.length - 1].content;
    return finalResult;
}



// ========== 5. 运行测试 ==========
// 可以测试用户查询工具调用：
// await runAgentWithTools("武汉市融创智谷附近的酒店，以及去的路线，路线规划生成文档保存到 /Users/tengjinhua/Documents/agent-learn/tool-test 下面的一个md的文件")
await runAgentWithTools("武汉市融创智谷附近的酒店，找出距离最近最高的5个，并打开百度地图分别把他们展示出来，每个tab展示一个酒店的百度地图地址")

// 最后关闭 MCP 客户端，释放进程
await mcpClient.close()

//await runAgentWithTools("武汉市融创智谷附近的酒店，以及去的路线，路线规划生成文档保存到 /Users/tengjinhua/Documents/agent-learn/tool-test 下面的一个md的文件")
// 输出结果
/**
 * ╰─❯ node ./src/open-mcp-test.mjs
 * 🔍 检测到1个工具调用
 * 🔍 工具调用: maps_text_search
 * 🔍 检测到1个工具调用
 * 🔍 工具调用: maps_search_detail
 * 🔍 检测到1个工具调用
 * 🔍 工具调用: maps_around_search
 *
 * ✨  最终回复:
 * 根据搜索结果，我为您找到了武汉市融创智谷附近的酒店信息：
 *
 * ## 📍 融创智谷位置
 * **地址：** 武汉市文化大道555号
 * **经纬度：** 114.319881,30.455082
 *
 * ## 🏨 附近酒店推荐
 *
 * ### 1. **魔方公寓融创智谷园区店**
 * - 📍 位置：融创智谷C10栋（园区内）
 * - ⭐ 优势：距离最近，步行即达
 *
 * ### 2. **世纪商务酒店(武汉融创智谷店)**
 * - 📍 位置：文化大道世茂林屿岸小区商3-12
 * - ⭐ 优势：品牌连锁，服务有保障
 *
 * ### 3. **季朵酒店(融创智谷新路村地铁站店)**
 * - 📍 位置：洪山乡马咀60号
 * - ⭐ 优势：靠近地铁站，交通便利
 *
 * ### 4. **亚希精品酒店(武汉世茂林屿岸新路村地铁站店)**
 * - 📍 位置：文化大道332号附131号
 * - ⭐ 优势：精品酒店，靠近地铁站
 *
 * ### 5. **武汉蓝泊湾商务酒店**
 * - 📍 位置：文化大道马咀村87号
 * - ⭐ 优势：商务型酒店，适合出差
 *
 * ### 6. **紫缘酒店**
 * - 📍 位置：野芷湖西路16号创意天地园区
 * - ⭐ 优势：位于创意园区，环境较好
 *
 * ---
 *
 * ## 🚗 路线规划
 *
 * 为了给您规划详细的路线，请告诉我您的出发地点，我可以为您提供：
 * - 🚗 驾车路线
 * - 🚇 公共交通路线
 * - 🚶 步行路线
 * - 🚴 骑行路线
 *
 * 您从哪里出发前往融创智谷呢？
 */
