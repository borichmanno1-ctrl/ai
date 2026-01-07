// 全局变量
let currentUser = null;
let currentVideoId = null;
let adTimer = null;
let remainingAds = 5;
let videoGenerationInterval = null;

// API基础URL
const API_BASE_URL = window.location.origin;
const DEFAULT_DB_CONFIG = {
    host: 'cd-cdb-5nwy0y82.sql.tencentcdb.com',
    user: 'root',
    password: 'lbags0621',
    database: 'ai_video_db',
    port: 21182
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('AI视频生成器初始化...');
    
    // 检查认证状态
    checkAuthStatus();
    
    // 初始化事件监听
    initEventListeners();
    
    // 加载统计数据
    loadStats();
    
    // 生成邀请链接
    generateInviteLink();
    
    // 更新时长显示
    updateCostTime();
    
    // 检测URL中的邀请参数
    detectInviteCode();
});

// 初始化事件监听器
function initEventListeners() {
    // 监听提现金额变化
    const withdrawAmount = document.getElementById('withdrawAmount');
    if (withdrawAmount) {
        withdrawAmount.addEventListener('input', updateWithdrawFee);
    }
    
    // 监听视频描述输入
    const videoPrompt = document.getElementById('videoPrompt');
    if (videoPrompt) {
        videoPrompt.addEventListener('input', updateCostTime);
    }
    
    // 监听视频长度选择
    const videoLength = document.getElementById('videoLength');
    if (videoLength) {
        videoLength.addEventListener('change', updateCostTime);
    }
    
    // 监听分辨率选择
    const resolutionRadios = document.querySelectorAll('input[name="resolution"]');
    resolutionRadios.forEach(radio => {
        radio.addEventListener('change', updateCostTime);
    });
    
    // 监听登录/注册弹窗关闭按钮
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // 点击模态框外部关闭
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });
    
    // 绑定登录/注册按钮
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', showAuthModal);
    }
    
    // 绑定退出按钮
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // 绑定生成视频按钮
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateVideo);
    }
    
    // 绑定观看广告按钮
    const watchAdBtn = document.querySelector('.btn[onclick*="watchAd"]');
    if (watchAdBtn) {
        watchAdBtn.onclick = watchAd;
    }
    
    // 绑定广告关闭按钮
    const closeAdBtn = document.getElementById('closeAdBtn');
    if (closeAdBtn) {
        closeAdBtn.addEventListener('click', closeAdModal);
    }
}

// 检查认证状态
async function checkAuthStatus() {
    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                updateUserInfo();
                
                // 加载用户今日广告观看次数
                await loadUserAdsToday();
            } else {
                console.warn('Token无效，清除本地存储');
                localStorage.removeItem('auth_token');
                currentUser = null;
                updateUserInfo();
            }
        } catch (error) {
            console.error('认证检查失败:', error);
            // 网络错误时保持当前状态
        }
    } else {
        currentUser = null;
        updateUserInfo();
    }
}

// 更新用户信息显示
function updateUserInfo() {
    const remainingTimeEl = document.getElementById('remainingTime');
    const currentTimeEl = document.getElementById('currentTime');
    const loginBtn = document.getElementById('loginBtn');
    const userMenu = document.getElementById('userMenu');
    const userNameEl = document.getElementById('userName');
    
    if (currentUser) {
        if (remainingTimeEl) {
            remainingTimeEl.innerHTML = 
                `剩余时长: <strong>${formatSeconds(currentUser.remaining_seconds)}</strong>`;
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = formatSeconds(currentUser.remaining_seconds);
        }
        if (userNameEl) {
            userNameEl.textContent = currentUser.username;
        }
        if (loginBtn) {
            loginBtn.style.display = 'none';
        }
        if (userMenu) {
            userMenu.style.display = 'block';
        }
        
        // 更新可提现金额
        if (currentUser.total_recharge_amount !== undefined && 
            currentUser.total_withdraw_amount !== undefined) {
            const available = currentUser.total_recharge_amount - currentUser.total_withdraw_amount;
            const availableBalanceEl = document.getElementById('availableBalance');
            if (availableBalanceEl) {
                availableBalanceEl.textContent = available.toFixed(2);
            }
        }
    } else {
        if (remainingTimeEl) {
            remainingTimeEl.innerHTML = `剩余时长: <strong>0秒</strong>`;
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = '0秒';
        }
        if (loginBtn) {
            loginBtn.style.display = 'block';
        }
        if (userMenu) {
            userMenu.style.display = 'none';
        }
    }
}

