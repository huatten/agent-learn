import "dotenv/config";
import { Document } from "@langchain/core/documents";
import  { LatexTextSplitter } from "@langchain/textsplitters";
import { getEncodingNameForModel, getEncoding } from "js-tiktoken";

const latexText = `\int x^{\mu}\mathrm{d}x=\frac{x^{\mu +1}}{\mu +1}+C, \left({\mu \neq -1}\right) \int \frac{1}{\sqrt{1-x^{2}}}\mathrm{d}x= \arcsin x +C \int \frac{1}{\sqrt{1-x^{2}}}\mathrm{d}x= \arcsin x +C \begin{pmatrix}  
  a_{11} & a_{12} & a_{13} \\  
  a_{21} & a_{22} & a_{23} \\  
  a_{31} & a_{32} & a_{33}  
\end{pmatrix} `;

const latexDocument = new Document({
    pageContent: latexText
});

const encodingName = getEncodingNameForModel("gpt-4"); // cl100k_base
const enc = getEncoding(encodingName);

const latexTextSplitter = new LatexTextSplitter({
    chunkSize: 200, // 每个块最多 200 个 Token
    chunkOverlap: 40 // 块之间重叠 40 个 Token
});

const splitDocuments = await latexTextSplitter.splitDocuments([latexDocument]);

console.log(splitDocuments);


splitDocuments.forEach((doc) => {
    console.log(`character length=> ${doc.pageContent.length}`);
    console.log(`token length=> ${enc.encode(doc.pageContent).length}`);
});

/** 输出结果：
 * character length=> 184
 * token length=> 95
 * character length=> 101
 * token length=> 54
 */
