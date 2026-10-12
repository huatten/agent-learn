import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';
import { TtsRelayService } from './tts-relay.service';
import * as tencentcloud from 'tencentcloud-sdk-nodejs';

const AsrClient = tencentcloud.asr.v20190614.Client;
@Module({
  controllers: [SpeechController],
  providers: [
    SpeechService,
    TtsRelayService,
    {
      provide: 'ASR_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new AsrClient({
          credential: {
            secretId: configService.get<string>('TENCENT_SECRET_ID'),
            secretKey: configService.get<string>('TENCENT_SECRET_KEY'),
          },
          region: configService.get<string>('TENCENT_TTS_REGION'),
          profile: {
            httpProfile: {
              reqMethod: 'POST',
              reqTimeout: 30,
            },
          },
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class SpeechModule {}
