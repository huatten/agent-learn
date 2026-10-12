import { NestFactory } from '@nestjs/core';
import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { AppModule } from './app.module';
import { TtsRelayService } from './speech/tts-relay.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.init();

  // 复用 Nest 的 express 实例，自建 http.Server 以便挂载 WebSocket upgrade
  const expressApp = app.getHttpAdapter().getInstance() as RequestListener;
  const server = createServer(expressApp);

  const relay = app.get(TtsRelayService);
  relay.attach(server);

  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    console.log(`Nest app listening on http://localhost:${port}`);
  });
}
void bootstrap();
