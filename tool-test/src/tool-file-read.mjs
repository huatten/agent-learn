/**
 * @fileoverview 这是一个 LangChain 工具调用的入门示例
 * 功能：让大模型自动读取文件内容并解释代码
 *
 * 核心概念：
 * - 工具（Tool）：给大模型提供一个可以调用的函数，让它能完成自身做不到的事情（比如读取本地文件）
 * - 代理循环（Agent Loop）：大模型决定是否调用工具 → 执行工具获取结果 → 大模型基于结果给出最终回答
 *
 * 本示例流程：
 * 1. 用户说"请读取某个文件并解释代码"
 * 2. 大模型发现它需要读取文件，于是调用我们提供的 read_file 工具
 * 3. 我们的代码执行工具，真正读取文件，把内容返回给大模型
 * 4. 大模型拿到文件内容，给出最终的解释
 */

// 加载环境变量配置
// dotenv 会自动读取项目根目录下的 .env 文件，并将其中的配置注入到 process.env 中
// 这样我们就可以把 API Key、API 地址等敏感信息放在 .env 文件里，不会泄露到代码中
import "dotenv/config";

// 从 @langchain/openai 包中导入 ChatOpenAI 类
// 这是 LangChain 对 OpenAI 兼容接口聊天模型的封装，让我们可以用统一的方式调用不同的大模型
import { ChatOpenAI } from "@langchain/openai";

// 从 @langchain/core/tools 导入 tool 函数
// 这个函数帮助我们快速创建一个 LangChain 能识别的自定义工具
import { tool } from "@langchain/core/tools";

// 导入消息类型：
// - SystemMessage：系统提示词，告诉大模型它的角色和要遵守的规则
// - HumanMessage：用户发送的消息
// - ToolMessage：工具执行完返回的结果消息
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

// 导入 Node.js 内置的文件系统模块（promise版本）
// 我们用它来真正执行读取文件的操作
import fs from "node:fs/promises";

// 导入 zod 库，用于定义数据验证模式（Schema）
// LangChain 工具要求我们用 zod 定义参数格式，这样它能帮我们验证输入是否正确
import { z } from "zod";

