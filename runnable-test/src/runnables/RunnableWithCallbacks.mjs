/**
 * RunnableWithCallbacks 示例
 *
 * 这个文件演示的是「Runnable 回调监听机制」。
 *
 * 核心概念：
 * - callbacks 是一个数组，每个元素是一个监听对象
 * - 监听对象可以定义 handleChainStart / handleChainEnd / handleChainError 等方法
 * - 每当链执行到某个步骤时，LangChain 会自动调用对应的回调方法
 *
 * 典型应用场景：
 * - 实时监控链的执行进度（每个步骤的输入和输出）
 * - 日志记录（记录每步耗时、结果大小等）
 * - 错误追踪（链执行失败时捕获详细信息）
 * - 性能分析（统计每步的执行时间）
 */

import 'dotenv/config'
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables'

// 定义一个文本处理器：清洗 → 分词 → 统计。
//
// 这是一条简单的三步链，演示 callbacks 如何监听每一步的执行。

// 步骤 1：清理文本 - 去掉首尾空格，把多个连续空格合并成一个。
const clean = RunnableLambda.from((text) => {
    return text.trim().replace(/\s+/g, ' ')
})

// 步骤 2：分词 - 按空格把文本拆成单词数组。
const tokenize = RunnableLambda.from((text) => {
    return text.split(' ')
})

// 步骤 3：统计 - 返回分词结果和词数。
const count = RunnableLambda.from((tokens) => {
    return { tokens, wordCount: tokens.length }
})

// 把三个步骤组合成一条链。
// 执行顺序：clean → tokenize → count
const textChain = RunnableSequence.from([clean, tokenize, count])

// 定义回调监听对象。
//
// 这个对象实现了三个生命周期方法，LangChain 会在对应时机自动调用：
// - handleChainStart：链开始执行时触发
// - handleChainEnd：链执行完成时触发
// - handleChainError：链执行失败时触发
const callback = {
    // 每个步骤开始执行时触发。
    // chain.id 是一个数组，记录了当前步骤在整条链中的位置，
    // 比如 ["RunnableSequence", "RunnableLambda"]，取最后一个就是当前步骤名。
    handleChainStart: (chain) => {
        const step = chain?.id?.[chain?.id?.length - 1] ?? 'unknown'
        console.log('Chain started with step:', step)
    },
    // 每个步骤执行完成时触发。
    // output 包含该步骤的执行结果。
    handleChainEnd: (output) => {
        console.log('Chain ended with output:', JSON.stringify(output))
    },
    // 某个步骤执行失败时触发。
    handleChainError: (error) => {
        console.error('Chain error:', error)
    },
}

// 调用链，传入 callbacks 选项。
//
// callbacks 通过第二个参数传入 invoke()，
// 会在链的每个步骤执行时触发对应的回调方法。
// 注意：callbacks 只是旁听者，不影响链的实际执行逻辑。
const result = await textChain.invoke('今天 恒大集团老板 许家印 被判处 无期徒刑 ！！！', {
    callbacks: [callback],
})

console.log('Final result:', result)

/**
 * 测试
Chain started with step: RunnableSequence
Chain started with step: RunnableLambda
Chain ended with output: {"output":"今天 恒大集团老板 许家印 被判处 无期徒刑 ！！！"}
Chain started with step: RunnableLambda
Chain ended with output: {"output":["今天","恒大集团老板","许家印","被判处","无期徒刑","！！！"]}
Chain started with step: RunnableLambda
Chain ended with output: {"tokens":["今天","恒大集团老板","许家印","被判处","无期徒刑","！！！"],"wordCount":6}
Chain ended with output: {"tokens":["今天","恒大集团老板","许家印","被判处","无期徒刑","！！！"],"wordCount":6}
Final result: {
  tokens: [ '今天', '恒大集团老板', '许家印', '被判处', '无期徒刑', '！！！' ],
  wordCount: 6
}

 */