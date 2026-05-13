/**
 * @fileoverview Mini Cursor Stream - 支持流式输出的极简 Agent。
 *
 * 这个文件是在 mini-cursor.mjs 的基础上继续升级：
 * - mini-cursor.mjs：一次性 invoke，等 AI 完整返回后再看 tool_calls
 * - mini-cursor-stream.mjs：使用 stream，边生成边观察 AI 输出和工具参数
 *
 * 这一版最值得复习的 3 个点：
 *
 * 1. 用 InMemoryChatMessageHistory 管理 memory
 *    以前我们直接维护 messages 数组，自己 push SystemMessage、HumanMessage、AIMessage、ToolMessage。
 *    这里改成 history.addMessage() / history.getMessages()，让“对话记忆”这个概念更清楚。
 *
 * 2. 把 AIMessageChunk 拼接成完整 AIMessage
 *    model.stream(messages) 返回的不是完整 AIMessage，而是一段段 AIMessageChunk。
 *    每个 chunk 可能只包含一小段文本，或者一小段 tool_call_chunks。
 *    所以要通过 fullAIMessage = fullAIMessage.concat(chunk) 不断累积。
 *    流结束后，fullAIMessage 才是可以放进 history 的完整 AI 消息。
 *
 * 3. 用 JsonOutputToolsParser 解析 tool_call_chunks
 *    流式 tool call 的参数不是一次性完整返回的。
 *    JsonOutputToolsParser 可以尝试把已经收到的 tool_call_chunks 拼成当前可解析的 tool_calls。
 *    这样 write_file 的 content 还在生成时，我们也能实时打印新增内容，做出“代码正在被写出来”的效果。
 */
import 'dotenv/config';


// chalk 用来给终端输出加颜色，让 Agent 执行过程更容易读。
import chalk from 'chalk';


// ChatOpenAI 是 LangChain 对聊天模型的封装。
import { ChatOpenAI } from '@langchain/openai';

// 导入消息类型：不同角色发送不同类型的消息
// - SystemMessage：系统提示词，告诉 AI 它的角色和规则
// - HumanMessage：用户消息，就是用户说的话
// - ToolMessage：工具返回的消息，放工具执行的结果
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

// InMemoryChatMessageHistory 是 LangChain 提供的内存消息历史。
// 它把“对话上下文”封装成一个对象，避免我们手动维护 messages 数组。
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";

// JsonOutputToolsParser 用来解析 OpenAI tool calls 的输出。
// 在流式场景下，它可以把 tool_call_chunks 中的参数碎片逐步拼成可读对象。
import { JsonOutputToolsParser } from "@langchain/core/output_parsers/openai_tools";

// 导入我们已经定义好的四个工具
// 这些工具都在 al-tools.mjs 文件里实现了
import { readFileTool, writeFileTool, executeCommandTool, listDirectoryTool } from './al-tools.mjs';

// ==========================================
// 1. 创建大模型实例
// ==========================================
// 所有配置都从环境变量读取，这样敏感信息（API Key）不会泄露在代码里
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,        // 模型名称，比如 "glm-4"、"gpt-4o" 等
    apiKey: process.env.OPENAI_API_KEY,   // API 密钥，身份认证用
    temperature: 0,                        // 温度：0 = 输出最确定、最稳定，适合工具调用
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,  // API 基础地址，使用第三方服务时需要
    },
});

// ==========================================
// 2. 注册所有可用工具
// ==========================================
// 把我们的工具都放到一个数组里，AI 可以从这里选择要使用的工具
const tools = [
    readFileTool,         // 读取文件工具
    writeFileTool,        // 写入文件工具
    executeCommandTool,   // 执行命令工具
    listDirectoryTool     // 列出目录工具
];

// ==========================================
// 3. 让模型绑定工具
// ==========================================
// bindTools 方法告诉 LangChain 这个模型有哪些工具可用
// LangChain 会自动处理工具调用的格式，让模型知道如何输出工具调用请求
const modelWithTools = model.bindTools(tools);

// ==========================================
// 4. 主函数：运行 Agent 处理用户请求
// ==========================================
/**
 * 运行 Agent 来处理用户的查询，循环处理工具调用直到完成
 * @param {string} query - 用户的问题/请求
 * @param {number} maxInterations - 最大迭代次数，防止死循环，默认 30 步
 * @returns {Promise<string>} 最终回复
 */