// ==========================================
// 步骤 1：创建大模型实例
// ==========================================
// 创建 ChatOpenAI 模型实例，配置连接大模型服务所需参数
const model = new ChatOpenAI({
  // 使用的模型名称，从环境变量中读取
  // 例如："gpt-3.5-turbo"、"glm-4"、"qwen-max" 等
  model: process.env.MODEL_NAME,

  // API 密钥，从环境变量中读取，用于身份认证
  // 这是敏感信息，绝对不能写死在代码里！
  apiKey: process.env.OPENAI_API_KEY,

  // 温度参数（temperature）：控制输出的随机性
  // 范围 0 ~ 1，值越小输出越确定、越稳定；值越大输出越多样、越有创意
  // 这里用 0 是因为我们做工具调用，需要稳定、可预测的输出
  temperature: 0,

  // 额外配置项，这里设置自定义的 API 基础地址
  // 如果你不是直接使用 OpenAI 官方 API，而是使用第三方服务
  // （比如智谱清言、通义千问、豆包等提供了 OpenAI 兼容接口的服务）就需要配置此项
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// ==========================================
// 步骤 2：创建自定义工具
// ==========================================
// 使用 tool 函数创建一个自定义工具
// 参数 1：工具的实际执行函数（当大模型调用这个工具时会运行这个函数）
// 参数 2：工具的元信息（名称、描述、参数格式），这些信息会告诉大模型什么时候用这个工具
const readFileTool = tool(
  // 工具的实际执行函数，接收大模型传过来的参数
  // 参数结构由下面的 schema 定义，这里我们定义了需要一个 filePath 参数
  async ({ filePath }) => {
    // 使用 Node.js 的 fs.readFile 真正读取文件内容，编码为 UTF-8
    const content = await fs.readFile(filePath, "utf-8");

    // 打印日志，方便我们在控制台看到工具确实被调用了
    console.log(`[工具调用] read_file("${filePath}") - 成功读取${content.length}字节`);

    // 返回文件内容，这个返回值会被送回给大模型
    // 大模型会基于这个文件内容继续思考，给出最终回答
    return `文件内容:\n${content}`;
  },
  {
    // 工具名称：大模型通过这个名字来识别和调用工具
    // 名称要简洁，只能包含字母、数字、下划线和连字符
    name: "read_file",

    // 工具描述：告诉大模型这个工具是做什么的，什么时候应该使用它
    // ⚠️ 这非常重要！描述越清晰详细，大模型越容易正确选择工具
    description: "用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。",

    // 使用 zod 定义工具参数的验证模式（Schema）
    // 这里告诉 LangChain：我们这个工具需要一个 filePath 参数，它必须是字符串
    // zod 会自动帮我们验证输入，如果格式不对会抛出错误，避免程序出错
    schema: z.object({
      filePath: z.string().describe("要读取的文件路径"),
    })
  }
);

// 将所有可用工具放入一个数组
// 一个 Agent 可以同时拥有多个工具（比如读文件、写文件、网络请求等）
const tools = [readFileTool];

// ==========================================
// 步骤 3：让模型绑定工具
// ==========================================
// bindTools 方法会告诉模型有哪些工具可以使用
// 并且让模型学会输出符合工具调用格式的响应
const modelWithTools = model.bindTools(tools);

// ==========================================
// 步骤 4：构建对话消息
// ==========================================
// LangChain 使用"消息列表"来维护整个对话的上下文
// 每条消息都是不同角色说的话（系统、用户、AI、工具）
const messages = [
  // SystemMessage = 系统消息
  // 这是给大模型的"剧本"，在这里定义它的角色、工作流程、规则
  new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。

  工作流程：
  1. 用户要求读取文件时，立即调用 read_file 工具
  2. 等待工具返回文件内容
  3. 基于文件内容进行分析和解释

  可用工具：
  - read_file: 读取文件内容（使用此工具来获取文件内容）
`),

  // HumanMessage = 用户消息
  // 这是我们模拟用户发送给大模型的指令
  // 这里我们让大模型读取当前这个文件并解释代码
  new HumanMessage("请读取 src/tool-file-read.mjs 文件内容并解释代码")
];

// ==========================================
// 步骤 5：Agent 循环 - 处理工具调用
// ==========================================
// 第一次调用：把消息发给绑定了工具的模型
// 模型会判断："我现在需要调用工具吗？"
// - 如果需要读取文件，它会返回 tool_calls（工具调用请求）
// - 如果已经有答案了，它会直接返回最终回答
let response = await modelWithTools.invoke(messages);

// 把模型的响应添加到消息列表中，这样上下文就延续下去了
messages.push(response);

// 进入 Agent 循环：只要模型要求调用工具，我们就执行它
// 这个循环可能会执行多次，因为大模型可能一次调用多个工具，或者分步骤调用
while (response.tool_calls && response.tool_calls.length > 0) {
    console.log(`\n[检测到${response.tool_calls.length}个工具调用]`);

    // 并发执行所有被请求的工具调用，得到每个工具的返回结果
    const toolResults = await Promise.all(
        response.tool_calls.map(async (toolCall) => {
           // 根据工具名称在我们的工具列表中找到对应的工具
           const foundTool = tools.find(t => t.name === toolCall.name);

           // 如果没找到，返回错误信息
           if (!foundTool) {
               return `错误 => 未找到工具：${toolCall.name}`;
           }

           // 打印日志，显示我们正在调用这个工具
           console.log(`[正在调用工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);

            try {
                // 真正执行工具，传入大模型给的参数，得到返回结果
                const result = await foundTool.invoke(toolCall.args);
                return result;
            } catch (error) {
                // 如果工具执行出错，返回错误信息而不是让整个程序崩溃
                return `错误:${error.message}`;
            }
        })
    );

    // 把每个工具调用的结果包装成 ToolMessage，添加到消息列表中
    // 这样下一次调用模型时，它就能看到工具执行的结果了
    response.tool_calls.forEach((toolCall, index) => {
        messages.push(
            new ToolMessage({
                tool_call_id: toolCall.id,  // 必须对应上之前的工具调用 ID
                content: toolResults[index],  // 工具返回的结果
            })
        );
    });

    // 把包含工具结果的消息再次发给模型，让它基于工具返回的结果继续处理
    // 这一次模型可能会要求调用更多工具，或者直接给出最终回答
    response = await modelWithTools.invoke(messages);
}

// ==========================================
// 步骤 6：输出最终结果
// ==========================================
// 循环结束了 → 模型没有更多工具调用要求了
// 此时 response.content 就是模型给出的最终回答
console.log('\n[最终回复]');
console.log(response.content);