// 格式化秒数为可读格式
function formatSeconds(seconds) {
    if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}小时${minutes}分钟`;
    } else if (seconds >= 60) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}分钟${secs}秒`;
    } else {
        return `${seconds}秒`;
    }
}

// 加载用户今日广告观看次数
async function loadUserAdsToday() {
    if (!currentUser) return;
    
    try {
        const token = localStorage.getItem('auth_token');
        const today = new Date().toISOString().split('T')[0];
        
        const response = await fetch(`${API_BASE_URL}/api/ad/today?date=${today}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            remainingAds = Math.max(0, 5 - data.count);
            const adsLeftEl = document.getElementById('adsLeft');
            if (adsLeftEl) {
                adsLeftEl.textContent = remainingAds;
            }
        }
    } catch (error) {
        console.error('加载广告次数失败:', error);
    }
}

// 显示/隐藏登录注册弹窗
function showAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
    switchTab('login');
}

function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function switchTab(tab) {
    // 更新标签按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 更新表单显示状态
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });
    
    if (tab === 'login') {
        const loginTab = document.querySelector('.tab-btn:first-child');
        if (loginTab) loginTab.classList.add('active');
        document.getElementById('loginForm').classList.add('active');
        
        // 自动填充上次登录的邮箱（如果有）
        const lastEmail = localStorage.getItem('last_login_email');
        if (lastEmail) {
            const loginEmail = document.getElementById('loginEmail');
            if (loginEmail) loginEmail.value = lastEmail;
        }
    } else {
        const registerTab = document.querySelector('.tab-btn:last-child');
        if (registerTab) registerTab.classList.add('active');
        document.getElementById('registerForm').classList.add('active');
    }
}

// 登录
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showAlert('请输入邮箱和密码', 'warning');
        return;
    }
    
    // 显示加载状态
    const loginBtn = document.querySelector('#loginForm .btn-primary');
    const originalText = loginBtn.textContent;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';
    loginBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('last_login_email', email);
            
            currentUser = data.user;
            updateUserInfo();
            closeAuthModal();
            
            showAlert('登录成功！', 'success');
            
            // 重新加载统计数据
            loadStats();
            
            // 加载今日广告次数
            await loadUserAdsToday();
            
            // 检查URL中的邀请码
            await processInviteCode();
        } else {
            showAlert(data.message || '登录失败，请检查邮箱和密码', 'error');
        }
    } catch (error) {
        console.error('登录失败:', error);
        showAlert('网络错误，请检查网络连接后重试', 'error');
    } finally {
        // 恢复按钮状态
        loginBtn.textContent = originalText;
        loginBtn.disabled = false;
    }
}

// 注册
async function register() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    if (!username || !email || !password || !confirmPassword) {
        showAlert('请填写所有必填项', 'warning');
        return;
    }
    
    if (password.length < 6) {
        showAlert('密码至少需要6位', 'warning');
        return;
    }
    
    if (password !== confirmPassword) {
        showAlert('两次输入的密码不一致', 'warning');
        return;
    }
    
    // 显示加载状态
    const registerBtn = document.querySelector('#registerForm .btn-primary');
    const originalText = registerBtn.textContent;
    registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 注册中...';
    registerBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAlert('注册成功！请登录', 'success');
            
            // 自动填充登录表单
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').value = password;
            
            // 切换到登录标签
            switchTab('login');
            
            // 处理邀请码（如果有）
            await processInviteCode();
        } else {
            showAlert(data.message || '注册失败，请稍后重试', 'error');
        }
    } catch (error) {
        console.error('注册失败:', error);
        showAlert('网络错误，请检查网络连接后重试', 'error');
    } finally {
        // 恢复按钮状态
        registerBtn.textContent = originalText;
        registerBtn.disabled = false;
    }
}

// 登出
function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('auth_token');
        currentUser = null;
        updateUserInfo();
        showAlert('已退出登录', 'info');
        
        // 重置广告次数
        remainingAds = 5;
        const adsLeftEl = document.getElementById('adsLeft');
        if (adsLeftEl) {
            adsLeftEl.textContent = remainingAds;
        }
    }
}

// 加载统计信息
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/stats`);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                document.getElementById('userCount').textContent = `${data.users}+`;
                document.getElementById('videoCount').textContent = `${data.videos}+`;
                document.getElementById('totalTime').textContent = `${data.total_seconds}+`;
            }
        }
    } catch (error) {
        console.error('加载统计失败:', error);
        // 使用默认值
        document.getElementById('userCount').textContent = '1000+';
        document.getElementById('videoCount').textContent = '5000+';
        document.getElementById('totalTime').textContent = '100000+';
    }
}

