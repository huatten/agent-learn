import { PromptTemplate, FewShotPromptTemplate } from "@langchain/core/prompts";
import { LengthBasedExampleSelector } from "@langchain/core/example_selectors";

// 这个文件演示的是 ExampleSelector 里的 LengthBasedExampleSelector。
//
// 前面的 FewShotPromptTemplate 是把所有 examples 都拼进 prompt。
// 但如果示例特别多，就会带来两个问题：
// 1. prompt 太长，浪费 token
// 2. 超过模型上下文长度，甚至直接请求失败
//
// 所以我们需要“示例选择器”：
// 不一定每次都塞全部示例，而是按某种规则挑一部分。
//
// 这个文件用的是 LengthBasedExampleSelector：
// 它的目标是“在长度预算内，尽量选择能放进去的示例”。
//
// 注意：它主要按长度控制，不是按语义相似度选择。
// 如果想按 query 语义相似度选示例，后面可以看 SemanticSimilarityExampleSelector。

// 定义单条示例的 Prompt 模板。
//
// 每个示例都会被格式化成这个样子：
// 用户需求：...
// 周报片段示例：...
// ---
//
// LengthBasedExampleSelector 也会用这个 examplePrompt 估算每条示例格式化后的长度。
const examplePrompt = PromptTemplate.fromTemplate(`
    用户需求：{user_requirement}
    周报片段示例：
    {report_snippet}
---
`)

// 构造一批「长度差异明显」的示例，方便观察选择效果。
//
// 真实项目里 examples 可能有几十条、几百条。
// 这里为了学习，只写 4 条：
// - 有中等长度的稳定性治理示例
// - 有中等长度的成果展示示例
// - 有非常短的“一切稳定”示例
// - 有较长的完整技术周报示例
const examples = [
    {
        // 示例 1：中等长度，偏稳定性和风险控制。
        user_requirement: '本周主要在做基础设施稳定性治理，想突出风险控制。',
        report_snippet:
            `- 核心链路共处理 P1 级别故障 1 起，P2 故障 2 起，均在 SLA 内完成处置；\n` +
            `- 对 5 个高风险接口补充了限流与熔断策略，覆盖 80% 高峰流量；\n` +
            `- 新增 6 条针对延迟抖动的告警规则，减少漏报风险。`,
    },
    {
        // 示例 2：中等长度，偏业务成果和对外展示。
        user_requirement: '偏向对外展示成果，多写一些亮点和业务价值。',
        report_snippet:
            `- 上线「实时订单看板」，支持业务实时查看转化漏斗；\n` +
            `- 打通埋点 → 数据仓库 → 实时服务的闭环，支撑后续精细化运营；\n` +
            `- 完成 2 场内部分享，会后收到 15 条正向反馈。`,
    },
    {
        // 示例 3：非常短，适合在长度预算紧张时仍然保留一个参考。
        user_requirement:
            '只是想要一个非常简短的周报，两三句话就够了，主要告诉老板「一切稳定」即可。',
        report_snippet: `本周整体运行平稳，未发生重大事故，核心指标均在预期范围内。`,
    },
    {
        // 示例 4：较长，信息很完整，但也更消耗长度预算。
        // 如果 maxLength 比较小，它可能会被 selector 排除。
        user_requirement:
            '需要一份比较详细的技术周报，涵盖研发、测试、上线、监控等各个环节，篇幅可以略长。',
        report_snippet:
            `- 研发：完成结算服务重构第一阶段，拆分出 3 个独立子服务，接口延迟较旧架构下降约 35%；\n` +
            `- 测试：补齐 20+ 条关键路径自动化用例，整体用例数量提升到 180 条，回归时间从 2 天缩短到 0.5 天；\n` +
            `- 上线：采用灰度 + Canary 策略，期间监控到 2 次轻微指标抖动，均在 5 分钟内回滚处理；\n` +
            `- 监控：新增 8 条核心告警和 3 个 SLO 指标，后续会结合值班反馈继续收敛噪音告警。`,
    },
]

// 创建 LengthBasedExampleSelector。
//
// fromExamples 会接收所有候选 examples，
// 然后根据 examplePrompt 和长度限制，选择一部分示例。
const exampleSelector = await LengthBasedExampleSelector.fromExamples(examples, {
    // 用于格式化单条示例。
    // selector 需要知道每条示例格式化后大概有多长。
    examplePrompt: examplePrompt,

    // 最大长度预算。
    //
    // 这里用 700 做演示：selector 会尽量选择示例，
    // 但不会让格式化后的示例总长度超过这个预算太多。
    //
    // 真实项目里更建议按 token 估算，而不是按字符数估算。
    maxLength: 700,

    // 自定义长度计算函数。
    //
    // 这里为了简单，直接使用字符串字符长度 text.length。
    // 如果要更接近模型实际消耗，可以换成 token 计算函数。
    getTextLength: (text) => text.length,
})

