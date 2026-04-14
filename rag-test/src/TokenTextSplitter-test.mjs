import "dotenv/config";
import { Document } from "@langchain/core/documents";
import  { TokenTextSplitter } from "@langchain/textsplitters";
import { getEncodingNameForModel, getEncoding } from "js-tiktoken";

const logDocument = new Document({
    pageContent: `[2024-01-15 10:00:00] INFO: Application started
[2024-01-15 10:00:05] DEBUG: Loading configuration file
[2024-01-15 10:00:10] INFO: Database connection established
[2024-01-15 10:00:15] WARNING: Rate limit approaching
[2024-01-15 10:00:20] ERROR: Failed to process request
[2024-01-15 10:00:25] INFO: Retrying operation
[2024-01-15 10:00:30] SUCCESS: Operation completed`
});

const encodingName = getEncodingNameForModel("gpt-4"); // cl100k_base
const enc = getEncoding(encodingName);

const logTextSplitter = new TokenTextSplitter({
    encodingName: encodingName,
    chunkSize: 50, // 每个块最多 50 个 Token
    chunkOverlap: 10 // 块之间重叠 10 个 Token
});

const splitDocuments = await logTextSplitter.splitDocuments([logDocument]);

console.log(splitDocuments);


splitDocuments.forEach((doc) => {
    console.log(`character length=> ${doc.pageContent.length}`);
    console.log(`token length=> ${enc.encode(doc.pageContent).length}`);
});

/** 输出结果：
 * character length=> 121
 * token length=> 50
 * character length=> 130
 * token length=> 50
 * character length=> 116
 * token length=> 50
 * character length=> 50
 * token length=> 18
 */
