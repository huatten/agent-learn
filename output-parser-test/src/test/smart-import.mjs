import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import mysql from "mysql2/promise"
import { z } from "zod";

// 这个文件演示的是：AI 智能抽取信息 + 批量写入 MySQL。
//
// 前面我们已经学习了：
// - 用 withStructuredOutput 拿结构化数据
// - 用 create-table.mjs 创建 friends 表
//
// 这个文件把两件事串起来：
// 1. 输入一段自然语言，例如“我认识了几位朋友，他们分别是谁、在哪工作、手机号是多少”
// 2. 让大模型按 zod schema 抽取成结构化数组
// 3. 把数组里的每个人批量插入 friends 表
//
// 这就是一个很常见的 AI 应用模式：
// 非结构化文本 -> 结构化对象 -> 数据库记录。

// 初始化模型。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 信息抽取场景需要稳定输出，所以设置为 0，减少模型随意发挥。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
})

// 定义单个好友信息的 zod schema，匹配 friends 表结构。
//
// 这里每个字段都对应 friends 表中的一列：
// name、gender、birth_date、company、title、phone、wechat。
//
// describe() 是给模型看的字段说明，
// 能帮助模型理解应该从文本中提取什么内容。
const friendSchema = z.object({
    // 姓名，对应 friends.name。
    name: z.string().describe("姓名"),

    // 性别，对应 friends.gender。
    gender: z.string().describe("性别"),

    // 出生日期，对应 friends.birth_date。
    // 数据库字段是 DATE，所以这里提示模型尽量输出 YYYY-MM-DD。
    // 如果文本里只有“大概 29 岁”这种信息，就让模型估算一个日期。
    birth_date: z.string().describe("出生日期，格式：YYYY-MM-DD，如果无法确定具体日期，根据年龄估算"),

    // 公司，对应 friends.company。
    // 注意：这里 schema 写的是 z.string()，但描述里要求找不到返回 null。
    // 如果想更严格，可以后续改成 z.string().nullable()。
    company: z.string().describe("公司名称，如果没有则返回null"),

    // 职位/头衔，对应 friends.title。
    title: z.string().describe("职位/头衔，如果没有则返回null"),

    // 手机号，对应 friends.phone。
    phone: z.string().describe("手机号码，如果没有则返回null"),

    // 微信号，对应 friends.wechat。
    wechat: z.string().describe("微信号，如果没有则返回null"),
})

// 定义批量好友信息的 schema。
// 因为一段文本里可能包含多个人，所以最终结果不是单个对象，而是对象数组。
// 即使只抽到一个人，也希望返回 [ {...} ] 这种数组形式，方便后面统一批量插入。
const friendsArraySchema = z.array(friendSchema).describe("好友信息列表")

// 使用 withStructuredOutput 方法。
// structureModel 会直接返回符合 friendsArraySchema 的 JavaScript 数组，
// 不需要我们手动 JSON.parse，也不需要自己处理 tool_calls。
const structureModel = model.withStructuredOutput(friendsArraySchema)

// 数据库连接配置。
// 和 create-table.mjs 使用同一套本地 MySQL 配置。
//
// 注意：真实项目里建议把 host、user、password 等放到 .env，
// 不要直接写在代码里。
const connectionConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'admin',
    multipleStatements: true
}

