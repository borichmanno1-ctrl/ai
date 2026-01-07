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

  if (req.method === 'POST') {
    try {
      // 解析请求体
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const { text } = JSON.parse(body);

      if (!text) {
        return res.status(400).json({ 
          success: false,
          message: '缺少文本参数' 
        });
      }

      const pool = createPool();

      // 获取违规词列表
      const [bannedWords] = await pool.execute('SELECT word FROM banned_words');
      const bannedWordList = bannedWords.map(w => w.word.toLowerCase());
      const textLower = text.toLowerCase();
      
      const hasBannedWords = bannedWordList.some(word => textLower.includes(word));
      
      pool.end();

      res.json({
        success: true,
        has_banned_words: hasBannedWords,
        banned_words_found: hasBannedWords ? bannedWordList.filter(word => textLower.includes(word)) : []
      });

    } catch (error) {
      console.error('检查违规词失败:', error);
      res.status(500).json({ 
        success: false,
        message: '服务器错误',
        error: error.message 
      });
    }
  } else {
    res.status(405).json({ 
      success: false,
      message: 'Method not allowed' 
    });
  }
};
