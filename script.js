// 全局变量
let currentUser = null;
let currentVideoId = null;
let adTimer = null;
let remainingAds = 5;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    updateCostTime();
    loadStats();
    generateInviteLink();
    
    // 监听提现金额变化
    const withdrawAmount = document.getElementById('withdrawAmount');
    if (withdrawAmount) {
        withdrawAmount.addEventListener('input', updateWithdrawFee);
    }
});

// 检查认证状态
async function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                updateUserInfo();
            } else {
                localStorage.removeItem('token');
            }
        } catch (error) {
            console.error('认证检查失败:', error);
        }
    }
}

// 更新用户信息显示
function updateUserInfo() {
    if (currentUser) {
        document.getElementById('remainingTime').innerHTML = 
            `剩余时长: <strong>${currentUser.remaining_seconds}秒</strong>`;
        document.getElementById('currentTime').textContent = 
            currentUser.remaining_seconds + '秒';
        document.getElementById('userName').textContent = currentUser.username;
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('userMenu').style.display = 'block';
        
        // 更新可提现金额
        if (currentUser.total_recharge_amount && currentUser.total_withdraw_amount) {
            const available = currentUser.total_recharge_amount - currentUser.total_withdraw_amount;
            document.getElementById('availableBalance').textContent = available.toFixed(2);
        }
    } else {
        document.getElementById('remainingTime').innerHTML = 
            `剩余时长: <strong>0秒</strong>`;
        document.getElementById('currentTime').textContent = '0秒';
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('userMenu').style.display = 'none';
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
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });
    
    if (tab === 'login') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('loginForm').classList.add('active');
    } else {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('registerForm').classList.add('active');
    }
}

// 登录
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('请输入邮箱和密码');
        return;
    }
    
    try {
        const response = await fetch('/api/user/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            updateUserInfo();
            closeAuthModal();
            alert('登录成功！');
            loadStats();
        } else {
            alert(data.message || '登录失败');
        }
    } catch (error) {
        console.error('登录失败:', error);
        alert('网络错误，请重试');
    }
}

// 注册
async function register() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    if (!username || !email || !password) {
        alert('请填写所有必填项');
        return;
    }
    
    if (password.length < 6) {
        alert('密码至少需要6位');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('两次输入的密码不一致');
        return;
    }
    
    try {
        const response = await fetch('/api/user/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('注册成功！请登录');
            switchTab('login');
            // 自动填充登录表单
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').value = password;
        } else {
            alert(data.message || '注册失败');
        }
    } catch (error) {
        console.error('注册失败:', error);
        alert('网络错误，请重试');
    }
}

// 登出
function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    updateUserInfo();
    alert('已退出登录');
}

// 加载统计信息
async function loadStats() {
    try {
        // 这里可以调用API获取统计数据
        // 暂时使用模拟数据
        document.getElementById('userCount').textContent = '1000+';
        document.getElementById('videoCount').textContent = '5000+';
        document.getElementById('totalTime').textContent = '100000+';
    } catch (error) {
        console.error('加载统计失败:', error);
    }
}

// 滚动到生成区域
function scrollToGenerate() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    document.getElementById('generate').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

// 使用示例提示词
function useExample(prompt) {
    document.getElementById('videoPrompt').value = prompt;
    updateCostTime();
}

// 更新字数统计
function updateWordCount() {
    const textarea = document.getElementById('videoPrompt');
    const wordCount = textarea.value.length;
    document.getElementById('wordCount').textContent = wordCount;
}

// 更新消耗时间计算
function updateCostTime() {
    const textarea = document.getElementById('videoPrompt');
    const videoLength = parseInt(document.getElementById('videoLength').value);
    const resolution = document.querySelector('input[name="resolution"]:checked').value;
    const wordCount = textarea.value.length;
    
    // 基础计算：每10秒消耗10秒时长
    let cost = videoLength;
    
    // 分辨率加成
    if (resolution === '1080p') {
        cost = Math.ceil(cost * 1.5);
    }
    
    // 字数加成（超过100字增加消耗）
    if (wordCount > 100) {
        cost += Math.floor(wordCount / 100);
    }
    
    document.getElementById('costTime').textContent = cost + '秒';
    document.getElementById('finalCost').textContent = cost;
    
    // 更新剩余时间显示
    if (currentUser) {
        document.getElementById('currentTime').textContent = currentUser.remaining_seconds + '秒';
    }
    
    updateWordCount();
}

