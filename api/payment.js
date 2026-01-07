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

// 套餐配置
const PACKAGES = {
  basic: {
    name: '体验包',
    amount: 5,
    seconds: 300,
    description: '300秒720P生成时长'
  },
  professional: {
    name: '专业包',
    amount: 39,
    seconds: 2000,
    description: '2000秒1080P生成时长，无水印'
  },
  unlimited: {
    name: '无限包',
    amount: 99,
    seconds: 999999,
    description: '无限生成时长，1080P，无水印，优先处理'
  }
};

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
    // 解析请求体
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const data = JSON.parse(body);

    const { package_type, payment_method } = data;

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

    if (!package_type || !PACKAGES[package_type]) {
      return res.status(400).json({ 
        success: false,
        message: '无效的套餐类型' 
      });
    }

    const selectedPackage = PACKAGES[package_type];

    const pool = createPool();

    // 检查用户
    const [users] = await pool.execute(
      'SELECT id, username, email FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      pool.end();
      return res.status(401).json({ 
        success: false,
        message: '用户不存在' 
      });
    }

    // 生成交易ID
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // 创建充值记录
    await pool.execute(
      `INSERT INTO recharge_records 
      (user_id, amount, seconds_added, package_type, payment_method, transaction_id, status) 
      VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
      [userId, selectedPackage.amount, selectedPackage.seconds, package_type, payment_method, transactionId]
    );

    // 更新用户信息
    const updateFields = [
      'remaining_seconds = remaining_seconds + ?',
      'total_recharge_amount = total_recharge_amount + ?'
    ];

    const updateValues = [selectedPackage.seconds, selectedPackage.amount, userId];

    // 如果是无限包，标记为会员
    if (package_type === 'unlimited') {
      updateFields.push('is_premium = 1');
    }

    await pool.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // 创建系统日志
    await pool.execute(
      'INSERT INTO system_logs (user_id, action_type, description) VALUES (?, ?, ?)',
      [userId, 'recharge_completed', `充值${selectedPackage.amount}元，获得${selectedPackage.seconds}秒时长`]
    );

    pool.end();

    res.json({
      success: true,
      transaction_id: transactionId,
      package: selectedPackage,
      message: `充值成功！获得${selectedPackage.seconds}秒生成时长`
    });

  } catch (error) {
    console.error('支付API错误:', error);
    res.status(500).json({ 
      success: false,
      message: '服务器错误',
      error: error.message 
    });
  }
};
