/**
 * @fileoverview Agent 工具集合 - 这里定义了 AI 可以调用的所有工具
 *
 * 每个工具都是用 LangChain 的 `tool()` 函数创建的，包含：
 * 1. 执行函数：实际做事情的代码（读文件、写文件等）
 * 2. 描述信息：告诉 AI 这个工具做什么，什么时候用
 * 3. 参数 schema：用 zod 定义参数的类型和说明，帮助 AI 正确调用
 *
 * 💡 提示：描述写得越清楚，AI 越容易正确使用工具！
 */

// 从 LangChain 导入 tool 函数，用来创建工具
import { tool } from '@langchain/core/tools';
// Node.js 内置文件系统模块（promise 版本，支持 async/await）
import fs from 'node:fs/promises';
// Node.js 路径处理模块，处理文件路径
import path from 'node:path';
// Node.js 子进程模块，用来执行外部命令
import { spawn } from 'node:child_process';
// zod：用来定义参数验证模式，LangChain 需要它来验证输入
import { z } from 'zod';

// ==========================================
// 工具 1：读取文件
// ==========================================
/**
 * AI 需要看文件内容时调用这个工具
 */
const readFileTool = tool(
    // 工具的实际执行函数，参数由 AI 传入
    // 参数结构由下面的 schema 定义
    async ({ filePath }) => {
        try {
            // 读取文件，用 UTF-8 编码（文本文件）
            const content = await fs.readFile(filePath, 'utf-8');
            // 打印日志，让我们在控制台看到工具确实被调用了
            console.log(` [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`);
            // 返回文件内容给 AI，AI 会基于这个内容继续工作
            return `文件内容:\n${content}`;
        } catch (error) {
            // 如果出错（文件不存在、没有权限等），返回错误信息给 AI
            // AI 看到错误可以尝试修正，不会直接崩溃
            console.log(` [工具调用] read_file("${filePath}") - 错误: ${error.message}`);
            return `读取文件失败: ${error.message}`;
        }
    },
    {
        // 工具名称，AI 通过名字调用
        name: 'read_file',
        // 工具描述 ⚠️ 非常重要！告诉 AI 什么时候应该用这个工具
        // 描述越详细，AI 越容易选对工具
        description: '用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。',
        // 使用 zod 定义参数格式：需要一个 filePath 字符串参数
        schema: z.object({
            filePath: z.string().describe('要读取的文件路径'),
        }),
    }
);

// ==========================================
// 工具 2：写入文件
// ==========================================
/**
 * AI 需要保存代码、创建文件时调用这个工具
 */
const writeFileTool = tool(
    async ({ filePath, content }) => {
        try {
            // 先获取文件所在的目录
            const dir = path.dirname(filePath);
            // 递归创建目录，如果目录不存在就创建它
            // 这样当 AI 写入 src/App.tsx 时，如果 src 目录不存在会自动创建
            await fs.mkdir(dir, { recursive: true });
            // 真正写入文件内容
            await fs.writeFile(filePath, content);
            // 打印日志
            console.log(` [工具调用] write_file("${filePath}") - 成功写入 ${content.length} 字节`);
            // 返回成功信息给 AI
            return `文件写入成功: ${filePath}`;
        } catch (error) {
            // 出错了，返回错误信息给 AI
            console.log(` [工具调用] write_file("${filePath}") - 错误: ${error.message}`);
            return `写入文件失败: ${error.message}`;
        }
    },
    {
        name: 'write_file',
        description: '用此工具来写入文件内容。当用户要求写入文件、保存代码、记录笔记、创建新文件时，调用此工具。输入文件路径（可以是相对路径或绝对路径）和要写入的内容。',
        // 需要两个参数：filePath（路径）和 content（内容）
        schema: z.object({
            filePath: z.string().describe('要写入的文件路径'),
            content: z.string().describe('要写入的完整文件内容'),
        }),
    }
);

// ==========================================
// 工具 3：执行终端命令
// ==========================================
/**
 * AI 需要运行命令时调用（比如 npm install、git status 等）
 * 支持 workingDirectory 参数来切换工作目录
 * 这很重要，因为 AI 可能需要在不同目录执行命令
 */
