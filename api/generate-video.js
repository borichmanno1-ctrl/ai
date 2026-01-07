const mysql = require('mysql2/promise');

// 创建数据库连接池
function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || 'cd-cdb-5nwy0y82.sql.tencentcdb.com',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'lbags0621',
    database: process.env.DB_NAME || 'ai_video_db',
    port: process.env.DB_PORT || 21182,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

// 检查违规词
async function checkBannedWords(pool, text) {
  try {
    const [bannedWords] = await pool.execute('SELECT word FROM banned_words');
    const bannedWordList = bannedWords.map(w => w.word.toLowerCase());
    const textLower = text.toLowerCase();
    
    return bannedWordList.some(word => textLower.includes(word));
  } catch (error) {
    console.error('检查违规词失败:', error);
    return false;
  }
}

// 生成分段提示词
function generateSegmentPrompt(basePrompt, index, total) {
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

  // 处理POST请求
  if (req.method === 'POST') {
    try {
      // 解析请求体
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const data = JSON.parse(body);

      const { prompt, total_seconds, resolution, has_watermark, user_id } = data;

      if (!prompt || !total_seconds || !user_id) {
        return res.status(400).json({ 
          success: false, 
          message: '缺少必要参数' 
        });
      }

      // 创建数据库连接池
      const pool = createPool();

      // 获取用户信息
      const [users] = await pool.execute(
        'SELECT id, remaining_seconds, is_premium FROM users WHERE id = ?',
        [user_id]
      );

      if (users.length === 0) {
        pool.end();
        return res.status(404).json({ 
          success: false, 
          message: '用户不存在' 
        });
      }

      const user = users[0];

      // 检查违规词
      const hasBannedWords = await checkBannedWords(pool, prompt);
      if (hasBannedWords) {
        await pool.execute(
          'INSERT INTO system_logs (user_id, action_type, description) VALUES (?, ?, ?)',
          [user.id, 'banned_words_detected', '用户输入包含违规词']
        );
        pool.end();
        return res.status(400).json({ 
          success: false, 
          message: '提示词包含违规内容' 
        });
      }

      // 计算消耗时长
      let seconds_used = parseInt(total_seconds);
      if (resolution === '1080p') {
        seconds_used = Math.ceil(total_seconds * 1.5);
      }
      
      // 字数加成
      if (prompt.length > 100) {
        seconds_used += Math.floor(prompt.length / 100);
      }

      // 检查剩余时长
      if (user.remaining_seconds < seconds_used && !user.is_premium) {
        pool.end();
        return res.status(400).json({ 
          success: false,
          message: `时长不足！需要${seconds_used}秒，您当前剩余${user.remaining_seconds}秒` 
        });
      }

      // 创建视频记录
      const segments = [];
      const segmentDuration = 10;
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

      const [result] = await pool.execute(
        `INSERT INTO video_records 
        (user_id, prompt, segments, total_seconds, resolution, seconds_used, has_watermark, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          user.id, 
          prompt, 
          JSON.stringify(segments), 
          total_seconds, 
          resolution || '720p', 
          seconds_used, 
          has_watermark ? 1 : 0
        ]
      );

      const videoId = result.insertId;

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

      pool.end();

      // 返回成功响应
      res.status(200).json({
        success: true,
        video_id: videoId,
        segments,
        seconds_used,
        remaining_seconds: user.is_premium ? user.remaining_seconds : user.remaining_seconds - seconds_used,
        message: '视频生成任务已创建'
      });

    } catch (error) {
      console.error('生成视频失败:', error);
      res.status(500).json({ 
        success: false,
        message: '服务器错误',
        error: error.message 
      });
    }
  } else if (req.method === 'GET') {
    // 获取视频生成状态
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const videoId = url.searchParams.get('video_id');
      
      if (!videoId) {
        return res.status(400).json({ 
          success: false,
          message: '缺少video_id参数' 
        });
      }

      const pool = createPool();
      const [videos] = await pool.execute(
        'SELECT * FROM video_records WHERE id = ?',
        [videoId]
      );

      pool.end();

      if (videos.length === 0) {
        return res.status(404).json({ 
          success: false,
          message: '视频记录不存在' 
        });
      }

      const video = videos[0];
      res.status(200).json({
        success: true,
        video
      });

    } catch (error) {
      console.error('获取视频状态失败:', error);
      res.status(500).json({ 
        success: false,
        message: '服务器错误' 
      });
    }
  } else {
    res.status(405).json({ 
      success: false,
      message: 'Method not allowed' 
    });
  }
};