async function runAgentWithTools(query, maxInterations = 30) {

    // 创建一段新的内存消息历史。
    //
    // 你可以把 history 理解成这个 Agent 的“短期记忆”：
    // - 用户最开始的请求会放进去
    // - AI 每一轮回复会放进去
    // - 工具执行结果也会放进去
    //
    // 下一轮调用模型时，通过 history.getMessages() 取出完整上下文。
    const history = new InMemoryChatMessageHistory();

    // 添加系统消息。
    // SystemMessage 的作用是告诉模型：
    // 你是谁、能用哪些工具、用工具时必须遵守什么规则。
    await history.addMessage(new SystemMessage(`你是一个项目管理助手，使用工具完成任务。

当前工作目录: ${process.cwd()}

工具：
1. read_file: 读取文件
2. write_file: 写入文件
3. execute_command: 执行命令（支持 workingDirectory 参数）
4. list_directory: 列出目录

重要规则 - execute_command：
- workingDirectory 参数会自动切换到指定目录
- 当使用 workingDirectory 时，绝对不要在 command 中使用 cd
- 错误示例: { command: "cd react-todo-app && pnpm install", workingDirectory: "react-todo-app" }
- 正确示例: { command: "pnpm install", workingDirectory: "react-todo-app" }

重要规则 - write_file：
- 当写入 React 组件文件（如 App.tsx）时，如果存在对应的 CSS 文件（如 App.css），在其他 import 语句后加上这个 css 的导入
`));

    // 添加用户消息。
    // 这是用户真正交给 Agent 的任务。
    await history.addMessage(new HumanMessage(query));

    // ReAct 循环：AI 思考 -> 需要工具就调用工具 -> 把工具结果放回历史 -> AI 继续思考。
    // maxInterations 是保险丝，避免模型一直调用工具停不下来。
    for (let i = 0; i < maxInterations; i++) {
        console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));

        // 获取当前消息历史。
        // 这里拿到的 messages 等价于以前手写的 messages 数组，
        // 只是现在由 InMemoryChatMessageHistory 统一管理。
        const messages = await history.getMessages();

        // 使用流式调用。
        //
        // 注意：这里返回的是一个异步流 rawStream。
        // 里面每次吐出来的是 AIMessageChunk，而不是完整 AIMessage。
        const rawStream = await modelWithTools.stream(messages);

        // 准备一个空容器，用来把所有 AIMessageChunk 拼接成完整 AIMessage。
        //
        // 为什么必须拼接？
        // 因为后面要把 AI 的完整回复存入 history，
        // 还要读取 fullAIMessage.tool_calls 来真正执行工具。
        // 单个 chunk 只是片段，不适合直接存历史，也不适合直接执行工具。
        let fullAIMessage = null;

        // 准备一个 tool_call_chunks 的增量解析器。
        //
        // 模型流式生成 tool call 时，参数会分散在 tool_call_chunks 里。
        // JsonOutputToolsParser 会尝试基于“当前已经拼好的 fullAIMessage”
        // 解析出尽可能完整的工具调用参数。
        const toolParser = new JsonOutputToolsParser();

        // 记录每个工具调用已经打印过多少 content。
        //
        // 这个 Map 是为了避免重复打印：
        // - 第一次解析出 content = "abc"，打印 abc，记录长度 3
        // - 下一次解析出 content = "abcdef"，只打印新增的 def
        //
        // key 优先用 toolCall.id；如果没有 id，就用 filePath；再不行用 default。
        const printedLengths = new Map();

        console.log(chalk.bgBlue(`\n🚀 Agent 开始思考并生成流...\n`));

        // 开始消费模型流。
        for await (const chunk of rawStream) {
            // 这里的 chunk 是 AIMessageChunk。
            //
            // concat 是 LangChain 消息块提供的方法：
            // 它可以把多个 AIMessageChunk 合并起来，
            // 最终还原成一个完整 AIMessage。
            fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;

            let parsedTools = null;
            try {
                // 基于当前已经拼接出来的 fullAIMessage，尝试解析工具调用。
                //
                // 注意：流式过程中 JSON 参数可能还没生成完整，
                // 所以 parseResult 不一定每次都成功。
                //
                // 这里传入 [{ message: fullAIMessage }]，
                // 是为了让 parser 从“当前累积的 AI 消息”里找 tool_call_chunks/tool_calls。
                parsedTools = await toolParser.parseResult([{ message: fullAIMessage }]);
            } catch (e) {
                // 解析失败通常说明 JSON 参数还不完整。
                // 这在流式 tool call 里很正常，忽略即可，继续等待后续 chunk。
            }

            if (parsedTools && parsedTools.length > 0) {
                // 如果已经能解析出工具调用，就遍历每一个 toolCall。
                // 本文件重点预览 write_file，因为写文件的 content 很长，
                // 最适合展示“内容正在流式生成”的效果。
                for (const toolCall of parsedTools) {
                    if (toolCall.type === 'write_file' && toolCall.args?.content) {
                        // 为当前工具调用确定一个唯一 key，用来记录打印进度。
                        const toolCallId = toolCall.id || toolCall.args.filePath || 'default';

                        // 当前 parser 已经解析出来的文件内容。
                        const currentContent = String(toolCall.args.content);

                        // 上一次已经打印到哪里了。
                        const previousLength = printedLengths.get(toolCallId);

                        if (previousLength === undefined) {
                            // 第一次看到这个 write_file 调用时，打印一个标题。
                            printedLengths.set(toolCallId, 0);
                            console.log(
                                chalk.bgBlue(
                                    `\n[工具调用] write_file("${toolCall.args.filePath}") - 开始写入（流式预览）\n`,
                                ),
                            );
                        }

                        if (currentContent.length > previousLength) {
                            // 只取新增部分。
                            // 这是这个文件最关键的“小技巧”：
                            // parser 每次给的是当前已解析出的完整 content，
                            // 我们自己用长度差，算出这次新增了哪些字符。
                            const newContent = currentContent.slice(previousLength);

                            // 直接写到 stdout，避免 console.log 自动换行。
                            // 这样看起来就像代码被实时写出来。
                            process.stdout.write(newContent);

                            // 更新已经打印的位置。
                            printedLengths.set(toolCallId, currentContent.length);
                        }
                    }
                }
            } else {
                // 当前还没有解析出工具调用时，如果 AI 在输出普通文本，就直接打印。
                //
                // 有些模型会先说一句“我将创建项目”，然后才开始 tool call。
                // 这部分文本不在 toolCall.args 里，而在 chunk.content 里。
                if (chunk.content) {
                    process.stdout.write(
                        typeof chunk.content === 'string'
                            ? chunk.content
                            : JSON.stringify(chunk.content),
                    );
                }
            }
        }

        // 流结束后，fullAIMessage 已经从所有 AIMessageChunk 还原完成。
        //
        // 这里一定要存完整 AIMessage，而不是存单个 chunk。
        // 因为下一轮模型需要看到：
        // - AI 这一轮到底说了什么
        // - AI 这一轮到底发起了哪些 tool_calls
        await history.addMessage(fullAIMessage);
        console.log(chalk.green('\n✅ 消息已完整存入历史'));

        // 检查这轮 AI 是否发起了工具调用。
        //
        // 如果没有 tool_calls，说明 AI 已经给出最终答案，Agent 可以结束。
        if (!fullAIMessage.tool_calls || fullAIMessage.tool_calls.length === 0) {
            console.log(`\n✨ AI 最终回复:\n${fullAIMessage.content}\n`);
            return fullAIMessage.content;
        }

        // 执行工具调用。
        //
        // 注意：上面流式预览 write_file 只是“展示正在生成的参数”，
        // 真正执行工具要等 fullAIMessage 完整之后，
        // 因为这时 tool_calls 才是完整、稳定的。
        for (const toolCall of fullAIMessage.tool_calls) {
            // 根据模型给出的工具名，在本地工具列表中找到真实工具。
            const foundTool = tools.find((t) => t.name === toolCall.name);
            if (foundTool) {
                // 调用真实工具。
                // 例如 write_file 会真的写入文件，execute_command 会真的执行命令。
                const toolResult = await foundTool.invoke(toolCall.args);

                // 把工具执行结果作为 ToolMessage 写入历史。
                //
                // tool_call_id 很重要：
                // 它告诉模型“这条工具结果对应你刚才的哪个 tool call”。
                await history.addMessage(
                    new ToolMessage({
                        content: toolResult,
                        tool_call_id: toolCall.id,
                    }),
                );
            }
        }
        // 工具结果已经加入 history，下一轮循环会重新 getMessages()，
        // 让 AI 基于工具返回结果继续决定下一步。
    }

    // 如果循环次数用完还没结束，就返回历史里最后一条消息内容。
    const finalMessages = await history.getMessages();
    return finalMessages[finalMessages.length - 1].content;

}


