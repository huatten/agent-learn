/**
 * @fileoverview 工具函数集合
 * 这里放一些可以复用的工具函数，让主代码更简洁
 * 主要用于终端美化：加载动画、颜色、图标
 */

// chalk：终端文字颜色库
import chalk from 'chalk';

// 加载动画的 spinner 字符序列
// 这些是 Unicode 字符，连起来播放就是一个旋转的动画
// 每个字符都是不同的旋转角度，按顺序切换就是动画效果
const spinner = ['⠋', '⠙', '⠹', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 启动一个带 spinner 动画的加载提示
 *
 * 工作原理：
 * - 用 setInterval 每隔 80ms 刷新一次终端同一行
 * - 每次切换 spinner 字符，制造旋转动画效果
 * - 返回一个停止函数，调用它就清除动画，结束输出
 *
 * @param {string} text - 要显示的提示文字，比如 "AI 正在思考..."
 * @returns {Function} 停止函数，调用它停止动画并清除行
 *
 * 使用示例：
 * ```js
 * const stop = startLoadingAnimation('加载中...');
 * await doSomething();
 * stop();
 * ```
 */
export function startLoadingAnimation(text) {
    let i = 0;  // 当前 spinner 索引

    // 每 80ms 更新一次，这个速度看起来最流畅
    const interval = setInterval(() => {
        // 取下一个 spinner 字符，到末尾后回到开头（取模运算）
        i = (i + 1) % spinner.length;

        // 清除当前整行内容
        process.stdout.clearLine(0);
        // 把光标移到行首
        process.stdout.cursorTo(0);
        // 输出当前帧：spinner + 提示文字
        // 用 chalk 给 spinner 和文字上色
        process.stdout.write(`${chalk.cyan(spinner[i])} ${chalk.blue(text)}`);
    }, 80);

    // 返回停止函数，调用者在完成后调用这个函数停止动画
    return () => {
        clearInterval(interval);    // 清除定时器，停止动画
        process.stdout.clearLine(0);  // 清除当前行
        process.stdout.cursorTo(0);  // 光标回到行首
    };
}

/**
 * 根据工具名称返回对应的 chalk 颜色函数
 * 不同工具用不同颜色，在终端更容易区分
 *
 * @param {string} toolName - 工具名称
 * @returns {Function} chalk 颜色函数，调用它给文字上色
 */
export function getToolColor(toolName) {
    const colors = {
        read_file: chalk.green,       // 读文件 → 绿色
        write_file: chalk.yellow,     // 写文件 → 黄色
        execute_command: chalk.magenta, // 执行命令 → 紫色
        list_directory: chalk.cyan,   // 列目录 → 青色
    };
    // 如果找不到，默认返回白色
    return colors[toolName] || chalk.white;
}

/**
 * 根据工具名称返回对应的 Emoji 图标
 * 让终端输出更直观，一眼看出是什么工具
 *
 * @param {string} toolName - 工具名称
 * @returns {string} Emoji 图标
 */
export function getToolIcon(toolName) {
    const icons = {
        read_file: '📄',       // 文档图标
        write_file: '✏️ ',     // 铅笔图标
        execute_command: '⚡', // 闪电图标
        list_directory: '📂',  // 文件夹图标
    };
    // 默认工具图标
    return icons[toolName] || '🔧';
}