// 生成视频
async function generateVideo() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    const prompt = document.getElementById('videoPrompt').value.trim();
    const videoLength = parseInt(document.getElementById('videoLength').value);
    const resolution = document.querySelector('input[name="resolution"]:checked').value;
    const addWatermark = document.getElementById('addWatermark').checked;
    
    if (!prompt) {
        alert('请输入视频描述');
        return;
    }
    
    // 计算消耗
    let cost = parseInt(document.getElementById('finalCost').textContent);
    
    if (currentUser.remaining_seconds < cost) {
        alert(`时长不足！需要${cost}秒，您当前剩余${currentUser.remaining_seconds}秒`);
        return;
    }
    
    // 检查违规词
    if (await checkBannedWords(prompt)) {
        alert('提示词包含违规内容，请修改后重试');
        return;
    }
    
    // 显示进度
    document.getElementById('generateBtn').disabled = true;
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('resultSection').style.display = 'none';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/video/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                prompt,
                total_seconds: videoLength,
                resolution,
                has_watermark: addWatermark
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentVideoId = data.video_id;
            // 模拟分段生成进度
            simulateVideoGeneration(data.segments);
        } else {
            alert(data.message || '生成失败');
            document.getElementById('generateBtn').disabled = false;
        }
    } catch (error) {
        console.error('生成失败:', error);
        alert('网络错误，请重试');
        document.getElementById('generateBtn').disabled = false;
    }
}

// 模拟视频生成进度
function simulateVideoGeneration(segments) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const segmentProgress = document.getElementById('segmentProgress');
    
    segmentProgress.innerHTML = '';
    let totalSegments = segments.length;
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
        const progress = (completedSegments / totalSegments) * 100;
        progressFill.style.width = `${progress}%`;
        
        // 更新分段状态
        const segmentItem = document.getElementById(`segment-${completedSegments-1}`);
        if (segmentItem) {
            segmentItem.classList.add('completed');
        }
        
        if (completedSegments === totalSegments) {
            progressText.textContent = '正在剪辑合成...';
            setTimeout(() => {
                progressText.textContent = '完成！正在加载视频...';
                setTimeout(showVideoResult, 1000);
            }, 2000);
        } else {
            progressText.textContent = `正在生成第 ${completedSegments}/${totalSegments} 段...`;
            setTimeout(updateProgress, 1500);
        }
    };
    
    progressText.textContent = '正在初始化...';
    setTimeout(() => {
        progressText.textContent = '开始生成第 1 段...';
        setTimeout(updateProgress, 1000);
    }, 1000);
}

// 显示视频结果
function showVideoResult() {
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultSection').style.display = 'block';
    
    // 模拟视频播放器
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.innerHTML = `
        <video controls style="width:100%;height:100%">
            <source src="https://example.com/video.mp4" type="video/mp4">
            您的浏览器不支持视频播放
        </video>
        <div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.7);color:white;padding:5px 10px;border-radius:5px;font-size:12px;">
            AI生成内容
        </div>
    `;
    
    // 更新用户剩余时长
    if (currentUser) {
        const cost = parseInt(document.getElementById('finalCost').textContent);
        currentUser.remaining_seconds -= cost;
        updateUserInfo();
    }
    
    document.getElementById('generateBtn').disabled = false;
}

// 下载视频
function downloadVideo() {
    // 这里应该调用API获取真实下载链接
    alert('开始下载视频...');
    // 模拟下载
    const link = document.createElement('a');
    link.href = 'https://example.com/video.mp4';
    link.download = 'ai-video.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 再次生成
function generateAgain() {
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('videoPrompt').value = '';
    updateCostTime();
}

// 分享视频
function shareVideo() {
    if (navigator.share) {
        navigator.share({
            title: 'AI生成的视频',
            text: '看看我用AI生成的视频！',
            url: window.location.href
        });
    } else {
        navigator.clipboard.writeText(window.location.href);
        alert('链接已复制到剪贴板！');
    }
}

// 检查违规词
async function checkBannedWords(prompt) {
    try {
        const response = await fetch('/api/video/check-banned-words', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: prompt })
        });
        
        const data = await response.json();
        return data.has_banned_words;
    } catch (error) {
        console.error('检查违规词失败:', error);
        return false;
    }
}

// 观看广告
async function watchAd() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    if (remainingAds <= 0) {
        alert('今日观看广告次数已用完');
        return;
    }
    
    document.getElementById('adModal').style.display = 'flex';
    startAdCountdown();
}

