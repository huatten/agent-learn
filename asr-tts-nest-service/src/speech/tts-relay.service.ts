import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import crypto from 'node:crypto';

/** 腾讯流式 TTS 合成参数 */
type TtsConfig = {
  appId: number;
  secretId: string;
  secretKey: string;
  voiceType: number;
  codec: string;
  sampleRate: number;
  volume: number;
  speed: number;
};

/** 腾讯 TTS 下行 JSON 状态消息 */
type TencentTtsMessage = {
  ready?: number;
  code?: number;
  message?: string;
  final?: number;
};

/** 前端上行控制消息 */
type ClientControlMessage = {
  action?: string;
};

/** 单个会话：前端 socket 与腾讯 TTS socket 的绑定 */
type TtsSession = {
  client: WebSocket;
  tencent: WebSocket | null;
  tencentSessionId: string;
  cfg: TtsConfig;
  ready: boolean;
  queue: string[];
  messageId: number;
  completed: boolean;
  closed: boolean;
};

/** 对外暴露的 TTS 默认配置（不含密钥） */
export type TtsPublicConfig = {
  voiceType: number;
  speed: number;
  volume: number;
  sampleRate: number;
  codec: string;
};

@Injectable()
export class TtsRelayService {
  private readonly logger = new Logger(TtsRelayService.name);
  private readonly sessions = new Map<string, TtsSession>();
  private wss: WebSocketServer | null = null;

  private readonly cfg: TtsConfig;

  constructor(private readonly configService: ConfigService) {
    this.cfg = {
      appId: Number(this.configService.get<string>('TENCENT_ACCOUNT_ID')),
      secretId: this.configService.get<string>('TENCENT_SECRET_ID') ?? '',
      secretKey: this.configService.get<string>('TENCENT_SECRET_KEY') ?? '',
      voiceType: Number(
        this.configService.get<string>('TENCENT_TTS_VOICE_TYPE') ?? 101001,
      ),
      codec: this.configService.get<string>('TENCENT_TTS_CODEC') ?? 'mp3',
      sampleRate: Number(
        this.configService.get<string>('TENCENT_TTS_SAMPLE_RATE') ?? 16000,
      ),
      volume: Number(this.configService.get<string>('TENCENT_TTS_VOLUME') ?? 5),
      speed: Number(this.configService.get<string>('TENCENT_TTS_SPEED') ?? 0),
    };
  }

  /** 返回可公开的默认配置，供前端预填可选项 */
  getConfig(): TtsPublicConfig {
    const { voiceType, speed, volume, sampleRate, codec } = this.cfg;
    return { voiceType, speed, volume, sampleRate, codec };
  }

  private numOr(value: string | null, fallback: number): number {
    if (value === null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /** 在 HTTP server 上挂载前端 WebSocket 端点 */
  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/speech/tts/ws' });
    this.wss.on('connection', (client, req) =>
      this.onClientConnection(client, req),
    );
    this.logger.log('TTS WS 已挂载于 /speech/tts/ws');
  }

  private onClientConnection(client: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? '', 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      client.close(1008, 'missing sessionId');
      return;
    }

    const session: TtsSession = {
      client,
      tencent: null,
      tencentSessionId: '',
      cfg: {
        ...this.cfg,
        voiceType: this.numOr(
          url.searchParams.get('voiceType'),
          this.cfg.voiceType,
        ),
        speed: this.numOr(url.searchParams.get('speed'), this.cfg.speed),
        volume: this.numOr(url.searchParams.get('volume'), this.cfg.volume),
      },
      ready: false,
      queue: [],
      messageId: 0,
      completed: false,
      closed: false,
    };
    this.sessions.set(sessionId, session);
    this.logger.log(`[session ${sessionId}] 前端已连接`);

    this.connectTencent(sessionId, session);

    client.on('message', (raw) => {
      try {
        const msg = JSON.parse(
          this.toBuffer(raw).toString('utf8'),
        ) as ClientControlMessage;
        if (msg.action === 'close') {
          this.closeSession(sessionId);
        }
      } catch {
        /* 忽略非法控制消息 */
      }
    });

    client.on('close', () => this.closeSession(sessionId));
    client.on('error', (err) => {
      this.logger.warn(`[session ${sessionId}] 前端 WS 错误: ${err.message}`);
      this.closeSession(sessionId);
    });
  }

  /** SSE 侧调用：把一段增量文本推给腾讯 TTS */
  pushText(sessionId: string, text: string): void {
    if (!sessionId || !text) return;
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return;

    if (session.ready && session.tencent) {
      this.sendSynthesis(session, text);
    } else {
      session.queue.push(text);
    }
  }

  /** SSE 侧调用：文本已全部推完 */
  finish(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed || session.completed) return;
    session.completed = true;

