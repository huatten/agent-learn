/**
 * RunnableWithConfig 示例
 *
 * 这个文件演示的是「Runnable 配置注入机制」。
 *
 * 核心概念：
 * - .withConfig() 可以为 Runnable 预设配置，调用时自动注入
 * - 配置项通过 config 参数传递给每个 Runnable 的 func 函数
 * - configurable 是用户自定义的任意配置对象，可以存放 ID、角色、语言等任意信息
 * - 同一条链，搭配不同的 config 就能产出不同的结果
 *
 * 典型应用场景：
 * - 多语言：通过 local 配置切换输出语言
 * - 多租户：通过 id 配置查询不同用户的数据
 * - 权限控制：通过 role 配置判断用户操作权限
 * - A/B 测试：不同 config 走不同分支
 */

import 'dotenv/config'
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables'

// 模拟一个简单的数据库（用 Map 模拟）。
//
// 真实项目中这里通常是数据库查询、缓存读取等操作。
// 这里为了演示方便，直接用 Map 存了两个用户。
const db = new Map([
    [1, { id: 1, name: '张三', email: 'zhangsan@example.com' }],
    [2, { id: 2, name: '李四', email: 'lisi@example.com' }]
])

// 节点 1：根据 config.configurable.id 查询用户信息。
//
// input：上一步的输出（链的第一步，就是 invoke 传入的值）
// config：由 withConfig() 注入的配置对象
//
// 这里演示的是：从 config 中取 id，查数据库找到对应用户。
const fetchUserFromConfig = RunnableLambda.from(async (input, config) => {
    // 从 config.configurable 中取用户 ID。
    const userId = config?.configurable?.id
    console.log('节点1收到了通知内容', input);
    console.log('节点从config中获取到的用户ID', userId);

    // 根据 ID 从模拟数据库中查询用户。
    const user = userId && db.get(userId) || null
    if (!user) {
        throw new Error(`用户ID ${userId} 不存在`)
    }

    // 返回用户信息 + 原始通知内容，传递给下一个节点。
    return {
        user,
        notification: input
    }

})

// 节点 2：根据 config.configurable.role 做权限判断。
//
// 只有管理员、运营、系统三个角色有发送通知的权限，
// 普通用户没有权限时会抛出异常。
const checkPermissionByRole = RunnableLambda.from(async (state, config) => {
    // 从 config 中取角色，默认为"普通用户"。
    const role = config?.configurable?.role ?? '普通用户'
    console.log('节点2当前角色', role);

    // 判断当前角色是否有权限。
    const canSend = role === '管理员' || role === '运营' || role === '系统'
    if (!canSend) {
        throw new Error(`用户${role}没有发送发送权限`)
    }

    // 把角色信息加到 state 中，传递给下一个节点。
    return {
        ...state,
        role
    }
})

// 节点 3：根据 config.configurable.local 生成多语言通知文案。
//
// local 决定输出语言：en-US 输出英文，zh-CN 输出中文。
// 这种模式在国际化（i18n）场景中非常常见。
const generateNotificationByLocal = RunnableLambda.from(async (state, config) => {
    // 从 config 中取语言偏好，默认中文。
    const local = config?.configurable?.local ?? 'zh-CN'
    console.log('节点3当前语言', local);

    let content;
    if (local === 'en-US') {
        // 英文文案：使用英文用户名称和通知内容。
        content = `Dear ${state.user.name}, ${state.notification} from role ${state.role}`
    } else {
        // 中文文案：使用中文问候语。
        content = `你好，${state.user.name}！${state.notification}来自${state.role}`
    }

    return {
        ...state,
        local,
        finalNotification: content
    }
})

// 把三个节点组合成一条链。
// 执行顺序：查询用户 → 检查权限 → 生成通知文案
const runnable = RunnableSequence.from([
    fetchUserFromConfig,
    checkPermissionByRole,
    generateNotificationByLocal
])

// 使用 .withConfig() 为链预设配置。
//
// 预设配置后，每次调用都会自动注入这些参数，不需要手动传入。
// 不同的配置可以共用同一条链，实现"一套逻辑，多种运行方式"。

// 配置 1：用户 1（张三），管理员，中文。
const runnableWithConfig = runnable.withConfig({
    // tags：给这次执行打标签，用于日志和调试时区分。
    tags: ['notification'],
    // metadata：元数据，记录执行上下文信息，方便追踪。
    metadata: {
        demoName: 'RunnableWithConfig'
    },
    // configurable：用户自定义配置，各节点通过 config.configurable 读取。
    configurable: {
        id: 1,            // 用户 ID
        role: '管理员',     // 用户角色
        local: 'zh-CN'     // 输出语言
    }
})

// 配置 2：用户 2（李四），运营，英文。
const runnableWithConfig2 = runnable.withConfig({
    tags: ['notification'],
    metadata: {
        demoName: 'RunnableWithConfig2'
    },
    configurable: {
        id: 2,
        role: '运营',
        local: 'en-US'
    }
})

// 测试配置 1：张三收到中文通知。
// 输入：通知内容"你好，张三！你有一个新的订单！"
// 输出：经过三个节点处理，最终生成中文通知文案。
const result = await runnableWithConfig.invoke('你好，张三！你有一个新的订单！')
console.log(result.finalNotification)

console.log('-------- runnableWithConfig2 ---------')

// 测试配置 2：李四收到英文通知。
// 输入：英文通知内容"hello, zhangsan, you have a new order"
// 输出：经过三个节点处理，最终生成英文通知文案。
const result2 = await runnableWithConfig2.invoke('hello, zhangsan, you have a new order')
console.log(result2.finalNotification)