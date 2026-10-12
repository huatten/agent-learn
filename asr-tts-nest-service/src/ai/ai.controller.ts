import { Controller, Query, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, from, map, tap, finalize } from 'rxjs';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Sse('chat/stream')
  chatStream(
    @Query('query') query: string,
    @Query('sessionId') sessionId?: string,
    @Query('tts') tts?: string,
  ): Observable<{ data: string }> {
    const useTts = tts === '1' && !!sessionId;
    return from(this.aiService.streamChain(query)).pipe(
      tap((chunk) => {
        if (useTts && sessionId)
          this.eventEmitter.emit('tts.text', { sessionId, text: chunk });
      }),
      map((chunk) => ({ data: chunk })),
      finalize(() => {
        if (useTts && sessionId)
          this.eventEmitter.emit('tts.complete', { sessionId });
      }),
    );
  }
}
