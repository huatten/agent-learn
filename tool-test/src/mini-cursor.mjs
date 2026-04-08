/**
 * @fileoverview Mini Cursor - 一个极简的 Cursor 代理（Agent）实现
 *
 * 🎯 这是什么？
 * 这是一个模仿 Cursor AI 的极简实现，让大模型能够：
 * 1. 读取文件 📄
 * 2. 写入文件 ✏️
 * 3. 执行终端命令 ⚡
 * 4. 列出目录 📂
 *
 * 大模型会自己思考："我现在需要做什么？需要调用哪个工具？"
 * 这就是最基础的 AI 代理（Agent）工作原理！
 *
 * 🚀 工作流程：
 * 1. 用户给一个任务（比如"帮我创建一个 React Todo 应用"）
 * 2. AI 分析任务，决定是否需要调用工具
 * 3. 如果需要，AI 输出工具调用请求（比如要创建项目、写文件）
 * 4. 我们执行工具，把结果返回给 AI
 * 5. AI 继续思考，可能继续调用工具，也可以直接给出最终回答
 * 6. 重复这个过程直到任务完成
 *
 * 💡 核心概念：
 * - Agent（代理）：让 AI 能够自己使用工具完成任务，而不只是聊天
 * - Tool Calling（工具调用）：现代大模型都支持这个功能，AI 知道什么时候该调用工具
 * - ReAct Loop（思考-行动循环）：AI 思考 → 行动 → 观察结果 → 继续思考...
 * - Max Iterations（最大迭代次数）：防止 AI 陷入死循环
 */

// 加载环境变量，从 .env 文件读取配置（API Key、模型名称、API 地址等）
import 'dotenv/config';

// chalk：给终端文字添加颜色，让输出更好看
import chalk from 'chalk';

// 从 LangChain 导入 OpenAI 聊天模型封装
import { ChatOpenAI } from '@langchain/openai';

// 导入消息类型：不同角色发送不同类型的消息
// - SystemMessage：系统提示词，告诉 AI 它的角色和规则
// - HumanMessage：用户消息，就是用户说的话
// - ToolMessage：工具返回的消息，放工具执行的结果
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

// 导入我们已经定义好的四个工具
// 这些工具都在 al-tools.mjs 文件里实现了
import { readFileTool, writeFileTool, executeCommandTool, listDirectoryTool } from './al-tools.mjs';

