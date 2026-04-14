import "dotenv/config";
import { Document } from "@langchain/core/documents";
import  { MarkdownTextSplitter } from "@langchain/textsplitters";
import { getEncodingNameForModel, getEncoding } from "js-tiktoken";

const readmeText = `# Project Name

> A brief description of your project

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- ✨ Feature 1
- 🚀 Feature 2
- 💡 Feature 3

## Installation

\`\`\`bash
npm install project-name
\`\`\`

## Usage

### Basic Usage

\`\`\`javascript
import { Project } from 'project-name';

const project = new Project();
project.init();
\`\`\`

### Advanced Usage

\`\`\`javascript
const project = new Project({
  config: {
    apiKey: 'your-api-key',
    timeout: 5000,
  }
});

await project.run();
\`\`\`

## API Reference

### \`Project\`

Main class for the project.

#### Methods

- \`init()\`: Initialize the project
- \`run()\`: Run the project
- \`stop()\`: Stop the project

## Contributing

Contributions are welcome! Please read our [contributing guide](CONTRIBUTING.md).

## License

MIT License`;

const readmeDocument = new Document({
    pageContent: readmeText
});

const encodingName = getEncodingNameForModel("gpt-4"); // cl100k_base
const enc = getEncoding(encodingName);

const markdownTextSplitter = new MarkdownTextSplitter({
    chunkSize: 400, // 每个块最多 400 个 Token
    chunkOverlap: 80 // 块之间重叠 80 个 Token
});

const splitDocuments = await markdownTextSplitter.splitDocuments([readmeDocument]);

console.log(splitDocuments);


splitDocuments.forEach((doc) => {
    console.log(`character length=> ${doc.pageContent.length}`);
    console.log(`token length=> ${enc.encode(doc.pageContent).length}`);
});

/** 输出结果： 可以看到，都是从标题处断开的，也就是根据语法分割的。
 * character length=> 240
 * token length=> 70
 * character length=> 345
 * token length=> 83
 * character length=> 291
 * token length=> 72
 */
