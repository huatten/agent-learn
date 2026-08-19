// 自动加载项目根目录下的 .env 文件，将环境变量注入 process.env
import 'dotenv/config'

// RunnableWithMessageHistory：为 Runnable 增加会话历史记忆能力
import { RunnableWithMessageHistory } from '@langchain/core/runnables'

// InMemoryChatMessageHistory：在内存中存储会话消息历史
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history'

// ChatOpenAI：用于调用兼容 OpenAI API 格式的聊天模型
import { ChatOpenAI } from '@langchain/openai'

// ChatPromptTemplate：构建聊天消息格式的提示词模板
// MessagesPlaceholder：在提示词模板中预留消息历史的位置
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'

// StringOutputParser：将模型返回的 AIMessage 直接提取为字符串
import { StringOutputParser } from '@langchain/core/output_parsers'

// 这个文件演示的是「使用 RunnableWithMessageHistory 实现多轮对话记忆」。
//
// 核心思路：
// 1. 在提示词模板中预留一个 history 占位符
// 2. 每次调用时传入当前问题和历史消息
// 3. RunnableWithMessageHistory 自动管理消息的追加和读取
//
// 这样模型在回答时就能看到之前的对话内容，实现上下文记忆。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    modelName: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 温度设为 0，让模型输出更加稳定。
    temperature: 0,

    configuration: {
        // OPENAI_API_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_API_BASE_URL,
    },
})

// 定义聊天提示词模板。
//
// 该模板包含三部分：
// 1. system 消息：设定助手的角色
// 2. MessagesPlaceholder('history')：预留历史消息的位置
// 3. human 消息：当前用户提问
const prompt = ChatPromptTemplate.fromMessages([
    ['system', '你是一个专业的助手，能够回答用户的问题。'],
    new MessagesPlaceholder('history'),
    ['human', '{question}'],
])

// 将 prompt、model 和输出解析器组合成一个简单的 Chain。
const simpleChain = prompt.pipe(model).pipe(new StringOutputParser())

// 创建一个 Map 来存储多个会话的历史记录。
// key 是 sessionId，value 是对应的 InMemoryChatMessageHistory 实例。
const messageHistory = new Map()

// 根据 sessionId 获取或创建对应的消息历史实例。
//
// 每次调用链时，RunnableWithMessageHistory 会通过这个函数
// 读取特定会话的历史消息，并在调用完成后将新消息追加进去。
const getMessageHistory = (sessionId) => {
    if (!messageHistory.has(sessionId)) {
        messageHistory.set(sessionId, new InMemoryChatMessageHistory())
    }
    return messageHistory.get(sessionId)
}

// 使用 RunnableWithMessageHistory 包装 simpleChain，为其增加会话记忆。
//
// 配置说明：
// - runnable：要包装的原始链
// - getMessageHistory：根据 sessionId 获取消息历史的函数
// - inputMessagesKey：输入参数中代表用户问题的字段名
// - historyMessagesKey：提示词模板中用于插入历史消息的占位符名称
const chain = new RunnableWithMessageHistory({
    runnable: simpleChain,
    getMessageHistory: (sessionId) => getMessageHistory(sessionId),
    inputMessagesKey: 'question',
    historyMessagesKey: 'history',
})

// 测试第一次对话：自我介绍。
console.log('------- 第一次对话开始 -------')
const result1 = await chain.invoke(
    {
        question: '我的名字是张三，我今年18岁，我是中国人',
    },
    {
        configurable: {
            // 指定会话 ID，用于区分不同用户的对话历史。
            sessionId: 'user_123',
        },
    }
)
console.log('问题: 我的名字是张三，我今年18岁，我是中国人')
console.log('回答:', result1)
console.log('--------第一次对话结束---------')

// 测试第二次对话：询问之前提供的信息。
//
// 由于使用了相同的 sessionId，模型能读取到第一次对话中用户提供的信息，
// 因此可以正确回答"我是中国人吗？"这个问题。
console.log('------- 第二次对话开始(询问之前的信息) -------')
const result2 = await chain.invoke(
    {
        question: '我是中国人吗？',
    },
    {
        configurable: {
            sessionId: 'user_123',
        },
    }
)
console.log('问题: 我是中国人吗？')
console.log('回答:', result2)
console.log('--------第二次对话结束---------')

// 测试第三次对话：再次询问之前的信息。
//
// 模型能够结合第一次对话中的年龄信息，判断是否成年。
console.log('------- 第三次对话开始(询问之前的信息) -------')
const result3 = await chain.invoke(
    {
        question: '我成年了没有？',
    },
    {
        configurable: {
            sessionId: 'user_123',
        },
    }
)
console.log('问题: 我成年了没有？')
console.log('回答:', result3)
console.log('--------第三次对话结束---------')