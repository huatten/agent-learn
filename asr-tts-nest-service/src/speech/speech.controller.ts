import {
  Controller,
  BadRequestException,
  UploadedFile,
  Post,
  Get,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { SpeechService } from './speech.service';
import { TtsRelayService } from './tts-relay.service';

@Controller('speech')
export class SpeechController {
  constructor(
    private readonly speechService: SpeechService,
    private readonly ttsRelay: TtsRelayService,
  ) {}

  /** 返回 TTS 默认配置（音色/语速等），供前端预填 */
  @Get('tts/config')
  getTtsConfig() {
    return this.ttsRelay.getConfig();
  }

  private resolveVoiceFormat(file: {
    originalname: string;
    mimetype: string;
  }): string {
    const mt = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    if (mt.includes('wav') || name.endsWith('.wav')) return 'wav';
    if (mt.includes('mpeg') || mt.includes('mp3') || name.endsWith('.mp3'))
      return 'mp3';
    if (mt.includes('ogg') || name.endsWith('.ogg')) return 'ogg-opus';
    if (
      mt.includes('mp4') ||
      mt.includes('aac') ||
      mt.includes('m4a') ||
      name.endsWith('.m4a')
    )
      return 'aac';
    return 'ogg-opus';
  }

  @Post('asr')
  @UseInterceptors(FileInterceptor('audio'))
  async recognize(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        '请通过 FormData 的 audio 字段上传音频文件',
      );
    }
    const voiceFormat = this.resolveVoiceFormat(file);
    const text = await this.speechService.recognizeBySentence(
      file,
      voiceFormat,
    );
    return { text };
  }
}
