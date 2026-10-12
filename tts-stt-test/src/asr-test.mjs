import "dotenv/config";
import tencentcloud from "tencentcloud-sdk-nodejs";
import fs from "node:fs";

const AsrClient = tencentcloud.asr.v20190614.Client;
const AUDIO_FILE = "./output3.mp3";

const client = new AsrClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  },
  region: process.env.TENCENT_TTS_REGION,
  profile: {
    httpProfile: {
      reqMethod: "POST",
      reqTimeout: 30,
    },
  },
});

async function run() {
  const audioBase64 = fs.readFileSync(AUDIO_FILE).toString("base64");

  const params = {
    EngSerViceType: "16k_zh",
    SourceType: 1,
    Data: audioBase64,
    DataLen: Buffer.byteLength(audioBase64),
    VoiceFormat: "mp3",
  };

  try {
    const data = await client.SentenceRecognition(params);
    console.log("识别结果：", data.Result);
  } catch (err) {
    console.error("识别失败：", err);
  }
}

run();