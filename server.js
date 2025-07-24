// server.js - 简化测试版 ElevenLabs 代理服务器
const express = require('express');
const cors = require('cors');

const app = express();

// 基本中间件
app.use(cors());
app.use(express.json());

// 环境变量检查
console.log('🔧 启动环境检查:');
console.log('PORT:', process.env.PORT || '未设置');
console.log('NODE_ENV:', process.env.NODE_ENV || '未设置');
console.log('Railway Environment:', process.env.RAILWAY_ENVIRONMENT_NAME || '非Railway环境');

// 基本路由
app.get('/', (req, res) => {
    console.log('📞 收到根路径请求 - IP:', req.ip, 'User-Agent:', req.get('User-Agent'));
    res.json({
        status: 'ElevenLabs Proxy Server (Test)',
        version: '1.0-test',
        timestamp: new Date().toISOString(),
        environment: {
            port: process.env.PORT,
            nodeEnv: process.env.NODE_ENV,
            railway: process.env.RAILWAY_ENVIRONMENT_NAME
        },
        request: {
            ip: req.ip,
            method: req.method,
            headers: req.headers
        }
    });
});

app.get('/health', (req, res) => {
    console.log('🏥 健康检查请求 - IP:', req.ip);
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 添加所有请求的日志记录
app.use((req, res, next) => {
    console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

app.get('/test', (req, res) => {
    console.log('🧪 测试端点请求');
    res.json({ 
        message: '测试成功！代理服务器正常运行',
        timestamp: new Date().toISOString(),
        cors: 'enabled'
    });
});

// 简化的 API 代理
app.all('/api/elevenlabs/*', async (req, res) => {
    console.log(`📡 代理请求: ${req.method} ${req.path}`);
    
    try {
        const apiPath = req.path.replace('/api/elevenlabs', '');
        const targetUrl = `https://api.us.elevenlabs.io${apiPath}`;
        
        console.log(`🔗 目标URL: ${targetUrl}`);
        
        // 动态导入 node-fetch
        const fetch = (await import('node-fetch')).default;
        
        // 准备请求头
        const headers = {
            'User-Agent': 'ElevenLabsProxy/1.0'
        };
        
        // 转发重要头部
        if (req.headers['xi-api-key']) {
            headers['xi-api-key'] = req.headers['xi-api-key'];
        }
        if (req.headers['authorization']) {
            headers['Authorization'] = req.headers['authorization'];
        }
        if (req.headers['content-type']) {
            headers['Content-Type'] = req.headers['content-type'];
        }
        
        // 发送请求
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: headers,
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
        });
        
        console.log(`📨 ElevenLabs 响应: ${response.status}`);
        
        // 设置 CORS
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', '*');
        res.set('Access-Control-Allow-Headers', '*');
        
        // 转发响应
        const data = await response.json();
        res.status(response.status).json(data);
        
    } catch (error) {
        console.error('❌ 代理错误:', error.message);
        
        res.set('Access-Control-Allow-Origin', '*');
        res.status(500).json({
            error: '代理服务器错误',
            message: error.message
        });
    }
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('💥 应用错误:', error);
    res.status(500).json({
        error: '服务器内部错误',
        message: error.message
    });
});

// 404 处理
app.use('*', (req, res) => {
    console.log(`❓ 未找到路径: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: '路径未找到',
        path: req.originalUrl,
        method: req.method
    });
});

// 获取端口
const PORT = process.env.PORT || 3000;

// 启动服务器
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 简化代理服务器启动成功!');
    console.log(`📍 监听端口: ${PORT}`);
    console.log(`🌐 外部访问: https://elevenlabs-proxy-production.up.railway.app`);
    console.log('⏰ 启动时间:', new Date().toISOString());
    
    // 测试服务器是否真的在监听
    console.log('🔍 服务器监听状态检查:');
    console.log('  - 地址:', server.address());
    console.log('  - 端口:', server.address()?.port);
    console.log('  - 家族:', server.address()?.family);
});

// 服务器事件监听
server.on('listening', () => {
    console.log('✅ 服务器监听事件触发');
});

server.on('connection', (socket) => {
    console.log('🔗 新连接建立:', socket.remoteAddress);
});

server.on('request', (req, res) => {
    console.log('📥 收到请求:', req.method, req.url);
});

// 错误处理
server.on('error', (error) => {
    console.error('💥 服务器启动错误:', error);
    console.error('错误代码:', error.code);
    console.error('错误消息:', error.message);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('💥 未捕获异常:', error);
    console.error('堆栈:', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('💥 未处理的Promise拒绝:', reason);
    process.exit(1);
});

// 定期输出状态
setInterval(() => {
    console.log(`💓 服务器心跳 - 运行时间: ${Math.floor(process.uptime())}秒`);
}, 30000);

console.log('✅ 服务器代码加载完成');