    if (session.ready && session.tencent) {
      this.sendComplete(session);
    }
    // 若尚未 ready，则在 flushQueue 后补发（见 connectTencent 的 ready 分支）
  }

  /** 事件驱动入口：接收 SSE 侧推送的文本增量 */
  @OnEvent('tts.text')
  handleTtsText(payload: { sessionId: string; text: string }): void {
    this.pushText(payload.sessionId, payload.text);
  }

  /** 事件驱动入口：文本已全部推完 */
  @OnEvent('tts.complete')
  handleTtsComplete(payload: { sessionId: string }): void {
    this.finish(payload.sessionId);
  }

  // ---------- 腾讯 TTS 连接 ----------

  private connectTencent(sessionId: string, session: TtsSession): void {
    const { url, sessionId: tencentSessionId } = this.buildWsUrl(session.cfg);
    session.tencentSessionId = tencentSessionId;
    const tencent = new WebSocket(url);
    session.tencent = tencent;

    tencent.on('message', (data: RawData, isBinary) => {
      if (isBinary) {
        this.sendBinaryToClient(session, data);
        return;
      }
      try {
        const msg = JSON.parse(
          this.toBuffer(data).toString('utf8'),
        ) as TencentTtsMessage;
        if (msg.ready === 1 && !session.ready) {
          session.ready = true;
          this.logger.log(`[session ${sessionId}] 腾讯 TTS 就绪`);
          this.sendJsonToClient(session, { type: 'tts_ready' });
          this.flushQueue(session);
          if (session.completed) this.sendComplete(session);
        }
        if (msg.code && msg.code !== 0) {
          this.logger.error(
            `[session ${sessionId}] 腾讯 TTS 错误 code=${msg.code} ${msg.message}`,
          );
          this.sendJsonToClient(session, {
            type: 'tts_error',
            message: `code=${msg.code}: ${msg.message ?? ''}`,
          });
          this.closeSession(sessionId);
        } else if (msg.final === 1) {
          this.logger.log(`[session ${sessionId}] 腾讯 TTS 合成结束`);
          this.sendJsonToClient(session, { type: 'tts_final' });
          this.closeSession(sessionId);
        }
      } catch (e) {
        this.logger.warn(`[session ${sessionId}] 解析腾讯消息失败: ${e}`);
      }
    });

    tencent.on('error', (err) => {
      this.logger.error(
        `[session ${sessionId}] 腾讯 TTS WS 错误: ${err.message}`,
      );
      this.sendJsonToClient(session, {
        type: 'tts_error',
        message: err.message,
      });
      this.closeSession(sessionId);
    });

    tencent.on('close', () => {
      session.tencent = null;
    });
  }

  private flushQueue(session: TtsSession): void {
    while (session.queue.length) {
      const text = session.queue.shift() as string;
      this.sendSynthesis(session, text);
    }
  }

  private sendSynthesis(session: TtsSession, text: string): void {
    session.messageId += 1;
    session.tencent?.send(
      JSON.stringify({
        session_id: session.tencentSessionId,
        message_id: `msg_${session.messageId}`,
        action: 'ACTION_SYNTHESIS',
        data: text,
      }),
    );
  }

  private sendComplete(session: TtsSession): void {
    session.tencent?.send(
      JSON.stringify({
        session_id: session.tencentSessionId,
        action: 'ACTION_COMPLETE',
      }),
    );
  }

  private buildWsUrl(cfg: TtsConfig): { url: string; sessionId: string } {
    const now = Math.floor(Date.now() / 1000);
    const sessionId = `session_${now}_${Math.random().toString(36).slice(2)}`;

    const params: Record<string, string | number> = {
      Action: 'TextToStreamAudioWSv2',
      AppId: cfg.appId,
      Codec: cfg.codec,
      Expired: now + 3600,
      SampleRate: cfg.sampleRate,
      SecretId: cfg.secretId,
      SessionId: sessionId,
      Speed: cfg.speed,
      Timestamp: now,
      VoiceType: cfg.voiceType,
      Volume: cfg.volume,
    };

    const signStr = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const rawStr = `GETtts.cloud.tencent.com/stream_wsv2?${signStr}`;
    const signature = crypto
      .createHmac('sha1', cfg.secretKey)
      .update(rawStr)
      .digest('base64');

    const searchParams = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
      Signature: signature,
    });

    return {
      sessionId,
      url: `wss://tts.cloud.tencent.com/stream_wsv2?${searchParams.toString()}`,
    };
  }

  // ---------- 前端下行工具 ----------

  private toBuffer(data: RawData): Buffer {
    return Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data);
  }

  private sendBinaryToClient(session: TtsSession, data: RawData): void {
    if (session.client.readyState !== WebSocket.OPEN) return;
    session.client.send(this.toBuffer(data), { binary: true });
  }

  private sendJsonToClient(session: TtsSession, obj: unknown): void {
    if (session.client.readyState !== WebSocket.OPEN) return;
    session.client.send(JSON.stringify(obj));
  }

  private closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return;
    session.closed = true;
    this.sessions.delete(sessionId);

    if (session.tencent && session.tencent.readyState < WebSocket.CLOSING) {
      session.tencent.close();
    }
    session.tencent = null;

    if (session.client.readyState < WebSocket.CLOSING) {
      session.client.close();
    }
    this.logger.log(`[session ${sessionId}] 已清理`);
  }
}