// 基于 selector 构建 FewShotPromptTemplate。
//
// 和前面的 fewshot-prompt-template.mjs 不同：
// 这里不直接传 examples，而是传 exampleSelector。
//
// FewShotPromptTemplate 会在 format() 时调用 selector，
// 让 selector 自动决定本次 prompt 里要放哪些示例。
const fewShotPrompt = new FewShotPromptTemplate({
    // 单条示例的模板。
    examplePrompt: examplePrompt,

    // 示例选择器。
    // 这就是本文件的核心：示例不是全量加入，而是由 selector 选择。
    exampleSelector: exampleSelector,

    // 所有示例前面的说明。
    prefix:
        '下面是一些不同风格和长度的周报片段示例，你可以从中学习语气和结构：\n',

    // 所有被选中示例后面的新任务。
    //
    // {current_requirement} 是本次用户的新需求，
    // 会在 format() 时填入。
    suffix:
        '\n\n现在请根据上面的示例风格，为下面这个场景写一份新的周报：\n' +
        '场景描述：{current_requirement}\n' +
        '请输出一份适合发给老板和团队同步的 Markdown 周报草稿。',

    // 当前模板对外需要的变量。
    // selector 也可以根据输入变量参与选择；
    // 但 LengthBasedExampleSelector 主要看长度，不看语义。
    inputVariables: ['current_requirement'],
})

// 演示：给定一个较长/较复杂的需求，让 selector 自动选出合适的示例。
//
// 这个需求本身既包含稳定性保障，又包含新功能亮点。
// 但当前 LengthBasedExampleSelector 不是按语义匹配选择，
// 它主要根据长度预算决定能放下哪些示例。
const currentRequirement = '我们本周在做「内部 AI 助手」项目，既有稳定性保障（处理线上问题），' +
    '也有新功能上线（接入知识库、日志检索）。希望周报既能体现「把坑都兜住了」，' +
    '又能展示一部分业务侧能感知到的亮点。';

// 格式化最终 prompt。
//
// 在这一步，FewShotPromptTemplate 会：
// 1. 把 current_requirement 传给 selector
// 2. selector 按长度预算选择一部分 examples
// 3. 用 examplePrompt 格式化被选中的 examples
// 4. 拼接 prefix + 被选中示例 + suffix
const finalPrompt = await fewShotPrompt.format({
    current_requirement: currentRequirement,
})

// 打印最终 prompt。
// 学习时可以重点观察：
// 不是所有 examples 都一定会出现，较长示例可能因为 maxLength 限制被排除。
console.log(finalPrompt);

// 输出结果：
// 下面是一些不同风格和长度的周报片段示例，你可以从中学习语气和结构：
//
//
//
//         用户需求：本周主要在做基础设施稳定性治理，想突出风险控制。
//     周报片段示例：
//     - 核心链路共处理 P1 级别故障 1 起，P2 故障 2 起，均在 SLA 内完成处置；
// - 对 5 个高风险接口补充了限流与熔断策略，覆盖 80% 高峰流量；
// - 新增 6 条针对延迟抖动的告警规则，减少漏报风险。
//     ---
//
//
//
//         用户需求：偏向对外展示成果，多写一些亮点和业务价值。
//     周报片段示例：
//     - 上线「实时订单看板」，支持业务实时查看转化漏斗；
// - 打通埋点 → 数据仓库 → 实时服务的闭环，支撑后续精细化运营；
// - 完成 2 场内部分享，会后收到 15 条正向反馈。
//     ---
//
//
//
//         用户需求：只是想要一个非常简短的周报，两三句话就够了，主要告诉老板「一切稳定」即可。
//     周报片段示例：
//     本周整体运行平稳，未发生重大事故，核心指标均在预期范围内。
//     ---
//
//
//
//
//         现在请根据上面的示例风格，为下面这个场景写一份新的周报：
// 场景描述：我们本周在做「内部 AI 助手」项目，既有稳定性保障（处理线上问题），也有新功能上线（接入知识库、日志检索）。希望周报既能体现「把坑都兜住了」，又能展示一部分业务侧能感知到的亮点。
// 请输出一份适合发给老板和团队同步的 Markdown 周报草稿。
