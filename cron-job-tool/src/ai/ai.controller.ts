import { Controller, Get, Query, Sse } from '@nestjs/common';
import { AiService } from './ai.service';
import { Observable, from, map } from 'rxjs';

@Controller('ai')
export class AiController {
    constructor(private readonly aiService: AiService) {}

    @Get('chat')
    async run(@Query('query') query: string) {
        const answer = await this.aiService.runChain(query);
        return {
            answer,
        };
    }

    //加一个流式SSE接口
    // 文本 token 直接作为默认 message 事件下发；
    // reset/tool 控制事件带 event: 类型下发，前端可 addEventListener 订阅（onmessage 不会收到）
    @Sse('chat/stream')
    chatStream(@Query('query') query: string): Observable<MessageEvent> {
        const stream = this.aiService.runChainStream(query);
        return from(stream).pipe(
            map((chunk) =>
                typeof chunk === 'string'
                    ? ({ data: chunk } as MessageEvent)
                    : ({
                          type: chunk.type,
                          data: chunk.data,
                      } as MessageEvent),
            ),
        );
    }
}
