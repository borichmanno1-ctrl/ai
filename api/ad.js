const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

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

const JWT_SECRET = process.env.JWT_SECRET || 'ai-video-secret-2024';

// 验证JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
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

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      message: 'Method not allowed' 
    });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: '未授权' 
      });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ 
        success: false,
        message: '无效的token' 
      });
    }

    const userId = decoded.userId;

    const pool = createPool();

    // 检查用户
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      pool.end();
      return res.status(401).json({ 
        success: false,
        message: '用户不存在' 
      });
    }

    // 检查今日观看广告次数
    const today = new Date().toISOString().split('T')[0];
    const [todayAds] = await pool.execute(
      'SELECT COUNT(*) as count FROM ad_records WHERE user_id = ? AND DATE(created_at) = ?',
      [userId, today]
    );

    if (todayAds[0].count >= 5) {
      pool.end();
      return res.status(400).json({ 
        success: false,
        message: '今日观看广告次数已达上限' 
      });
    }

    // 计算奖励时长（基础25秒 + 随机0-10秒）
    const baseSeconds = 25;
    const randomBonus = Math.floor(Math.random() * 11);
    const totalSeconds = baseSeconds + randomBonus;

    // 模拟广告收益（0.1-0.3元）
    const revenue = 0.1 + Math.random() * 0.2;

    // 记录广告观看
    await pool.execute(
      'INSERT INTO ad_records (user_id, seconds_earned, revenue) VALUES (?, ?, ?)',
      [userId, totalSeconds, revenue]
    );

    // 更新用户时长
    await pool.execute(
      'UPDATE users SET remaining_seconds = remaining_seconds + ?, total_ads_watched = total_ads_watched + 1 WHERE id = ?',
      [totalSeconds, userId]
    );

    // 创建系统日志
    await pool.execute(
      'INSERT INTO system_logs (user_id, action_type, description) VALUES (?, ?, ?)',
      [userId, 'ad_watched', `观看广告获得${totalSeconds}秒时长`]
    );

    pool.end();

    res.json({
      success: true,
      seconds_earned: totalSeconds,
      revenue: revenue.toFixed(4),
      ads_today: todayAds[0].count + 1,
      message: `成功获得${totalSeconds}秒生成时长！`
    });

  } catch (error) {
    console.error('广告API错误:', error);
    res.status(500).json({ 
      success: false,
      message: '服务器错误',
      error: error.message 
    });
  }
};
