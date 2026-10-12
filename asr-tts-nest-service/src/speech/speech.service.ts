import { Injectable, Inject } from '@nestjs/common';
import type * as tencentcloud from 'tencentcloud-sdk-nodejs';

type UploadAudio = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type AsrClient = InstanceType<typeof tencentcloud.asr.v20190614.Client>;

@Injectable()
export class SpeechService {
  constructor(
    @Inject('ASR_CLIENT')
    private readonly asrClient: AsrClient,
  ) {}

  async recognizeBySentence(
    file: UploadAudio,
    voiceFormat = 'ogg-opus',
  ): Promise<string> {
    try {
      const audioBase64 = file.buffer.toString('base64');

      const params = {
        EngSerViceType: '16k_zh',
        SourceType: 1,
        Data: audioBase64,
        DataLen: file.buffer.length,
        VoiceFormat: voiceFormat,
      };
      const data = await this.asrClient.SentenceRecognition(params);
      console.log('识别结果：', data.Result);
      return data.Result ?? '';
    } catch (err) {
      console.error('识别失败：', err);
      throw err;
    }
  }
}