// 开始广告倒计时
function startAdCountdown() {
    const countdownElement = document.getElementById('adCountdown');
    const closeButton = document.getElementById('closeAdBtn');
    let seconds = 15;
    
    closeButton.disabled = true;
    closeButton.textContent = '请等待广告结束';
    
    adTimer = setInterval(() => {
        seconds--;
        countdownElement.textContent = seconds;
        
        if (seconds <= 0) {
            clearInterval(adTimer);
            closeButton.disabled = false;
            closeButton.textContent = '获取时长';
        }
    }, 1000);
}

// 关闭广告弹窗并发放奖励
async function closeAdModal() {
    clearInterval(adTimer);
    document.getElementById('adModal').style.display = 'none';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/ad/watch', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            remainingAds--;
            document.getElementById('adsLeft').textContent = remainingAds;
            
            if (currentUser) {
                currentUser.remaining_seconds += data.seconds_earned;
                updateUserInfo();
            }
            
            alert(`恭喜！获得${data.seconds_earned}秒时长`);
        } else {
            alert(data.message || '获取时长失败');
        }
    } catch (error) {
        console.error('观看广告失败:', error);
        alert('网络错误，请重试');
    }
}

// 生成邀请链接
function generateInviteLink() {
    const userId = currentUser ? currentUser.id : Math.random().toString(36).substr(2, 9);
    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}?ref=${userId}`;
    document.getElementById('inviteLink').value = inviteLink;
}

// 复制邀请链接
function copyInviteLink() {
    const inviteLink = document.getElementById('inviteLink');
    inviteLink.select();
    document.execCommand('copy');
    alert('邀请链接已复制到剪贴板');
}

// 显示套餐价格
function showPricing() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    document.getElementById('pricing').scrollIntoView({ 
        behavior: 'smooth' 
    });
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
    
    document.getElementById('paymentDetails').innerHTML = `
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
            <input type="hidden" id="selectedPackage" value="${packageType}">
        </div>
    `;
    
    document.getElementById('paymentModal').style.display = 'flex';
}

// 处理支付
async function processPayment() {
    const packageType = document.getElementById('selectedPackage').value;
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/payment/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                package_type: packageType,
                payment_method: paymentMethod
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closePaymentModal();
            
            if (currentUser) {
                const packages = {
                    'basic': { seconds: 300 },
                    'professional': { seconds: 2000 },
                    'unlimited': { seconds: 999999 }
                };
                
                currentUser.remaining_seconds += packages[packageType].seconds;
                if (packageType === 'unlimited') {
                    currentUser.is_premium = 1;
                }
                updateUserInfo();
            }
            
            alert('支付成功！时长已添加到您的账户');
        } else {
            alert(data.message || '支付失败');
        }
    } catch (error) {
        console.error('支付失败:', error);
        alert('网络错误，请重试');
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
    
    document.getElementById('withdrawModal').style.display = 'flex';
}

// 关闭提现弹窗
function closeWithdrawModal() {
    document.getElementById('withdrawModal').style.display = 'none';
}

// 更新提现手续费
function updateWithdrawFee() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value) || 0;
    const fee = amount * 0.02; // 2%手续费
    const actual = amount - fee;
    
    document.getElementById('withdrawFee').textContent = fee.toFixed(2);
    document.getElementById('actualAmount').textContent = actual.toFixed(2);
}

// 提交提现申请
async function submitWithdraw() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const method = document.getElementById('withdrawMethod').value;
    const account = document.getElementById('withdrawAccount').value;
    
    if (!amount || amount < 10) {
        alert('提现金额最少10元');
        return;
    }
    
    if (!account) {
        alert('请输入收款账号');
        return;
    }
    
    const availableBalance = parseFloat(document.getElementById('availableBalance').textContent);
    if (amount > availableBalance) {
        alert('提现金额超过可提现余额');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/user/withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                amount: amount,
                payment_method: method,
                account_number: account
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closeWithdrawModal();
            alert('提现申请已提交，我们将在1-3个工作日内处理');
        } else {
            alert(data.message || '提现申请失败');
        }
    } catch (error) {
        console.error('提现失败:', error);
        alert('网络错误，请重试');
    }
}

// 移动端菜单切换
function toggleMobileMenu() {
    const navLinks = document.getElementById('navLinks');
    navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
}