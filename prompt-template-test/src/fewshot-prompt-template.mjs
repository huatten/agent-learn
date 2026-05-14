import { PromptTemplate, FewShotPromptTemplate } from "@langchain/core/prompts";

// 这个文件演示的是 FewShotPromptTemplate。
//
// Few-shot 的意思是“给模型少量示例，让它照着示例完成新任务”。
//
// 普通 Prompt 只告诉模型“你要做什么”；
// Few-shot Prompt 会额外告诉模型：
// - 类似输入长什么样
// - 期望输出长什么样
// - 语气和结构应该参考哪些例子
//
// 这在写作类任务里很常用。
// 比如你希望模型写周报时“有某种固定风格”，
// 与其只写一句“语气专业”，不如给它几段真实示例，它更容易模仿到位。

// 定义 few-shot 示例模板。
//
// 这个 examplePrompt 描述“单条示例长什么样”。
// 后面 examples 数组里的每一项，都会被填进这个模板里。
//
// 这里每条示例包含三部分：
// 1. user_requirement：用户当时的写作要求
// 2. expected_style：期望风格
// 3. report_snippet：模型应该学习的输出片段
const examplePrompt = PromptTemplate.fromTemplate(`
用户输入：{user_requirement}
期望周报结构：{expected_style}
模型示例输出片段：
{report_snippet}
---
`)

// 准备几条示例数据。
//
// 每个对象都要提供 examplePrompt 中需要的变量：
// - user_requirement
// - expected_style
// - report_snippet
//
// FewShotPromptTemplate 会把这些示例逐条格式化，
// 然后拼进最终 prompt。
const examples = [
    {
        // 示例 1：偏稳定性治理。
        // 这个例子教模型：当用户关注风险和技术债时，输出应该稳健、具体、强调兜底动作。
        user_requirement:
            '重点突出稳定性治理，本周主要在修 Bug 和清理技术债，适合发给偏关注风险的老板。',
        expected_style: '语气稳健、偏保守，多强调风险识别和已做的兜底动作。',
        report_snippet:
            `- 支付链路本周共处理线上 P1 Bug 2 个、P2 Bug 3 个，全部在 SLA 内完成修复；\n` +
            `- 针对历史高频超时问题，完成 3 个核心接口的超时阈值和重试策略优化；\n` +
            `- 清理 12 条重复/噪音告警，减少值班同学 30% 的告警打扰。`,
    },
    {
        // 示例 2：偏成果展示。
        // 这个例子教模型：当用户希望对外展示成果时，输出可以更积极、更突出亮点。
        user_requirement:
            '偏向对外展示成果，希望多写一些亮点，适合发给更大范围的跨部门同学。',
        expected_style: '语气积极、突出成果，对技术细节做适度抽象。',
        report_snippet:
            `- 新上线「订单实时看板」，业务侧可以实时查看核心转化漏斗；\n` +
            `- 首次打通埋点 → 数据仓库 → 实时服务链路，为后续精细化运营提供基础能力；\n` +
            `- 和产品、运营一起完成 2 场内部分享，会后收到 15 条正向反馈。`,
    },
]

// 把示例封装成 FewShotPromptTemplate。
//
// FewShotPromptTemplate 的最终结构大致是：
//
// prefix
// 示例 1
// 示例 2
// ...
// suffix
//
// 它帮我们自动完成“把多条示例按统一格式拼接起来”这件事。
const fewShotPrompt = new FewShotPromptTemplate({
    // 示例数据列表。
    examples,

    // 单条示例的格式模板。
    examplePrompt,

    // prefix：放在所有示例前面的说明。
    // 这里告诉模型：下面这些是周报示例，要学习语气、结构和信息组织方式。
    prefix:  `下面是几条已经写好的【周报示例】，你可以从中学习语气、结构和信息组织方式：\n`,

    // suffix：放在所有示例后面的新任务说明。
    // 这里告诉模型：参考上面的示例风格，去写新的周报。
    suffix: `\n基于上面的示例风格，请帮我写一份新的周报。` +
        `\n如果用户有额外要求，请在满足要求的前提下，尽量保持示例中的结构和条理性。`,

    // 当前这个 fewShotPrompt 没有额外输入变量。
    // 因为新任务说明已经写死在 suffix 里。
    //
    // 如果后续想让“新的用户要求”也变成变量，
    // 可以在 suffix 里写 {new_requirement}，然后把 inputVariables 改成 ["new_requirement"]。
    inputVariables: []
})

// 格式化 few-shot prompt。
//
// 因为 inputVariables 是空数组，所以这里传空对象即可。
// format() 的结果是一个字符串，里面已经包含 prefix、所有示例和 suffix。
const fewShotBlock = await fewShotPrompt.format({});

// 打印 few-shot prompt。
// 学习时重点观察：
// 多条 examples 是如何被 examplePrompt 格式化并拼起来的。
console.log('fewShotBlock',fewShotBlock);
// 输出如下：

// 下面是几条已经写好的【周报示例】，你可以从中学习语气、结构和信息组织方式：
//
//
//
// 用户输入：重点突出稳定性治理，本周主要在修 Bug 和清理技术债，适合发给偏关注风险的老板。
// 期望周报结构：语气稳健、偏保守，多强调风险识别和已做的兜底动作。
// 模型示例输出片段：
// - 支付链路本周共处理线上 P1 Bug 2 个、P2 Bug 3 个，全部在 SLA 内完成修复；
// - 针对历史高频超时问题，完成 3 个核心接口的超时阈值和重试策略优化；
// - 清理 12 条重复/噪音告警，减少值班同学 30% 的告警打扰。
// ---
//
//
//
//     用户输入：偏向对外展示成果，希望多写一些亮点，适合发给更大范围的跨部门同学。
// 期望周报结构：语气积极、突出成果，对技术细节做适度抽象。
// 模型示例输出片段：
// - 新上线「订单实时看板」，业务侧可以实时查看核心转化漏斗；
// - 首次打通埋点 → 数据仓库 → 实时服务链路，为后续精细化运营提供基础能力；
// - 和产品、运营一起完成 2 场内部分享，会后收到 15 条正向反馈。
// ---
//
//
//
//     基于上面的示例风格，请帮我写一份新的周报。
// 如果用户有额外要求，请在满足要求的前提下，尽量保持示例中的结构和条理性。
