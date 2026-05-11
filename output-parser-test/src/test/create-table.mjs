import mysql from "mysql2/promise"

// 这个文件演示的是：为后面的智能导入示例准备 MySQL 数据表。
//
// 前面的文件主要在学习“怎么让大模型返回结构化数据”。
// 到了这里，结构化数据有了一个实际去处：写入数据库。
//
// 这个脚本做三件事：
// 1. 连接本地 MySQL
// 2. 创建 hello 数据库和 friends 表
// 3. 插入一条 demo 数据，确认表结构和插入语句能正常工作
//
// 可以把它理解成 smart-import.mjs 的前置准备脚本：
// smart-import 会让 AI 从自然语言里提取好友信息，再写入这里创建的 friends 表。

// main 是整个脚本的主流程。
// 因为数据库操作都是异步的，所以这里写成 async 函数，方便使用 await。
const main = async () => {
    // 数据库连接配置。
    // 这里连接的是本机 localhost 的 MySQL，账号是 root。
    //
    // 注意：真实项目里不要把数据库密码直接写在代码里，
    // 更推荐放到 .env 里，例如 MYSQL_PASSWORD。
    const connectionConfig = {
        // MySQL 服务地址。
        host: 'localhost',

        // MySQL 默认端口通常是 3306。
        port: 3306,

        // 数据库用户名。
        user: 'root',

        // 数据库密码。
        password: 'admin',

        // 允许一次执行多条 SQL。
        // 当前文件里虽然大多是一条条执行，但保留它可以方便后续扩展。
        multipleStatements: true
    }

    // 创建数据库连接。
    // mysql2/promise 版本返回的是 Promise，所以可以直接 await。
    const connection = await mysql.createConnection(connectionConfig)

    try {
        // 创建 database。
        //
        // IF NOT EXISTS 表示：如果 hello 数据库已经存在，就不重复创建，也不会报错。
        // CHARACTER SET utf8mb4 可以更好地支持中文和 emoji。
        // COLLATE utf8mb4_unicode_ci 是排序/比较规则，适合通用多语言文本。
        await connection.query(`CREATE DATABASE IF NOT EXISTS hello CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

        // 切换到 hello 数据库。
        // 后面的 CREATE TABLE 和 INSERT 都会在这个数据库里执行。
        await connection.query(`USE hello;`);

        // 创建好友表。
        //
        // friends 表用来保存从自然语言中抽取出来的联系人/好友信息。
        // IF NOT EXISTS 表示表已经存在时不会重复创建。
        await connection.query(`
            CREATE TABLE IF NOT EXISTS friends (
                -- id 是自增主键，每插入一条数据自动加 1。
                id INT AUTO_INCREMENT PRIMARY KEY,

                -- name 是必填字段，表示好友姓名。
                name VARCHAR(50) NOT NULL,

                gender VARCHAR(10),                -- 性别
                birth_date DATE,                   -- 出生日期
                company VARCHAR(100),              -- 公司
                title VARCHAR(100),                -- 职位
                phone VARCHAR(20),                 -- 当前手机号
                wechat VARCHAR(50)                 -- 微信号
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 插入 demo 数据。
        //
        // 这里使用 ? 占位符，而不是把值直接拼进 SQL 字符串。
        // 好处是 mysql2 会帮我们处理转义，降低 SQL 注入和字符串格式错误的风险。
        const insertSql = `
            INSERT INTO friends (
                name,
                gender,
                birth_date,
                company,
                title,
                phone,
                wechat
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
        `

        // 和 insertSql 里的 ? 一一对应。
        // 顺序必须和 INSERT 字段顺序保持一致：
        // name、gender、birth_date、company、title、phone、wechat。
        const values = [
            "王经理", // name
            "男", // gender
            "1990-01-01", // birth_date
            "字节跳动", // company
            "产品经理/产品总监", // title
            "18612345678", // phone
            "wangjingli2024", // wechat
        ];

        // execute 适合执行带占位符的 SQL。
        // result.insertId 是这条 demo 数据插入后生成的自增 id。
        const [ result] = await connection.execute(insertSql, values);

        console.log("成功创建数据库和表，并插入 demo 数据，插入ID：", result.insertId);
    } catch (err) {
        // 捕获建库、建表、插入过程中的错误。
        // 常见原因包括：MySQL 没启动、账号密码不对、端口不对、权限不足等。
        console.error("执行出错：", err);
    } finally {
        // 无论成功还是失败，都关闭数据库连接。
        // 这一步很重要，否则脚本可能因为连接没释放而迟迟不退出。
        await connection.end()
    }
}


try {
    // 启动主流程。
    await main()
} catch (err) {
    // 捕获 main 外层的异常。
    // 例如 createConnection 阶段就失败时，可能会走到这里。
    console.error("出错：", err);
}
