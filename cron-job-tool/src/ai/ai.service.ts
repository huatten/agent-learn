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

@Injectable()
export class AiService {
  private readonly modelWithTools: Runnable<BaseMessage[], AIMessage>;

  constructor(
    @Inject('CHAT_MODEL') private model: ChatOpenAI,
    @Inject('QUERY_USER_TOOL')
    private queryUserTool: Runnable<Record<string, any>, string>,
    @Inject('SEND_EMAIL_TOOL')
    private sendEmailTool: Runnable<Record<string, any>, string>,
    @Inject('WEB_SEARCH_TOOL')
    private webSearchTool: Runnable<Record<string, any>, string>,
    @Inject('DB_USER_CRUD_TOOL')
    private dbUserCrudTool: Runnable<Record<string, any>, string>,
  ) {
    this.modelWithTools = model.bindTools([
      this.queryUserTool,
      this.sendEmailTool,
      this.webSearchTool,
      this.dbUserCrudTool,
    ]);
  }

  async runChain(query: string): Promise<string | undefined> {
    const messages: BaseMessage[] = [
      new SystemMessage(
        '你是一个智能助手，可以调用以下工具完成任务：' +
        '1. query_user：按用户ID查询用户信息；' +
        '2. web_search：联网搜索最新信息；' +
        '3. send_email：发送邮件。' +
        '规则：需要调用工具时，直接发起工具调用，不要输出任何解释文字；' +
        '拿到工具执行结果后，再基于结果输出最终回答。',
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
        if (toolName === 'query_user') {
          const result = await this.queryUserTool.invoke(toolCall.args);

          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else if (toolName === 'send_email') {
          const result = await this.sendEmailTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else if (toolName === 'web_search') {
          const result = await this.webSearchTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else if (toolName === 'db_user_crud') {
          const result = await this.dbUserCrudTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else {
          throw new Error(`未知工具: ${toolName}`);
        }
      }
    }
  }

  async *runChainStream(query: string): AsyncIterable<string | undefined> {
    const messages: BaseMessage[] = [
      new SystemMessage(
        '你是一个智能助手，可以调用以下工具完成任务：' +
        '1. query_user：按用户ID查询用户信息；' +
        '2. web_search：联网搜索最新信息；' +
        '3. send_email：发送邮件。' +
        '规则：需要调用工具时，直接发起工具调用，不要输出任何解释文字；' +
        '拿到工具执行结果后，再基于结果输出最终回答。',
      ),
      new HumanMessage(query),
    ];
    while (true) {
      // 一轮对话：先让模型思考，可能提出工具调用
      const stream = await this.modelWithTools.stream(messages);
      let fullAIMessage: AIMessageChunk | null = null;
      // 本轮内容先缓存，不实时推送：
      // 需等本轮结束确认是否有工具调用，若有则丢弃（那是过程铺垫语），
      // 只有最终回答轮（无工具调用）才把内容输出，避免前端出现"两轮回答"。
      let content = '';

      for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
        fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;
        if (chunk.content) {
          content += chunk.content as string;
        }
      }

      if (!fullAIMessage) {
        return;
      }

      messages.push(fullAIMessage);

      // 本轮模型是否发起了工具调用
      const toolCalls = fullAIMessage?.tool_calls ?? [];
      if (!toolCalls.length) {
        // 没有工具调用：说明这一轮就是最终回答，输出缓存内容并结束
        yield content;
        return;
      }

      // 工具调用轮：内容已丢弃，执行工具后进入下一轮让模型总结
      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id ?? '';
        const toolName = toolCall.name ?? '';
        if (toolName === 'query_user') {
          const result = await this.queryUserTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else if (toolName === 'send_email') {
          const result = await this.sendEmailTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else if (toolName === 'web_search') {
          const result = await this.webSearchTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else if (toolName === 'db_user_crud') {
          const result = await this.dbUserCrudTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else {
          throw new Error(`未知工具: ${toolName}`);
        }
      }
    }
  }
}
