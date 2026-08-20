import { Controller, Get, Query, Sse } from '@nestjs/common';
import { AiService } from './ai.service';
import { concatWith, from, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('chat')
  async chat(@Query('query') query: string) {
    const answer = await this.aiService.runChain(query);
    console.log(answer);
    return { answer };
  }

  // SSE 流式问答接口：GET /ai/chat/stream?query=问题
  // 响应为 text/event-stream，客户端可用 EventSource 接收逐字输出的内容
  @Sse('chat/stream')
  chatStream(
    @Query('query') query: string,
  ): Observable<{ data: string; type?: string }> {
    return from(this.aiService.streamChain(query)).pipe(
      // 每个 chunk 作为一条 SSE data 消息推送
      map((chunk) => ({ data: chunk })),
      // 流结束后发送一个 type 为 done 的事件，通知客户端关闭连接，避免 EventSource 自动重连重复提问
      concatWith(of({ data: '', type: 'done' })),
    );
  }
}