// extractAndInsert 做完整的一次处理：
// 输入自然语言 text -> AI 提取结构化信息 -> 批量插入数据库。
const extractAndInsert = async (text) => {
    // 为本次处理创建数据库连接。
    // 这里每次调用函数都新建连接，并在 finally 里关闭。
    const connection = await mysql.createConnection(connectionConfig)

    try {
        // 确保 hello 数据库存在。
        // 这样即使还没手动运行 create-table.mjs，也至少会创建数据库。
        await connection.query(`CREATE DATABASE IF NOT EXISTS hello CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

        // 切换到 hello 数据库。
        // 注意：这个文件假设 friends 表已经存在；
        // 如果表不存在，需要先运行 create-table.mjs。
        await connection.query(`USE hello;`);

        // 使用 AI 提取结构化信息。
        console.log('🤔 正在从文本中提取信息...\n');

        // prompt 负责说明抽取任务和业务规则。
        //
        // 虽然 withStructuredOutput 已经有 schema，
        // 但 prompt 仍然很重要，因为它告诉模型：
        // - 输入文本在哪里
        // - 可能有多个人
        // - 找不到字段时怎么处理
        // - 即使一个人也要返回数组
        const prompt = `请从以下文本中提取所有好友信息，文本中可能包含一个或多个人的信息。请将每个人的信息分别提取出来，返回一个数组。

        ${text}
        
        要求：
        1. 如果文本中包含多个人，请为每个人创建一个对象
        2. 每个对象包含以下字段：
           - 姓名：提取文本中的人名
           - 性别：提取性别信息（男/女）
           - 出生日期：如果能找到具体日期最好，否则根据年龄描述估算（格式：YYYY-MM-DD）
           - 公司：提取公司名称
           - 职位：提取职位/头衔信息
           - 手机号：提取手机号码
           - 微信号：提取微信号
        3. 如果某个字段在文本中找不到，请返回 null
        4. 返回格式必须是一个数组，即使只有一个人也要放在数组中`;

        // 调用结构化模型。
        // results 应该是数组，每一项都符合 friendSchema。
        const results = await structureModel.invoke(prompt);

        // 打印模型抽取结果，方便学习时先确认 AI 提取是否正确，再看数据库插入。
        console.log(`✅ 提取到 ${results.length} 条结构化信息:`);
        console.log(JSON.stringify(results, null, 2));
        console.log('');

        // 如果没有抽取到任何人，就不执行 INSERT。
        if (results.length === 0) {
            console.log('⚠️  没有提取到任何信息');
            return { count: 0, insertIds: [] };
        }

        // 批量插入数据库。
        //
        // MySQL 的 INSERT ... VALUES ? 可以一次插入多行。
        // 后面传入的 values 需要是二维数组：
        // [
        //   [name, gender, birth_date, company, title, phone, wechat],
        //   [name, gender, birth_date, company, title, phone, wechat],
        // ]
        const insertSql = `
          INSERT INTO friends (
            name,
            gender,
            birth_date,
            company,
            title,
            phone,
            wechat
          ) VALUES ?;
        `;

        // 把 AI 返回的对象数组转换成 MySQL 批量插入需要的二维数组。
        //
        // 字段顺序必须和 INSERT 里的列顺序一致。
        // birth_date || null 表示：如果模型没有给出生日期，就存数据库 NULL。
        const values = results.map((result) => [
            result.name,
            result.gender,
            result.birth_date || null,
            result.company,
            result.title,
            result.phone,
            result.wechat,
        ]);

        // 执行批量插入。
        // 注意这里用 query，而不是 execute：
        // mysql2 常用 query(insertSql, [values]) 来处理 VALUES ? 这种批量插入写法。
        const [insertResult] = await connection.query(insertSql, [values]);

        // affectedRows 表示实际插入了多少行。
        // insertId 是第一条插入记录的自增 id。
        console.log(`✅ 成功批量插入 ${insertResult.affectedRows} 条数据`);
        console.log(`   插入的ID范围：${insertResult.insertId} - ${insertResult.insertId + insertResult.affectedRows - 1}`);

        // 返回处理结果，给 main 函数打印总结。
        return {
            count: insertResult.affectedRows,

            // 根据第一条 insertId 和插入数量，推算本次插入的 id 列表。
            insertIds: Array.from({ length: insertResult.affectedRows }, (_, i) => insertResult.insertId + i),
        };

    } catch (error) {
        // 捕获 AI 抽取或数据库插入过程中的错误。
        // 这里重新 throw，是为了让外层 main 也知道处理失败。
        console.error('❌ 执行插入出错：', error);
        throw error;
    } finally {
        // 无论成功还是失败，都关闭数据库连接。
        // 避免脚本执行完后连接还挂着。
        await connection.end()
    }
}



// main 是脚本入口。
const main = async () => {
    // 示例输入：一段自然语言里包含三个人的信息。
    // 这类文本在真实场景里可能来自聊天记录、备忘录、销售线索、名片 OCR 等。
    const example = `我最近认识了几个朋友，第一个是孙总，女的，看起来30出头的样子，在腾讯做产品总监，手机号是182900619289，微信是sunzong2024。还有一个是王总，男性朋友，大概29岁，在阿里云做架构师，电话是18787876667，微信号是wangzong999 ，还有一个是游总，男性，是1976年的，在京东做技术总监，电话是17888823902，微信号是youzong123`

    // 先打印原始输入，方便和后面的结构化结果做对照。
    console.log('📝 输入文本:');
    console.log(example);
    console.log('');

    try {
        // 执行“抽取 + 入库”完整流程。
        const result = await extractAndInsert(example)

        // 打印本次处理总结。
        console.log(`\n🎉 处理完成！成功插入 ${result.count} 条记录`);
        console.log(`   插入的ID：${result.insertIds.join(', ')}`);
    } catch (error) {
        // 如果任一环节失败，打印错误并以失败状态退出进程。
        console.error('❌ 处理失败：', error.message);
        process.exit(1);
    }
}


try {
    // 启动脚本。
    await main()
} catch (err) {
    // 捕获 main 外层没处理到的异常。
    console.error("出错：", err);
}