// 滚动到生成区域
function scrollToGenerate() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    const generateSection = document.getElementById('generate');
    if (generateSection) {
        generateSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// 使用示例提示词
function useExample(prompt) {
    const textarea = document.getElementById('videoPrompt');
    if (textarea) {
        textarea.value = prompt;
        updateCostTime();
        textarea.focus();
    }
}

// 更新字数统计
function updateWordCount() {
    const textarea = document.getElementById('videoPrompt');
    if (!textarea) return;
    
    const wordCount = textarea.value.length;
    const wordCountEl = document.getElementById('wordCount');
    if (wordCountEl) {
        wordCountEl.textContent = wordCount;
        
        // 根据字数改变颜色
        if (wordCount > 500) {
            wordCountEl.style.color = '#ef4444'; // 红色
        } else if (wordCount > 200) {
            wordCountEl.style.color = '#f59e0b'; // 橙色
        } else {
            wordCountEl.style.color = '#6b7280'; // 灰色
        }
    }
}

// 更新消耗时间计算
function updateCostTime() {
    const textarea = document.getElementById('videoPrompt');
    const videoLength = document.getElementById('videoLength');
    const resolutionRadios = document.querySelectorAll('input[name="resolution"]:checked');
    
    if (!textarea || !videoLength || resolutionRadios.length === 0) {
        return;
    }
    
    const prompt = textarea.value;
    const length = parseInt(videoLength.value) || 10;
    const resolution = resolutionRadios[0].value || '720p';
    const wordCount = prompt.length;
    
    // 基础计算：每10秒消耗10秒时长
    let cost = length;
    
    // 分辨率加成
    if (resolution === '1080p') {
        cost = Math.ceil(cost * 1.5);
    }
    
    // 字数加成（超过100字增加消耗）
    if (wordCount > 100) {
        cost += Math.floor(wordCount / 100);
    }
    
    // 确保最少消耗10秒
    cost = Math.max(10, cost);
    
    // 更新显示
    const costTimeEl = document.getElementById('costTime');
    const finalCostEl = document.getElementById('finalCost');
    
    if (costTimeEl) costTimeEl.textContent = `${cost}秒`;
    if (finalCostEl) finalCostEl.textContent = cost;
    
    // 更新用户剩余时间显示
    if (currentUser) {
        const currentTimeEl = document.getElementById('currentTime');
        if (currentTimeEl) {
            currentTimeEl.textContent = formatSeconds(currentUser.remaining_seconds);
        }
    }
    
    // 更新字数统计
    updateWordCount();
    
    // 检查用户是否有足够时长
    checkUserBalance(cost);
}

// 检查用户余额
function checkUserBalance(requiredSeconds) {
    if (!currentUser) return;
    
    const generateBtn = document.getElementById('generateBtn');
    if (!generateBtn) return;
    
    if (currentUser.remaining_seconds < requiredSeconds && !currentUser.is_premium) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> 时长不足';
        generateBtn.title = `需要${requiredSeconds}秒，您当前剩余${currentUser.remaining_seconds}秒`;
    } else {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-magic"></i> 生成视频';
        generateBtn.title = '点击生成视频';
    }
}

