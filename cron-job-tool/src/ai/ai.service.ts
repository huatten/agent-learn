import { Injectable, Inject } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import {
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
} from '@langchain/core/messages';

import { Runnable } from '@langchain/core/runnables';

// 下面是最初版本的内联工具定义，只是保留做参考，不再实际使用。

// type User = {
//   id: string;
//   name: string;
//   email: string;
//   role: 'admin' | 'user';
// };

// const database: { users: Record<string, User> } = {
//   users: {
//     '001': {
//       id: '001',
//       name: 'tengjinhua',
//       email: 'tengjinhua@example.com',
//       role: 'admin',
//     },
//     '002': {
//       id: '002',
//       name: 'tengjianhua',
//       email: 'tengjianhua@example.com',
//       role: 'user',
//     },
//     '003': {
//       id: '003',
//       name: 'tengguohua',
//       email: 'tengguohua@example.com',
//       role: 'user',
//     },
//     '004': {
//       id: '004',
//       name: 'tengyihua',
//       email: 'tengyihua@example.com',
//       role: 'user',
//     },
//   },
// };

// const queryUserArgsSchema = z.object({
//   id: z.string().describe('用户id，例如：001、002、003、004'),
// });

// type QueryUserArgs = {
//   id: string;
// };

// const queryUserTool = tool(
//   ({ id }: QueryUserArgs) => {
//     const user = database.users[id];
//     if (!user) {
//       return `用户${id}不存在`;
//     }
//     return `用户${id}的信息如下：${JSON.stringify(user)}`;
//   },
//   {
//     name: 'query_user',
//     description: '查询数据库中的用户信息，根据用户id查询，返回用户的详细信息',
//     schema: queryUserArgsSchema,
//   },
// );

// 流式返回的控制事件：
// - reset：本轮是工具调用轮，之前实时下发的文本只是铺垫语，前端应清空重置
// - tool：即将执行某个工具，前端可展示“正在调用 xxx”的进度提示
// 普通 token 仍以纯字符串下发（SSE 默认 message 事件），与 onmessage 前端兼容
export type AgentStreamControlEvent = {
    type: 'reset' | 'tool';
    data: string;
};

@Injectable()
export class AiService {
    private readonly modelWithTools: Runnable<BaseMessage[], AIMessage>;
    private readonly toolMap: Record<string, Runnable<Record<string, any>, string>>;

    constructor(
        @Inject('CHAT_MODEL') private model: ChatOpenAI,
        @Inject('QUERY_USER_TOOL')
        private queryUserTool: Runnable<Record<string, any>, string>,
        @Inject('SEND_EMAIL_TOOL')
        private sendEmailTool: Runnable<Record<string, any>, string>,
        @Inject('WEB_SEARCH_TOOL')
        private webSearchTool: Runnable<Record<string, any>, string>,
        @Inject('DB_USERS_CRUD_TOOL')
        private dbUserCrudTool: Runnable<Record<string, any>, string>,
        @Inject('CRON_JOB_TOOL')
        private cronJobTool: Runnable<Record<string, any>, string>,
        @Inject('TIME_NOW_TOOL')
        private timeNowTool: Runnable<Record<string, any>, string>,
    ) {
        this.modelWithTools = model.bindTools([
            this.queryUserTool,
            this.sendEmailTool,
            this.webSearchTool,
            this.dbUserCrudTool,
            this.cronJobTool,
            this.timeNowTool,
        ]);
        this.toolMap = {
            query_user: this.queryUserTool,
            send_email: this.sendEmailTool,
            web_search: this.webSearchTool,
            db_user_crud: this.dbUserCrudTool,
            cron_job: this.cronJobTool,
            time_now: this.timeNowTool,
        };
    }