// 导入我们抽离出去的工具函数（动画、颜色、图标）
import { getToolColor, getToolIcon, startLoadingAnimation } from './utils.mjs';

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
    // 创建初始消息列表，这是 Agent 的上下文记忆
    // 第一个消息是系统提示，第二个消息是用户请求
    const messages = [
        // SystemMessage = 系统提示词 = 给 AI 的"剧本"
        // 在这里告诉 AI：你是谁，你能做什么，规则是什么
        new SystemMessage(`你是一个项目管理助手，使用工具完成任务。
            当前工作目录：${process.cwd()}

            你可以使用以下工具：
            1.read_file: 读取文件内容
            2.write_file: 写入文件内容
            3.execute_command: 在终端执行命令（支持 workingDirectory 参数切换工作目录）
            4.list_directory: 列出目录内容，看看有哪些文件

            📢 非常重要的规则 - execute_command：
            - workingDirectory 参数会自动帮你切换到指定目录
            - 当使用 workingDirectory 时，绝对不要在 command 里再写 cd
            - ❌ 错误示例: { "command": "cd react-todo-app && pnpm install", "workingDirectory": "react-todo-app" }
              这样写是错的！因为 workingDirectory 已经在 react-todo-app 了，再 cd 就找不到了
            - ✅ 正确示例: { "command": "pnpm install", "workingDirectory": "react-todo-app" }
              这样就对了！workingDirectory 已经帮你切好目录了，直接执行命令就行

            回复要简洁一点，只说你做了什么，不要啰嗦。
        `),

        // HumanMessage = 用户消息 = 这就是用户实际要求 AI 做的事情
        new HumanMessage(query),
    ];

    // 程序启动时，打印一个漂亮的欢迎横幅
    // 用颜色和分隔线让输出更易读
    console.log(chalk.bold.blue('\n🚀 Mini Cursor Agent 已启动'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.yellow.bold('📝 用户请求:'));
    console.log(chalk.gray(query));
    console.log(chalk.gray('─'.repeat(60)) + '\n');

    // ==========================================
    // ReAct Loop：思考 → 行动 → 观察 循环
    // ==========================================
    // 最多循环 maxInterations 次，防止 AI 无限循环
    for (let i = 0; i < maxInterations; i++) {
        // 启动加载动画，让用户知道 AI 正在思考中
        // stopAnimation 是一个函数，调用它就可以停止动画
        const stopAnimation = startLoadingAnimation('AI 正在思考...');

        // 调用大模型，传入当前所有消息（上下文）
        // 大模型会返回一个响应，可能是直接回答，也可能是要求调用工具
        const response = await modelWithTools.invoke(messages);

        // AI 回复了，停止加载动画
        stopAnimation();

        // 把 AI 的响应加入消息列表，作为下次对话的上下文
        messages.push(response);

        // ==========================================
        // 检查 AI 是否要求调用工具
        // response.tool_calls 如果存在，表示 AI 要调用工具
        // 如果不存在，表示 AI 直接给出最终回答，任务完成
        // ==========================================
        if (!response.tool_calls?.length) {
            // 没有工具调用 → 输出最终回答，结束任务
            console.log('\n' + chalk.green.bold('✨ 任务完成！') + chalk.green(' 最终回复:'));
            console.log(chalk.white(response.content));
            console.log(chalk.gray('─'.repeat(60)) + '\n');
            return response.content;
        }

        // 有工具调用 → 打印当前是第几步，一共几个工具调用
        console.log(chalk.gray(`[步骤 ${i + 1}/${maxInterations}] 检测到 ${chalk.yellow(response.tool_calls.length)} 个工具调用\n`));

        // ==========================================
        // 遍历所有工具调用，逐个执行
        // AI 可以一次调用多个工具，所以要用循环
        // ==========================================
        for (const toolCall of response.tool_calls) {
            // 根据工具名称获取对应的颜色和图标（美化输出用）
            const color = getToolColor(toolCall.name);
            const icon = getToolIcon(toolCall.name);

            // 在终端打印出：AI 正在调用哪个工具，参数是什么
            // 这对调试非常有帮助，你能看到 AI 在想什么
            console.log(`  ${icon} ${chalk.bold(color('运行工具:'))} ${color(toolCall.name)}`);

            // 如果有参数，把参数也打印出来（格式化缩进，方便阅读）
            if (Object.keys(toolCall.args).length > 0) {
                console.log(`  ${chalk.gray('参数:')} ${chalk.dim(JSON.stringify(toolCall.args, null, 2).split('\n').join('\n      '))}`);
            }

            // 在我们的工具列表中找到这个工具，根据名称匹配
            const foundTool = tools.find(tool => tool.name === toolCall.name);

            // 如果没找到工具（AI 胡说八道，调用了不存在的工具）
            // 记录错误，返回给 AI，让 AI 自己纠正
            if (!foundTool) {
                console.log(`\n${chalk.red.bold('❌ 错误:')} ${chalk.red(`工具 ${toolCall.name} 不存在`)}\n`);
                return `工具 ${toolCall.name} 不存在`;
            }

            // 真正执行工具，传入 AI 给的参数
            // invoke 是 LangChain 工具的标准调用方法
            const toolResult = await foundTool.invoke(toolCall.args);

            // 工具执行完了，提示一下
            console.log(`  ${chalk.green('✓ 执行完成')}\n`);

            // 把工具执行的结果包装成 ToolMessage，加入消息列表
            // 注意：tool_call_id 必须对应上，这样 AI 才知道这个结果是哪个调用的
            messages.push(new ToolMessage({
                tool_call_id: toolCall.id,
                content: toolResult
            }));
        }
        // 所有工具执行完了，循环会回到顶部，再次调用 AI
        // AI 现在能看到所有工具执行的结果了，它会基于结果继续下一步
    }

    // 如果循环结束还没返回，说明达到了最大迭代次数
    // 这时候停止执行，返回最后一次的结果
    console.log(chalk.yellow.bold(`⚠️  达到最大迭代次数 ${maxInterations}，停止执行`));
    const finalResult = messages[messages.length - 1].content;
    console.log(chalk.white(finalResult) + '\n');
    return finalResult;
}

// ==========================================
// 测试用例 - 在这里放你想要 AI 完成的任务
// ==========================================
// 这个测试用例让 AI 从 0 开始创建一个完整的 React TodoList 应用
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