const executeCommandTool = tool(
    async ({ command, workingDirectory }) => {
        // 如果没有指定工作目录，就用当前目录
        const cwd = workingDirectory || process.cwd();
        // 打印日志，显示要运行的命令和工作目录
        console.log(` [工具调用] execute_command("${command}") - 正在运行命令，工作目录: ${cwd}`);

        // 返回 Promise，因为命令执行是异步的
        // 我们要等命令执行完才能返回结果
        return new Promise((resolve) => {
            // 把命令字符串拆分成命令 + 参数数组
            // 因为 spawn 的参数要求就是这样：第一个是命令，后面都是参数
            const [cmd, ...args] = command.split(' ');

            // spawn 创建子进程，执行命令
            const child = spawn(cmd, args, {
                cwd,                  // 工作目录（如果指定了就切过去）
                stdio: 'inherit',     // 输出直接继承，这样命令的输出会直接显示在你的终端
                shell: true,          // 在 shell 中执行，支持管道、重定向等 shell 语法
            });

            // 保存错误信息
            let errorMessage = '';

            // 监听 error 事件：命令启动失败（比如命令不存在）
            child.on('error', (error) => {
                errorMessage = error.message;
            });

            // 监听 close 事件：命令执行完成（不管成功失败都会关闭）
            child.on('close', (code) => {
                if (code === 0) {
                    // 退出码是 0 → 执行成功
                    console.log(`  [✓ 完成] execute_command - 执行成功`);
                    // 如果用户指定了工作目录，提醒 AI 下次也要用这个参数
                    // 这可以帮助 AI 记住不要用 cd 命令，直接用 workingDirectory 参数
                    const cwdInfo = workingDirectory
                        ? `\n\n重要提示：命令在目录 "${workingDirectory}" 中执行成功。如果需要在这个项目目录中继续执行命令，请使用 workingDirectory: "${workingDirectory}" 参数，不要使用 cd 命令。`
                        : '';
                    // 返回成功结果
                    resolve(`命令执行成功: ${command}${cwdInfo}`);
                } else {
                    // 退出码非 0 → 执行失败
                    console.log(`  [✗ 失败] execute_command - 执行失败，退出码: ${code}`);
                    // 返回失败信息给 AI，AI 可以尝试修复
                    resolve(`命令执行失败，退出码: ${code}${errorMessage ? '\n错误: ' + errorMessage : ''}`);
                }
            });
        });
    },
    {
        name: 'execute_command',
        description: '用此工具来运行 shell 命令。当你需要安装依赖、初始化项目、运行脚本、查看结果时，调用此工具。输入要运行的命令，可选指定工作目录。',
        // 两个参数：command 必须有，workingDirectory 可选
        schema: z.object({
            command: z.string().describe('要运行的完整 shell 命令'),
            workingDirectory: z.string().optional().describe('命令执行的工作目录，在哪个目录下运行'),
        }),
    }
);

// ==========================================
// 工具 4：列出目录内容
// ==========================================
/**
 * AI 想看看目录下有哪些文件时调用这个工具
 * 比如 AI 创建了项目，需要确认文件是否创建成功
 */
const listDirectoryTool = tool(
    async ({ directoryPath }) => {
        try {
            // 读取目录，得到文件列表数组
            const files = await fs.readdir(directoryPath);
            // 打印日志
            console.log(` [工具调用] list_directory("${directoryPath}") - 成功列出 ${files.length} 个文件`);
            // 把文件列表格式化成一行一个，返回给 AI
            return `目录内容:\n${files.map((file) => `- ${file}`).join('\n')}`;
        } catch (error) {
            // 出错了，返回错误信息给 AI
            console.log(` [工具调用] list_directory("${directoryPath}") - 错误: ${error.message}`);
            return `列出目录失败: ${error.message}`;
        }
    },
    {
        name: 'list_directory',
        description: '用此工具来列出目录内容。当你需要查看目录下有哪些文件、确认文件是否创建成功时，调用此工具。输入目录路径。',
        schema: z.object({
            directoryPath: z.string().describe('要列出内容的目录路径'),
        }),
    }
);

// ==========================================
// 导出所有工具，让主程序可以导入使用
// ==========================================
export { readFileTool, writeFileTool, executeCommandTool, listDirectoryTool };
