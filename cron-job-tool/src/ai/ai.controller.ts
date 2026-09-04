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
    @Sse('chat/stream')
    chatStream(@Query('query') query: string): Observable<MessageEvent> {
        const stream = this.aiService.runChainStream(query);
        return from(stream).pipe(
            map((chunk) => ({ data: chunk }) as MessageEvent),
        );
    }
}
