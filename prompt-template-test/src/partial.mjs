import { pipelinePrompt } from "./pipeline-prompt-template.mjs";

// 这个文件演示的是 PromptTemplate / PipelinePromptTemplate 的 partial 用法。
//
// partial 可以理解成“预填一部分变量，生成一个新的 PromptTemplate”。
//
// 在 pipeline-prompt-template.mjs 里，pipelinePrompt 需要这些变量：
// - tone
// - company_name
// - team_name
// - manager_name
// - week_range
// - team_goal
// - dev_activities
// - company_values
//
// 但在真实业务里，有些变量可能长期不变。
// 例如同一家公司里：
// - company_name 基本固定
// - company_values 基本固定
// - tone 也可能希望统一
//
// 这时候就可以先 partial 这些固定变量，
// 得到一个“已经预填公司信息和风格”的新模板 pipelineWithPartial。

// 预填一部分变量。
//
// partial() 不会立刻生成最终 prompt，
// 它会返回一个新的 prompt 模板。
//
// 这个新模板以后再 format() 时，就不需要重复传：
// - company_name
// - company_values
// - tone
const pipelineWithPartial = await pipelinePrompt.partial({
    // 固定公司名称。
    company_name: '星航科技',

    // 固定公司价值观。
    company_values: '「极致、开放、靠谱」的价值观',

    // 固定写作语气。
    tone: '偏正式但不僵硬',
});


// 第一次使用 partial 后的新模板。
//
// 现在只需要传剩下还没有被预填的变量：
// - team_name
// - manager_name
// - week_range
// - team_goal
// - dev_activities
const partialFormatted = await pipelineWithPartial.format({
    // 本次周报对应的团队。
    team_name: 'AI 平台组',

    // 本次周报的汇报对象。
    manager_name: '刘东',

    // 本次周报的时间范围。
    week_range: '2025-02-10 ~ 2025-02-16',

    // 本次周报的团队目标。
    team_goal: '上线周报 Agent 到内部试用环境，并收集反馈。',

    // 本次周报的开发活动数据。
    dev_activities:
        '- 小明：完成 Git/Jira 集成封装\n' +
        '- 小红：实现 Prompt 配置化加载\n' +
        '- 小强：接入权限系统，支持按部门过滤数据',
});

// 第二次使用同一个 pipelineWithPartial。
//
// 注意：这里没有重新传 company_name、company_values、tone。
// 它们已经在 partial 阶段固定住了。
//
// 这说明 partial 很适合“同一套固定背景 + 多次生成不同内容”的场景。
const partialFormatted2 = await pipelineWithPartial.format({
    // 换一个团队。
    team_name: 'AI 工程效率组',

    // 换一个汇报对象。
    manager_name: '王强',

    // 换一个时间范围。
    week_range: '2025-02-17 ~ 2025-02-23',

    // 换一个团队目标。
    team_goal: '打通 CI/CD 可观测链路，并推动落地到核心服务。',

    // 换一组开发活动数据。
    dev_activities:
        '- 阿俊：完成流水线执行数据的链路追踪接入\n' +
        '- 小白：梳理核心服务发布流程，补齐变更记录\n' +
        '- 小七：研发发布回滚一键脚本 PoC 版本',
});

// 打印第一份格式化结果。
// 可以看到它已经自动带上了 partial 预填的公司、价值观和语气。
console.log(partialFormatted);

// 打印分割线，方便对比两次 format 的结果。
console.log('\n================ 分割线：第二份周报模板 ================\n');

// 打印第二份格式化结果。
// 对比第一份可以发现：
// 固定变量没变，动态变量变了。
console.log(partialFormatted2);


// 输出：

// 你是一名资深工程团队负责人，写作风格：偏正式但不僵硬。
// 你擅长把枯燥的技术细节写得既专业又有温度。
//
// 公司：星航科技
// 部门：AI 平台组
// 直接汇报对象：刘东
// 本周时间范围：2025-02-10 ~ 2025-02-16
// 本周部门核心目标：上线周报 Agent 到内部试用环境，并收集反馈。
//
// 以下是本周团队的开发活动（Git / Jira 汇总）：
// - 小明：完成 Git/Jira 集成封装
// - 小红：实现 Prompt 配置化加载
// - 小强：接入权限系统，支持按部门过滤数据
//
// 请你从这些原始数据中提炼出：
// 1. 本周整体成就亮点
// 2. 潜在风险和技术债
// 3. 下周重点计划建议
//
// 请用 Markdown 输出周报，结构包含：
// 1. 本周概览（2-3 句话的 Summary）
// 2. 详细拆分（按模块或项目分段）
// 3. 关键指标表格，表头为：模块 | 亮点 | 风险 | 下周计划
//
// 注意：
// - 尽量引用一些具体数据（如提交次数、完成的任务编号）
// - 语气专业，但可以偶尔带一点轻松的口吻，符合 「极致、开放、靠谱」的价值观。
//
//
// 现在请生成本周的最终周报：
//
// ================ 分割线：第二份周报模板 ================
//
// 你是一名资深工程团队负责人，写作风格：偏正式但不僵硬。
// 你擅长把枯燥的技术细节写得既专业又有温度。
//
// 公司：星航科技
// 部门：AI 工程效率组
// 直接汇报对象：王强
// 本周时间范围：2025-02-17 ~ 2025-02-23
// 本周部门核心目标：打通 CI/CD 可观测链路，并推动落地到核心服务。
//
// 以下是本周团队的开发活动（Git / Jira 汇总）：
// - 阿俊：完成流水线执行数据的链路追踪接入
// - 小白：梳理核心服务发布流程，补齐变更记录
// - 小七：研发发布回滚一键脚本 PoC 版本
//
// 请你从这些原始数据中提炼出：
// 1. 本周整体成就亮点
// 2. 潜在风险和技术债
// 3. 下周重点计划建议
//
// 请用 Markdown 输出周报，结构包含：
// 1. 本周概览（2-3 句话的 Summary）
// 2. 详细拆分（按模块或项目分段）
// 3. 关键指标表格，表头为：模块 | 亮点 | 风险 | 下周计划
//
// 注意：
// - 尽量引用一些具体数据（如提交次数、完成的任务编号）
// - 语气专业，但可以偶尔带一点轻松的口吻，符合 「极致、开放、靠谱」的价值观。
//
//
// 现在请生成本周的最终周报：