// 检查违规词
async function checkBannedWords(prompt) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/video/check-banned-words`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: prompt })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.has_banned_words) {
                showAlert('提示词包含违规内容，请修改后重试', 'warning');
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('检查违规词失败:', error);
        return false;
    }
}

// 生成视频
async function generateVideo() {
    // 检查登录状态
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    const prompt = document.getElementById('videoPrompt').value.trim();
    const videoLength = parseInt(document.getElementById('videoLength').value) || 10;
    const resolutionRadios = document.querySelectorAll('input[name="resolution"]:checked');
    const addWatermark = document.getElementById('addWatermark')?.checked ?? true;
    
    if (resolutionRadios.length === 0) {
        showAlert('请选择视频分辨率', 'warning');
        return;
    }
    
    const resolution = resolutionRadios[0].value;
    
    // 验证输入
    if (!prompt) {
        showAlert('请输入视频描述', 'warning');
        return;
    }
    
    if (prompt.length < 10) {
        showAlert('视频描述至少需要10个字符', 'warning');
        return;
    }
    
    // 计算消耗
    let cost = parseInt(document.getElementById('finalCost').textContent) || 10;
    
    // 检查剩余时长（非会员）
    if (currentUser.remaining_seconds < cost && !currentUser.is_premium) {
        showAlert(`时长不足！需要${cost}秒，您当前剩余${currentUser.remaining_seconds}秒`, 'error');
        return;
    }
    
    // 检查违规词
    if (await checkBannedWords(prompt)) {
        return;
    }
    
    // 显示生成进度
    document.getElementById('generateBtn').disabled = true;
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('resultSection').style.display = 'none';
    
    // 重置进度条
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '初始化中...';
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/api/video/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                prompt,
                total_seconds: videoLength,
                resolution,
                has_watermark: addWatermark,
                user_id: currentUser.id
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentVideoId = data.video_id;
            
            // 更新用户剩余时长（如果是实时扣除）
            if (data.remaining_seconds !== undefined) {
                currentUser.remaining_seconds = data.remaining_seconds;
                updateUserInfo();
            }
            
            // 模拟视频生成进度
            simulateVideoGeneration(data.segments || []);
            
            // 开始轮询视频生成状态
            startPollingVideoStatus(currentVideoId);
        } else {
            showAlert(data.message || '生成失败，请稍后重试', 'error');
            document.getElementById('generateBtn').disabled = false;
            document.getElementById('progressSection').style.display = 'none';
        }
    } catch (error) {
        console.error('生成视频失败:', error);
        showAlert('网络错误，请检查网络连接后重试', 'error');
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('progressSection').style.display = 'none';
    }
}

// 模拟视频生成进度
function simulateVideoGeneration(segments) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const segmentProgress = document.getElementById('segmentProgress');
    
    if (!progressFill || !progressText || !segmentProgress) return;
    
    // 清空分段进度
    segmentProgress.innerHTML = '';
    
    // 如果没有分段信息，创建默认分段
    if (!segments || segments.length === 0) {
        const totalSeconds = parseInt(document.getElementById('videoLength').value) || 10;
        const segmentCount = Math.ceil(totalSeconds / 10);
        
        segments = [];
        for (let i = 0; i < segmentCount; i++) {
            const start = i * 10;
            const end = Math.min((i + 1) * 10, totalSeconds);
            segments.push({
                segment: i + 1,
                start,
                end,
                status: 'pending'
            });
        }
    }
    
    const totalSegments = segments.length;
    let completedSegments = 0;
    
    // 创建分段进度显示
    segments.forEach((segment, index) => {
        const segmentItem = document.createElement('div');
        segmentItem.className = 'segment-item';
        segmentItem.textContent = `${segment.start}s-${segment.end}s`;
        segmentItem.id = `segment-${index}`;
        segmentProgress.appendChild(segmentItem);
    });
    
    // 更新进度
    const updateProgress = () => {
        completedSegments++;
        const progress = Math.min((completedSegments / totalSegments) * 100, 100);
        progressFill.style.width = `${progress}%`;
        
        // 更新分段状态
        const segmentItem = document.getElementById(`segment-${completedSegments-1}`);
        if (segmentItem) {
            segmentItem.classList.add('completed');
        }
        
        if (completedSegments === totalSegments) {
            progressText.textContent = '正在剪辑合成最终视频...';
            setTimeout(() => {
                progressText.textContent = '视频生成完成！';
            }, 2000);
        } else {
            progressText.textContent = `正在生成第 ${completedSegments}/${totalSegments} 段...`;
        }
    };
    
    // 开始进度模拟
    let progressInterval = setInterval(() => {
        if (completedSegments < totalSegments) {
            updateProgress();
        } else {
            clearInterval(progressInterval);
        }
    }, 2000);
}

// 开始轮询视频生成状态
function startPollingVideoStatus(videoId) {
    if (videoGenerationInterval) {
        clearInterval(videoGenerationInterval);
    }
    
    let attempts = 0;
    const maxAttempts = 30; // 最多尝试30次（1分钟）
    
    videoGenerationInterval = setInterval(async () => {
        attempts++;
        
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_BASE_URL}/api/video/status?id=${videoId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.video && data.video.status === 'completed') {
                    // 视频生成完成
                    clearInterval(videoGenerationInterval);
                    
                    // 等待2秒后显示结果
                    setTimeout(() => {
                        showVideoResult(data.video);
                    }, 2000);
                } else if (data.video && data.video.status === 'failed') {
                    // 视频生成失败
                    clearInterval(videoGenerationInterval);
                    showAlert('视频生成失败，时长已返还', 'error');
                    document.getElementById('progressSection').style.display = 'none';
                    document.getElementById('generateBtn').disabled = false;
                    
                    // 更新用户剩余时长
                    if (currentUser && data.video.seconds_refunded) {
                        currentUser.remaining_seconds += data.video.seconds_refunded;
                        updateUserInfo();
                    }
                }
            }
        } catch (error) {
            console.error('轮询视频状态失败:', error);
        }
        
        // 超过最大尝试次数
        if (attempts >= maxAttempts) {
            clearInterval(videoGenerationInterval);
            showAlert('视频生成超时，请稍后查看结果', 'warning');
            document.getElementById('progressSection').style.display = 'none';
            document.getElementById('generateBtn').disabled = false;
        }
    }, 2000); // 每2秒轮询一次
}

// 显示视频结果
function showVideoResult(videoData) {
    const progressSection = document.getElementById('progressSection');
    const resultSection = document.getElementById('resultSection');
    const generateBtn = document.getElementById('generateBtn');
    
    if (progressSection) progressSection.style.display = 'none';
    if (resultSection) resultSection.style.display = 'block';
    if (generateBtn) generateBtn.disabled = false;
    
    // 更新视频播放器
    const videoPlayer = document.getElementById('videoPlayer');
    if (videoPlayer) {
        // 如果有视频URL，显示真实视频
        if (videoData.video_url) {
            videoPlayer.innerHTML = `
                <video controls style="width:100%;height:100%;border-radius:10px;">
                    <source src="${videoData.video_url}" type="video/mp4">
                    您的浏览器不支持视频播放
                </video>
                ${videoData.has_watermark ? 
                    '<div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.7);color:white;padding:5px 10px;border-radius:5px;font-size:12px;">AI生成内容</div>' : 
                    ''
                }
            `;
        } else {
            // 模拟视频展示
            videoPlayer.innerHTML = `
                <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;color:#fff;border-radius:10px;">
                    <i class="fas fa-video" style="font-size:48px;margin-bottom:20px;"></i>
                    <h3>视频生成成功！</h3>
                    <p>分辨率: ${videoData.resolution || '720P'}</p>
                    <p>时长: ${videoData.total_seconds || 10}秒</p>
                    <p>提示词: ${videoData.prompt?.substring(0, 50)}${videoData.prompt?.length > 50 ? '...' : ''}</p>
                </div>
            `;
        }
    }
    
    // 更新用户剩余时长（从服务器返回的最新数据）
    if (currentUser && videoData.remaining_seconds !== undefined) {
        currentUser.remaining_seconds = videoData.remaining_seconds;
        updateUserInfo();
    }
}

// 下载视频
function downloadVideo() {
    if (!currentVideoId) {
        showAlert('没有可下载的视频', 'warning');
        return;
    }
    
    // 模拟下载过程
    showAlert('开始下载视频...', 'info');
    
    // 创建模拟下载链接
    setTimeout(() => {
        const link = document.createElement('a');
        link.href = `https://example.com/videos/${currentVideoId}.mp4`;
        link.download = `ai-video-${currentVideoId}.mp4`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showAlert('视频下载已开始', 'success');
    }, 1000);
}

