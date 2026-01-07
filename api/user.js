const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
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

// 生成JWT token
function generateToken(userId, email) {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

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

  // 解析路径
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // 用户注册
    if (req.method === 'POST' && path === '/api/user/register') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const { username, email, password } = JSON.parse(body);

      if (!username || !email || !password) {
        return res.status(400).json({ 
          success: false,
          message: '请填写所有必填项' 
        });
      }

      if (password.length < 6) {
        return res.status(400).json({ 
          success: false,
          message: '密码至少需要6位' 
        });
      }

      const pool = createPool();

      // 检查邮箱是否已存在
      const [existingUsers] = await pool.execute(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existingUsers.length > 0) {
        pool.end();
        return res.status(400).json({ 
          success: false,
          message: '邮箱已被注册' 
        });
      }

      // 检查用户名是否已存在
      const [existingUsernames] = await pool.execute(
        'SELECT id FROM users WHERE username = ?',
        [username]
      );

      if (existingUsernames.length > 0) {
        pool.end();
        return res.status(400).json({ 
          success: false,
          message: '用户名已被使用' 
        });
      }

      // 加密密码
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // 创建用户
      const [result] = await pool.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [username, email, passwordHash]
      );

      // 创建系统日志
      await pool.execute(
        'INSERT INTO system_logs (user_id, action_type, description) VALUES (?, ?, ?)',
        [result.insertId, 'user_registered', '用户注册']
      );

      pool.end();

      return res.status(201).json({ 
        success: true, 
        message: '注册成功',
        userId: result.insertId
      });
    }

    // 用户登录
    if (req.method === 'POST' && path === '/api/user/login') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const { email, password } = JSON.parse(body);

      if (!email || !password) {
        return res.status(400).json({ 
          success: false,
          message: '请输入邮箱和密码' 
        });
      }

      const pool = createPool();

      // 查找用户
      const [users] = await pool.execute(
        'SELECT id, username, email, password_hash, remaining_seconds, is_premium FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        pool.end();
        return res.status(401).json({ 
          success: false,
          message: '邮箱或密码错误' 
        });
      }

      const user = users[0];

      // 验证密码
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        pool.end();
        return res.status(401).json({ 
          success: false,
          message: '邮箱或密码错误' 
        });
      }

      // 生成JWT token
      const token = generateToken(user.id, user.email);

      // 更新登录时间
      await pool.execute(
        'UPDATE users SET updated_at = NOW() WHERE id = ?',
        [user.id]
      );

      // 创建系统日志
      await pool.execute(
        'INSERT INTO system_logs (user_id, action_type, description) VALUES (?, ?, ?)',
        [user.id, 'user_logged_in', '用户登录']
      );

      // 移除敏感信息
      delete user.password_hash;

      pool.end();

      return res.json({
        success: true,
        token,
        user
      });
    }

    // 获取用户信息
    if (req.method === 'GET' && path === '/api/user/profile') {
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

      const pool = createPool();
      
      const [users] = await pool.execute(
        `SELECT id, username, email, remaining_seconds, 
        total_generated_seconds, total_ads_watched, 
        total_recharge_amount, total_withdraw_amount, is_premium 
        FROM users WHERE id = ?`,
        [decoded.userId]
      );

      pool.end();

      if (users.length === 0) {
        return res.status(404).json({ 
          success: false,
          message: '用户不存在' 
        });
      }

      return res.json({
        success: true,
        user: users[0]
      });
    }

    // 用户提现
    if (req.method === 'POST' && path === '/api/user/withdraw') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const { amount, payment_method, account_number } = JSON.parse(body);

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

      if (!amount || amount < 10) {
        return res.status(400).json({ 
          success: false,
          message: '提现金额最少10元' 
        });
      }

      if (!payment_method || !account_number) {
        return res.status(400).json({ 
          success: false,
          message: '请选择支付方式和填写账号' 
        });
      }

      const pool = createPool();

      // 检查用户余额
      const [users] = await pool.execute(
        'SELECT total_recharge_amount, total_withdraw_amount FROM users WHERE id = ?',
        [decoded.userId]
      );

      if (users.length === 0) {
        pool.end();
        return res.status(404).json({ 
          success: false,
          message: '用户不存在' 
        });
      }

      const user = users[0];
      const availableBalance = user.total_recharge_amount - user.total_withdraw_amount;

      if (amount > availableBalance) {
        pool.end();
        return res.status(400).json({ 
          success: false,
          message: '提现金额超过可提现余额' 
        });
      }

      // 计算手续费（2%）
      const fee = amount * 0.02;
      const actualAmount = amount - fee;

      // 创建提现记录
      await pool.execute(
        `INSERT INTO withdraw_records 
        (user_id, amount, fee, actual_amount, payment_method, account_number, status) 
        VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [decoded.userId, amount, fee, actualAmount, payment_method, account_number]
      );

      // 更新用户提现总额
      await pool.execute(
        'UPDATE users SET total_withdraw_amount = total_withdraw_amount + ? WHERE id = ?',
        [amount, decoded.userId]
      );

      // 创建系统日志
      await pool.execute(
        'INSERT INTO system_logs (user_id, action_type, description) VALUES (?, ?, ?)',
        [decoded.userId, 'withdraw_requested', `申请提现${amount}元`]
      );

      pool.end();

      return res.json({
        success: true,
        message: '提现申请已提交',
        amount,
        fee,
        actualAmount
      });
    }

    // 其他路径
    return res.status(404).json({ 
      success: false,
      message: 'API路径不存在' 
    });

  } catch (error) {
    console.error('用户API错误:', error);
    return res.status(500).json({ 
      success: false,
      message: '服务器错误',
      error: error.message 
    });
  }
};
