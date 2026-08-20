import { Inject, Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
// import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  private readonly chain: RunnableSequence<{ question: string }, string>;

  constructor(
    //@Inject(ConfigService) configService: ConfigService
    @Inject('CHAT_MODEL') model: ChatOpenAI,
  ) {
    const prompt = PromptTemplate.fromTemplate(
      '请回答以下问题：\n\n{question}',
    );

    // const model = new ChatOpenAI({
    //   modelName: configService.get<string>('MODEL_NAME'),
    //   apiKey: configService.get<string>('OPENAI_API_KEY'),
    //   temperature: 0.7,
    //   configuration: {
    //     baseURL: configService.get<string>('OPENAI_BASE_URL'),
    //   },
    // });

    this.chain = RunnableSequence.from([
      prompt,
      model,
      new StringOutputParser(),
    ]);
  }

  async runChain(question: string): Promise<string> {
    return await this.chain.invoke({ question });
  }

  // 实现流式输出
  async *streamChain(question: string): AsyncGenerator<string> {
    const stream = await this.chain.stream({ question });
    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