// 测试用例：让 Agent 创建一个 React TodoList 项目。
//
// 这个任务会触发多种工具调用：
// - execute_command：创建项目、安装依赖、启动服务
// - write_file：重写 App.tsx / App.css
// - list_directory：查看目录结构
//
// 对这个 stream 版本来说，最有观察价值的是 write_file：
// 你能看到模型生成文件内容时，代码片段被实时打印出来。
const case1 = `创建一个功能丰富的 React TodoList 应用：

1. 创建项目：echo -e "n\\n\\n" | pnpm create vite react-todo-app --template react-ts
2. 修改 src/App.tsx，实现完整功能的 TodoList：
 - 添加、删除、编辑、标记完成
 - 分类筛选（全部/进行中/已完成）
 - 统计信息显示
 - localStorage 数据持久化
3. 添加复杂样式：
 - 渐变背景（蓝到紫）
 - 卡片阴影、圆角
 - 悬停效果
4. 添加动画：
 - 添加/删除时的过渡动画
 - 使用 CSS transitions
5. 列出目录确认

注意：使用 pnpm，功能要完整，样式要美观，要有动画效果

之后在 react-todo-app 项目中：
1. 使用 pnpm install 安装依赖
2. 使用 pnpm run dev 启动服务器
`;

// ==========================================
// 程序入口：运行！
// ==========================================
// try-catch 包裹，捕获任何未处理的错误，优雅地显示给用户
try {
    await runAgentWithTools(case1);
} catch (error) {
    // 如果发生错误，用红色显示错误信息
    console.log('\n' + chalk.red.bold('❌ 发生错误:'));
    console.error(chalk.red(error.message) + '\n');
}
