/**
 * @fileoverview 这是一个 Node.js 执行系统命令的示例
 * 功能：在 Node.js 程序中调用外部命令（比如 ls、git、npm 等），并实时输出结果
 *
 * 核心概念：
 * - child_process：Node.js 内置模块，用于创建子进程，执行外部命令
 * - spawn：启动一个子进程来执行命令，支持流式输出（边执行边输出）
 * - 事件监听：监听子进程的错误和退出事件，做相应处理
 *
 * 这个示例常用于：给大模型添加"执行 shell 命令"的工具，让 AI 能自己运行命令
 */

// 从 Node.js 内置的 child_process 模块导入 spawn 方法
// node: 前缀是 Node.js 推荐的写法，明确表示这是内置模块
// spawn 的特点：支持实时流式输出，适合长时间运行的命令
import { spawn } from "node:child_process";

// ==================== 配置要执行的命令 ====================
// 要执行的命令字符串，可以改成任何你想执行的命令
// 例如："npm install"、"git status"、"node src/hello.js"
const command = "ls -la";

// 获取当前工作目录（就是你运行 node 命令所在的目录）
// 子进程会在这个目录下执行命令
const cwd = process.cwd();

// 将命令字符串分割成命令名+参数数组
// 例如："ls -la" → ["ls", "-la"]
// spawn 的参数要求：第一个是命令名，后面是参数数组
const [cmd, ...args] = command.split(' ');

// ==================== 创建子进程 ====================
// 调用 spawn 创建子进程，执行命令
const child = spawn(cmd, args, {
    cwd: cwd,          // 子进程的工作目录，和当前目录一致
    stdio: "inherit",  // 子进程的输出直接继承到父进程（当前Node进程）
                        // 这样命令的输出会直接显示在你的控制台，实现实时输出
                        // 如果不设置这个，你需要自己手动读取 stdout/stderr
    shell: true,       // 是否在 shell 中执行命令
                        // true → 可以直接使用 shell 语法（管道 |、重定向 > 等），直接写完整命令字符串方便
                        // false → 不通过shell，直接执行命令，更安全高效但不支持shell语法
});

// ==================== 事件处理 ====================
// 保存错误信息，用于后面出错时显示
let errorMessage = '';

// 监听 error 事件：如果子进程启动失败（比如命令不存在）会触发这个事件
child.on("error", (error) => {
    errorMessage = error.message;
});

// 监听 close 事件：子进程退出（不管成功还是失败）会触发这个事件
// 参数 code 是退出码：0 表示成功，非 0 表示失败
child.on("close", (code) => {
    console.log(`\n[子进程退出] 退出码: ${code}`);

    if (code === 0) {
        // 退出码是 0 → 命令执行成功，我们也正常退出
        process.exit(0);
    } else {
        // 退出码非 0 → 命令执行失败
        // 如果有错误信息，打印出来
        if (errorMessage) {
            console.error(`错误：${errorMessage}`);
        }
        // 按照子进程的退出码退出当前进程，如果 code 为空则默认用 1
        process.exit(code || 1);
    }
});

/**
 * 常见问题：
 * 1. spawn vs exec vs execFile 的区别？
 *    - spawn：流式输出，适合大输出，支持实时显示，返回的是流
 *    - exec：缓冲输出，会把整个输出缓存起来，回调给你，适合小输出
 *    - execFile：不通过 shell，直接执行，更安全，适合已知命令
 *
 * 2. 为什么我要写 stdio: 'inherit'？
 *    - 如果不写，命令输出不会显示在控制台，你需要自己：
 *      child.stdout.pipe(process.stdout);
 *      child.stderr.pipe(process.stderr);
 *    - 直接用 inherit 更简洁
 *
 * 3. 什么时候用 shell: true？
 *    - 当你的命令包含 shell 特性（比如 |、>、* 通配符、环境变量 $HOME）时，需要开启
 *    - 如果只执行单个命令没有特殊语法，可以用 shell: false，性能更好一点
 */