// 再次生成
function generateAgain() {
    document.getElementById('resultSection').style.display = 'none';
    updateCostTime();
    
    // 滚动到生成区域顶部
    const generateSection = document.getElementById('generate');
    if (generateSection) {
        generateSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// 分享视频
function shareVideo() {
    if (!currentVideoId) {
        showAlert('没有可分享的视频', 'warning');
        return;
    }
    
    const shareUrl = `${window.location.origin}?video=${currentVideoId}`;
    const shareText = '看看我用AI生成的视频！';
    
    if (navigator.share) {
        navigator.share({
            title: 'AI生成的视频',
            text: shareText,
            url: shareUrl
        }).catch(error => {
            console.log('分享取消:', error);
        });
    } else {
        // 回退方案：复制链接到剪贴板
        navigator.clipboard.writeText(shareUrl).then(() => {
            showAlert('链接已复制到剪贴板！', 'success');
        }).catch(() => {
            // 备用方案
            const tempInput = document.createElement('input');
            tempInput.value = shareUrl;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            showAlert('链接已复制到剪贴板！', 'success');
        });
    }
}

// 观看广告
async function watchAd() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    if (remainingAds <= 0) {
        showAlert('今日观看广告次数已用完', 'warning');
        return;
    }
    
    // 显示广告弹窗
    document.getElementById('adModal').style.display = 'flex';
    startAdCountdown();
}

// 开始广告倒计时
function startAdCountdown() {
    const countdownElement = document.getElementById('adCountdown');
    const closeButton = document.getElementById('closeAdBtn');
    
    if (!countdownElement || !closeButton) return;
    
    let seconds = 15;
    
    closeButton.disabled = true;
    closeButton.innerHTML = '<i class="fas fa-clock"></i> 请等待广告结束';
    
    // 清除之前的计时器
    if (adTimer) {
        clearInterval(adTimer);
    }
    
    adTimer = setInterval(() => {
        seconds--;
        countdownElement.textContent = seconds;
        
        if (seconds <= 0) {
            clearInterval(adTimer);
            closeButton.disabled = false;
            closeButton.innerHTML = '<i class="fas fa-gift"></i> 获取时长';
        }
    }, 1000);
}

// 关闭广告弹窗并发放奖励
async function closeAdModal() {
    // 清除计时器
    if (adTimer) {
        clearInterval(adTimer);
        adTimer = null;
    }
    
    // 关闭弹窗
    document.getElementById('adModal').style.display = 'none';
    
    // 检查是否已经可以获取奖励
    const closeButton = document.getElementById('closeAdBtn');
    if (closeButton && closeButton.disabled) {
        showAlert('请等待广告播放完成', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/api/ad/watch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            remainingAds--;
            document.getElementById('adsLeft').textContent = remainingAds;
            
            // 更新用户剩余时长
            if (currentUser) {
                currentUser.remaining_seconds += data.seconds_earned;
                updateUserInfo();
            }
            
            showAlert(`恭喜！获得${data.seconds_earned}秒时长`, 'success');
        } else {
            showAlert(data.message || '获取时长失败，请稍后重试', 'error');
        }
    } catch (error) {
        console.error('观看广告失败:', error);
        showAlert('网络错误，请检查网络连接后重试', 'error');
    }
}

// 生成邀请链接
function generateInviteLink() {
    if (!currentUser) {
        const inviteLink = document.getElementById('inviteLink');
        if (inviteLink) {
            inviteLink.value = `${window.location.origin}?ref=guest`;
        }
        return;
    }
    
    const userId = currentUser.id || Math.random().toString(36).substr(2, 9);
    const inviteLink = `${window.location.origin}?ref=${userId}`;
    document.getElementById('inviteLink').value = inviteLink;
}

// 复制邀请链接
function copyInviteLink() {
    const inviteLink = document.getElementById('inviteLink');
    if (!inviteLink) return;
    
    inviteLink.select();
    inviteLink.setSelectionRange(0, 99999); // 移动设备支持
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showAlert('邀请链接已复制到剪贴板', 'success');
        } else {
            // 备用方案
            navigator.clipboard.writeText(inviteLink.value).then(() => {
                showAlert('邀请链接已复制到剪贴板', 'success');
            }).catch(() => {
                showAlert('复制失败，请手动选择并复制', 'error');
            });
        }
    } catch (err) {
        console.error('复制失败:', err);
        showAlert('复制失败，请手动选择并复制', 'error');
    }
}

