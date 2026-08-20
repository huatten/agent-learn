/**
 * RunnableWithRetry 示例
 *
 * 这个文件演示的是「Runnable 重试机制」。
 *
 * 核心概念：
 * - .withRetry() 会自动包装一个 Runnable，当它抛出异常时自动重试
 * - 适用于不稳定的操作：网络请求、模型调用、数据库操作等可能偶发失败的场景
 * - 可以配置最大重试次数、指数退避策略等参数
 *
 * 流程：
 * 1. 定义一个会随机失败的 Runnable（70% 概率抛出异常）
 * 2. 用 .withRetry() 包装，设置最多重试 5 次
 * 3. 调用 invoke()，观察自动重试行为
 */

import 'dotenv/config'
import { RunnableLambda } from '@langchain/core/runnables'

// 记录总尝试次数，方便观察重试行为。
let attempt = 0

// 定义一个会随机失败的 RunnableLambda。
//
// Math.random() < 0.7 意味着 70% 的概率会失败。
// 这种"不稳定的 Runnable"在真实场景中很常见，比如：
// - 调用第三方 API 时网络抖动
// - 模型服务偶发超时
// - 数据库连接暂时不可用
const unstableRunnable = RunnableLambda.from(async (input) => {
    attempt++
    console.log(`第 ${attempt} 次尝试，输入: ${input}`);

    // 70% 概率抛出异常，模拟不稳定的服务。
    if (Math.random() < 0.7) {
        console.log(`随机失败了 ${attempt} 次`);
        throw new Error('Random error')
    }

    // 成功时返回结果。
    console.log(`成功处理输入: ${input}`);
    return input
})

// 使用 .withRetry() 包装不稳定 Runnable。
//
// .withRetry() 返回一个新的 Runnable，内部实现了重试逻辑：
// - 当底层 Runnable 抛出异常时，自动捕获并重新调用
// - stopAfterAttempt(5)：最多尝试 5 次（包括第一次），超过后抛出最终异常
// - 如果 5 次内有任何一次成功，立即返回结果，不再继续
//
// 可选参数（未演示，供参考）：
// - waitBetweenAttempts：每次重试前等待的毫秒数（默认 0）
// - 指数退避：默认会自动递增等待时间，避免给服务施加压力
const retryableRunnable = unstableRunnable.withRetry({
    stopAfterAttempt: 5
})

// 调用带重试的 Runnable。
//
// 如果 5 次全部失败，会进入 catch 块。
// 如果某次成功，则立即返回结果，console.log 打印成功输出。
try {
    const result = await retryableRunnable.invoke('演示一下 WithRetry')
    console.log('最终结果:', result)
} catch (error) {
    // 5 次重试全部失败后，进入这里。
    console.error('重试失败:', error)
}