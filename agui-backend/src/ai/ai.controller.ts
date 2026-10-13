import {
  Controller,
  BadRequestException,
  Body,
  Logger,
  Post,
  Res,
} from '@nestjs/common';

import type { Response } from 'express';
import { AiService } from './ai.service';
import { pipeUIMessageStreamToResponse, UIMessage } from 'ai';

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async postChat(
    @Body() body: { messages: UIMessage[] },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!body.messages || !Array.isArray(body.messages)) {
      throw new BadRequestException('Invalid messages');
    }
    try {
      const stream = await this.aiService.stream(body.messages);
      await pipeUIMessageStreamToResponse({
        response: res,
        stream,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Chat stream failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (res.headersSent) {
        // 阶段 2：SSE 头已发出，状态码不可改，只能按流协议追加 error/finish chunk
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              text: '对话流在处理过程中中断，请重试。',
            })}\n\n`,
          );
          res.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`);
          res.end();
        }
      } else {
        // 阶段 1：SSE 头尚未发出，可以正常返回 JSON 错误响应
        res.status(500).json({
          statusCode: 500,
          message: 'Failed to start chat stream',
          error: message,
        });
      }
    }
  }
}