// 检测URL中的邀请码
function detectInviteCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    
    if (refCode && refCode !== 'guest') {
        localStorage.setItem('invite_code', refCode);
    }
}

// 处理邀请码
async function processInviteCode() {
    const inviteCode = localStorage.getItem('invite_code');
    if (!inviteCode || !currentUser) return;
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/api/user/process-invite`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ invite_code: inviteCode })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showAlert(`邀请成功！获得${data.reward_seconds}秒时长`, 'success');
                
                // 更新用户剩余时长
                if (currentUser) {
                    currentUser.remaining_seconds += data.reward_seconds;
                    updateUserInfo();
                }
                
                // 清除邀请码
                localStorage.removeItem('invite_code');
            }
        }
    } catch (error) {
        console.error('处理邀请码失败:', error);
    }
}

// 显示套餐价格
function showPricing() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    const pricingSection = document.getElementById('pricing');
    if (pricingSection) {
        pricingSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// 充值
function recharge(packageType) {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    const packages = {
        'basic': { name: '体验包', amount: 5, seconds: 300 },
        'professional': { name: '专业包', amount: 39, seconds: 2000 },
        'unlimited': { name: '无限包', amount: 99, seconds: 999999 }
    };
    
    const selectedPackage = packages[packageType];
    if (!selectedPackage) {
        showAlert('无效的套餐类型', 'error');
        return;
    }
    
    // 更新支付详情
    const paymentDetails = document.getElementById('paymentDetails');
    if (paymentDetails) {
        paymentDetails.innerHTML = `
            <div class="payment-summary">
                <h4>${selectedPackage.name}</h4>
                <div class="payment-amount">
                    <span>金额：</span>
                    <strong>¥${selectedPackage.amount}</strong>
                </div>
                <div class="payment-seconds">
                    <span>获得时长：</span>
                    <strong>${selectedPackage.seconds}秒</strong>
                </div>
                <div class="package-description">
                    <small>${packageType === 'unlimited' ? '无限生成，优先处理，去水印' : '标准生成'}</small>
                </div>
                <input type="hidden" id="selectedPackage" value="${packageType}">
            </div>
        `;
    }
    
    // 显示支付弹窗
    document.getElementById('paymentModal').style.display = 'flex';
}

// 处理支付
async function processPayment() {
    const packageType = document.getElementById('selectedPackage')?.value;
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    
    if (!packageType || !paymentMethod) {
        showAlert('请选择支付方式', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/api/payment/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                package_type: packageType,
                payment_method: paymentMethod
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            closePaymentModal();
            
            // 更新用户信息
            if (currentUser) {
                const packages = {
                    'basic': { seconds: 300 },
                    'professional': { seconds: 2000 },
                    'unlimited': { seconds: 999999, premium: true }
                };
                
                const packageInfo = packages[packageType];
                if (packageInfo) {
                    currentUser.remaining_seconds += packageInfo.seconds;
                    if (packageInfo.premium) {
                        currentUser.is_premium = 1;
                    }
                    updateUserInfo();
                }
            }
            
            showAlert('支付成功！时长已添加到您的账户', 'success');
        } else {
            showAlert(data.message || '支付失败，请稍后重试', 'error');
        }
    } catch (error) {
        console.error('支付失败:', error);
        showAlert('网络错误，请检查网络连接后重试', 'error');
    }
}

// 关闭支付弹窗
function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
}

// 显示提现弹窗
function showWithdrawModal() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    // 检查是否有可提现余额
    const availableBalance = parseFloat(document.getElementById('availableBalance')?.textContent || 0);
    if (availableBalance < 10) {
        showAlert('可提现金额不足10元', 'warning');
        return;
    }
    
    document.getElementById('withdrawModal').style.display = 'flex';
}

// 关闭提现弹窗
function closeWithdrawModal() {
    document.getElementById('withdrawModal').style.display = 'none';
}

// 更新提现手续费
function updateWithdrawFee() {
    const amountInput = document.getElementById('withdrawAmount');
    const amount = parseFloat(amountInput?.value) || 0;
    
    if (amount < 10) {
        showAlert('提现金额最少10元', 'warning');
        return;
    }
    
    const fee = amount * 0.02; // 2%手续费
    const actual = amount - fee;
    
    document.getElementById('withdrawFee').textContent = fee.toFixed(2);
    document.getElementById('actualAmount').textContent = actual.toFixed(2);
}

// 提交提现申请
async function submitWithdraw() {
    const amount = parseFloat(document.getElementById('withdrawAmount')?.value) || 0;
    const method = document.getElementById('withdrawMethod')?.value;
    const account = document.getElementById('withdrawAccount')?.value;
    
    if (!amount || amount < 10) {
        showAlert('提现金额最少10元', 'warning');
        return;
    }
    
    if (!account) {
        showAlert('请输入收款账号', 'warning');
        return;
    }
    
    const availableBalance = parseFloat(document.getElementById('availableBalance')?.textContent || 0);
    if (amount > availableBalance) {
        showAlert('提现金额超过可提现余额', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/api/user/withdraw`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                payment_method: method,
                account_number: account
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            closeWithdrawModal();
            showAlert('提现申请已提交，我们将在1-3个工作日内处理', 'success');
            
            // 更新可提现余额显示
            if (currentUser) {
                currentUser.total_withdraw_amount = (currentUser.total_withdraw_amount || 0) + amount;
                const availableBalanceEl = document.getElementById('availableBalance');
                if (availableBalanceEl) {
                    const newBalance = (currentUser.total_recharge_amount || 0) - currentUser.total_withdraw_amount;
                    availableBalanceEl.textContent = newBalance.toFixed(2);
                }
            }
        } else {
            showAlert(data.message || '提现申请失败，请稍后重试', 'error');
        }
    } catch (error) {
        console.error('提现失败:', error);
        showAlert('网络错误，请检查网络连接后重试', 'error');
    }
}