    private currentTimeText(): string {
        const now = new Date();
        const local = now.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour12: false,
        });
        // 以东八区（北京时间）偏移格式化 ISO，避免模型误用 UTC 造成 8 小时偏差
        const beijingIso = new Date(
            now.getTime() + 8 * 60 * 60 * 1000,
        )
            .toISOString()
            .replace('Z', '+08:00');
        return `当前为北京时间 ${local}，对应ISO（北京时间）为 ${beijingIso}。计算“X分钟/小时后”等相对时间或提供at参数时，必须以当前北京时间为基准推算出正确时间，at 请填写带 +08:00 偏移的北京时间ISO字符串，禁止编造日期。`;
    }

    async runChain(query: string): Promise<string | undefined> {
        const messages: BaseMessage[] = [
            new SystemMessage(
                `【时间信息】${this.currentTimeText()}
你是一个通用任务助手，可以在需要时调用工具（如 \`query_user\`、\`db_users_crud\`、\`send_mail\`、\`web_search\`、\`time_now\`、\`cron_job\` 等）来查询或改写数据/配置，规划并执行各种任务（包括提醒、定期任务和一系列后台操作），再用结果回答用户的问题。

定时任务类型选择规则（非常重要）：
- “X分钟/小时/天后”“在某个时间点”“到点提醒”（一次性）=> \`cron_job.type=at\`（执行一次后自动停用）
- “每X分钟/每小时/每天”“定期/循环/一直”（重复执行）=> \`cron_job.type=every\`（每次执行），\`everyMs\`=毫秒
- 给出 Cron 表达式 => \`cron_job.type=cron\``
            ),
            new HumanMessage(query),
        ];
        // 进行while循环，直到模型返回的message是AIMessage类型
        while (true) {
            const aiMessage = await this.modelWithTools.invoke(messages);
            messages.push(aiMessage);

            const toolCalls = aiMessage.tool_calls ?? [];
            // 如果本轮没有调用工具，直接返回模型返回的内容
            if (!toolCalls.length) {
                return aiMessage.content as string;
            }
            // 依次执行本轮要调用的工具
            for (const toolCall of toolCalls) {
                const toolCallId = toolCall.id ?? '';
                const toolName = toolCall.name ?? '';
                const targetTool = this.toolMap[toolName];
                if (!targetTool) {
                    throw new Error(`未知工具: ${toolName}`);
                }
                const result = await targetTool.invoke(toolCall.args);
                // 工具返回值必须是字符串，否则发给模型时会报 content.flatMap 错误
                const resultContent =
                    typeof result === 'string'
                        ? result
                        : JSON.stringify(result);
                messages.push(
                    new ToolMessage({
                        tool_call_id: toolCallId,
                        name: toolName,
                        content: resultContent,
                    }),
                );
            }
        }
    }

    async *runChainStream(
        query: string,
    ): AsyncIterable<string | AgentStreamControlEvent> {
        const messages: BaseMessage[] = [
            new SystemMessage(
                `【时间信息】${this.currentTimeText()}
你是一个通用任务助手，可以在需要时调用工具（如 \`query_user\`、\`db_users_crud\`、\`send_mail\`、\`web_search\`、\`time_now\`、\`cron_job\` 等）来查询或改写数据/配置，规划并执行各种任务（包括提醒、定期任务和一系列后台操作），再用结果回答用户的问题。

定时任务类型选择规则（非常重要）：
- “X分钟/小时/天后”“在某个时间点”“到点提醒”（一次性）=> \`cron_job.type=at\`（执行一次后自动停用）
- “每X分钟/每小时/每天”“定期/循环/一直”（重复执行）=> \`cron_job.type=every\`（每次执行），\`everyMs\`=毫秒
- 给出 Cron 表达式 => \`cron_job.type=cron\``
            ),
            new HumanMessage(query),
        ];
        while (true) {
            // 一轮对话：先让模型思考，可能提出工具调用
            const stream = await this.modelWithTools.stream(messages);
            let fullAIMessage: AIMessageChunk | null = null;

            for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
                fullAIMessage = fullAIMessage
                    ? fullAIMessage.concat(chunk)
                    : chunk;
                // 文本 token 实时下发，实现真正的流式输出。
                // 注意：若本轮末尾发现是工具调用轮，会再下发 reset 事件让前端清空铺垫语
                if (typeof chunk.content === 'string' && chunk.content) {
                    yield chunk.content;
                }
            }

            if (!fullAIMessage) {
                return;
            }

            messages.push(fullAIMessage);

            // 本轮模型是否发起了工具调用
            const toolCalls = fullAIMessage?.tool_calls ?? [];
            if (!toolCalls.length) {
                // 没有工具调用：最终回答已经实时输出完毕，直接结束
                return;
            }

            // 工具调用轮：之前实时下发的只是铺垫语，通知前端清空后执行工具
            yield { type: 'reset', data: '' };

            // 依次执行本轮要调用的工具
            for (const toolCall of toolCalls) {
                const toolCallId = toolCall.id ?? '';
                const toolName = toolCall.name ?? '';
                const targetTool = this.toolMap[toolName];
                if (!targetTool) {
                    throw new Error(`未知工具: ${toolName}`);
                }
                // 先下发 tool 事件，前端可展示"正在调用 xxx"的进度提示
                yield { type: 'tool', data: toolName };
                const result = await targetTool.invoke(toolCall.args);
                // 工具返回值必须是字符串，否则发给模型时会报 content.flatMap 错误
                const resultContent =
                    typeof result === 'string'
                        ? result
                        : JSON.stringify(result);
                messages.push(
                    new ToolMessage({
                        tool_call_id: toolCallId,
                        name: toolName,
                        content: resultContent,
                    }),
                );
            }
        }
    }
}
