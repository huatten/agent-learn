import { Injectable, Inject, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
} from '@langchain/core/messages';

import { Runnable } from '@langchain/core/runnables';

@Injectable()
export class JobAgentService {
    private readonly logger = new Logger(JobAgentService.name);
    private readonly modelWithTools: Runnable<BaseMessage[], AIMessage>;
    private readonly toolMap: Record<string, Runnable<Record<string, any>, string>>;

    constructor(
        @Inject('CHAT_MODEL') private model: ChatOpenAI,
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
            this.sendEmailTool,
            this.webSearchTool,
            this.dbUserCrudTool,
            this.cronJobTool,
            this.timeNowTool,
        ]);
        // 创建工具映射
        this.toolMap = {
            send_email: this.sendEmailTool,
            web_search: this.webSearchTool,
            db_user_crud: this.dbUserCrudTool,
            cron_job: this.cronJobTool,
            time_now: this.timeNowTool,
        };
    }

    async runJob(query: string): Promise<string | undefined> {
        const messages: BaseMessage[] = [
            new SystemMessage(
                '你是一个用于执行后台任务的智能代理。你会根据给定的任务指令，必要时调用工具（如 db_users_crud、send_mail、web_search、time_now 等）来查询或改写数据，然后给出清晰的步骤和结果说明。',
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
}