// 移动端菜单切换
function toggleMobileMenu() {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) {
        navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
    }
}

// 显示提示信息
function showAlert(message, type = 'info') {
    // 移除现有的提示
    const existingAlert = document.querySelector('.custom-alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    // 创建提示元素
    const alert = document.createElement('div');
    alert.className = `custom-alert alert-${type}`;
    alert.innerHTML = `
        <div class="alert-content">
            <i class="fas fa-${getAlertIcon(type)}"></i>
            <span>${message}</span>
            <button class="alert-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(alert);
    
    // 自动消失（5秒后）
    setTimeout(() => {
        if (alert.parentElement) {
            alert.remove();
        }
    }, 5000);
    
    // 添加样式
    if (!document.querySelector('#alert-styles')) {
        const style = document.createElement('style');
        style.id = 'alert-styles';
        style.textContent = `
            .custom-alert {
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 9999;
                min-width: 300px;
                max-width: 500px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideIn 0.3s ease-out;
            }
            
            .alert-content {
                display: flex;
                align-items: center;
                padding: 16px;
                color: white;
                border-radius: 8px;
            }
            
            .alert-info { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
            .alert-success { background: linear-gradient(135deg, #10b981, #059669); }
            .alert-warning { background: linear-gradient(135deg, #f59e0b, #d97706); }
            .alert-error { background: linear-gradient(135deg, #ef4444, #dc2626); }
            
            .alert-content i:first-child {
                margin-right: 12px;
                font-size: 20px;
            }
            
            .alert-content span {
                flex: 1;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .alert-close {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                margin-left: 12px;
                opacity: 0.8;
                transition: opacity 0.2s;
            }
            
            .alert-close:hover {
                opacity: 1;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @media (max-width: 768px) {
                .custom-alert {
                    left: 20px;
                    right: 20px;
                    min-width: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// 获取提示图标
function getAlertIcon(type) {
    switch(type) {
        case 'success': return 'check-circle';
        case 'warning': return 'exclamation-triangle';
        case 'error': return 'exclamation-circle';
        default: return 'info-circle';
    }
}

// 页面加载完成后执行
window.addEventListener('load', function() {
    // 添加一些交互效果
    const earnCards = document.querySelectorAll('.earn-card');
    earnCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    // 添加滚动监听
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            navbar.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        }
    });
    
    // 初始化工具提示
    initTooltips();
});

// 初始化工具提示
function initTooltips() {
    const elementsWithTitle = document.querySelectorAll('[title]');
    elementsWithTitle.forEach(element => {
        element.addEventListener('mouseenter', function(e) {
            const title = this.getAttribute('title');
            if (!title) return;
            
            const tooltip = document.createElement('div');
            tooltip.className = 'custom-tooltip';
            tooltip.textContent = title;
            document.body.appendChild(tooltip);
            
            const rect = this.getBoundingClientRect();
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.style.top = `${rect.top - 10}px`;
            tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
            
            this.setAttribute('data-original-title', title);
            this.removeAttribute('title');
        });
        
        element.addEventListener('mouseleave', function() {
            const tooltip = document.querySelector('.custom-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
            
            const originalTitle = this.getAttribute('data-original-title');
            if (originalTitle) {
                this.setAttribute('title', originalTitle);
                this.removeAttribute('data-original-title');
            }
        });
    });
    
    // 添加工具提示样式
    if (!document.querySelector('#tooltip-styles')) {
        const style = document.createElement('style');
        style.id = 'tooltip-styles';
        style.textContent = `
            .custom-tooltip {
                position: fixed;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 9999;
                pointer-events: none;
                white-space: nowrap;
                max-width: 200px;
                text-align: center;
            }
            
            .custom-tooltip::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                margin-left: -5px;
                border-width: 5px;
                border-style: solid;
                border-color: rgba(0, 0, 0, 0.8) transparent transparent transparent;
            }
        `;
        document.head.appendChild(style);
    }
}

// 页面卸载前清理
window.addEventListener('beforeunload', function() {
    if (adTimer) {
        clearInterval(adTimer);
    }
    
    if (videoGenerationInterval) {
        clearInterval(videoGenerationInterval);
    }
});

// 键盘快捷键支持
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + Enter 生成视频
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement.id === 'videoPrompt') {
            e.preventDefault();
            generateVideo();
        }
    }
    
    // ESC 关闭所有弹窗
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.style.display = 'none';
        });
    }
});
