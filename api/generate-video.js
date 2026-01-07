const mysql = require('mysql2/promise');
const axios = require('axios');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 智谱AI API配置
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/vidu';

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: '未授权' });
        }

        // 验证用户
        const [users] = await pool.execute(
            'SELECT id, remaining_seconds, is_premium FROM users WHERE id = ?',
            [req.userId]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: '用户不存在' });
        }

        const user = users[0];
        const { prompt, total_seconds, resolution, has_watermark } = req.body;

        if (!prompt || !total_seconds) {
            return res.status(400).json({ message: '缺少必要参数' });
        }

        // 检查违规词
        const [bannedWords] = await pool.execute('SELECT word FROM banned_words');
        const bannedWordList = bannedWords.map(w => w.word);
        const hasBannedWords = bannedWordList.some(word => prompt.includes(word));
        
        if (hasBannedWords) {
            await pool.execute(
                'INSERT INTO system_logs (user_id, action_type, description, ip_address) VALUES (?, ?, ?, ?)',
                [user.id, 'banned_words_detected', `用户输入包含违规词: ${prompt}`, req.headers['x-forwarded-for'] || req.connection.remoteAddress]
            );
            return res.status(400).json({ message: '提示词包含违规内容' });
        }

        // 计算消耗时长
        let seconds_used = total_seconds;
        if (resolution === '1080p') {
            seconds_used = Math.ceil(total_seconds * 1.5);
        }
        
        // 字数加成
        if (prompt.length > 100) {
            seconds_used += Math.floor(prompt.length / 100);
        }

        // 检查剩余时长
        if (user.remaining_seconds < seconds_used && !user.is_premium) {
            return res.status(400).json({ 
                message: `时长不足！需要${seconds_used}秒，您当前剩余${user.remaining_seconds}秒` 
            });
        }

        // 创建视频记录
        const [result] = await pool.execute(
            `INSERT INTO video_records 
            (user_id, prompt, total_seconds, resolution, seconds_used, has_watermark, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [user.id, prompt, total_seconds, resolution, seconds_used, has_watermark ? 1 : 0]
        );

        const videoId = result.insertId;

        // 分段生成逻辑
        const segments = [];
        const segmentDuration = 10; // 每段10秒
        const segmentCount = Math.ceil(total_seconds / segmentDuration);

        for (let i = 0; i < segmentCount; i++) {
            const start = i * segmentDuration;
            const end = Math.min((i + 1) * segmentDuration, total_seconds);
            const segmentPrompt = generateSegmentPrompt(prompt, i, segmentCount);
            
            segments.push({
                segment: i + 1,
                start,
                end,
                prompt: segmentPrompt,
                status: 'pending'
            });
        }

        // 更新分段信息
        await pool.execute(
            'UPDATE video_records SET segments = ? WHERE id = ?',
            [JSON.stringify(segments), videoId]
        );

        // 扣除时长（如果不是会员）
        if (!user.is_premium) {
            await pool.execute(
                'UPDATE users SET remaining_seconds = remaining_seconds - ? WHERE id = ?',
                [seconds_used, user.id]
            );
        }

        // 记录日志
        await pool.execute(
            'INSERT INTO system_logs (user_id, action_type, description) VALUES (?, ?, ?)',
            [user.id, 'video_generation_started', `开始生成视频，ID: ${videoId}`]
        );

        // 异步调用AI生成视频
        generateVideoSegments(videoId, segments, resolution, has_watermark);

        res.json({
            success: true,
            video_id: videoId,
            segments,
            seconds_used,
            message: '视频生成已开始，请稍后查看结果'
        });

    } catch (error) {
        console.error('生成视频失败:', error);
        res.status(500).json({ message: '服务器错误' });
    }
};

// 生成分段提示词
function generateSegmentPrompt(basePrompt, index, total) {
    // 这里可以根据分段位置优化提示词
    const timePhrases = [
        '开始，',
        '接着，',
        '然后，',
        '随后，',
        '最后，'
    ];
    
    const phrase = timePhrases[Math.min(index, timePhrases.length - 1)];
    return `${phrase}${basePrompt}`;
}

// 异步生成视频分段
async function generateVideoSegments(videoId, segments, resolution, hasWatermark) {
    try {
        // 调用智谱AI Vidu API
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            
            try {
                const response = await axios.post(ZHIPU_API_URL, {
                    model: "vidu",
                    prompt: segment.prompt,
                    duration: 10, // 每段10秒
                    resolution: resolution === '1080p' ? "720p" : "480p", // 智谱API可能支持的分辨率
                    watermark: hasWatermark
                }, {
                    headers: {
                        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                segment.status = 'completed';
                segment.video_url = response.data.video_url;

                // 更新分段状态
                const pool = mysql.createPool({
                    host: process.env.DB_HOST,
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: process.env.DB_NAME,
                    port: process.env.DB_PORT
                });

                await pool.execute(
                    'UPDATE video_records SET segments = ? WHERE id = ?',
                    [JSON.stringify(segments), videoId]
                );

                pool.end();

            } catch (error) {
                console.error(`分段${i+1}生成失败:`, error);
                segment.status = 'failed';
                
                // 如果是第一个分段失败，返还时长
                if (i === 0) {
                    const pool = mysql.createPool({
                        host: process.env.DB_HOST,
                        user: process.env.DB_USER,
                        password: process.env.DB_PASSWORD,
                        database: process.env.DB_NAME,
                        port: process.env.DB_PORT
                    });
                    
                    await pool.execute(
                        'UPDATE video_records SET status = "failed", seconds_refunded = seconds_used WHERE id = ?',
                        [videoId]
                    );
                    
                    await pool.execute(
                        'UPDATE users SET remaining_seconds = remaining_seconds + ? WHERE id = (SELECT user_id FROM video_records WHERE id = ?)',
                        [segments.length * 10, videoId]
                    );
                    
                    pool.end();
                    break;
                }
            }
        }

        // 所有分段完成后，更新视频状态
        const allCompleted = segments.every(s => s.status === 'completed');
        if (allCompleted) {
            const pool = mysql.createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                port: process.env.DB_PORT
            });

            // 这里应该调用视频剪辑API将分段视频合并
            // 暂时使用模拟的视频URL
            const finalVideoUrl = `https://example.com/videos/${videoId}.mp4`;
            
            await pool.execute(
                'UPDATE video_records SET status = "completed", video_url = ? WHERE id = ?',
                [finalVideoUrl, videoId]
            );

            pool.end();
        }

    } catch (error) {
        console.error('视频生成过程失败:', error);
    }
}