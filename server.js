const http = require('http');

console.log('开始启动超简化服务器...');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

const server = http.createServer((req, res) => {
    console.log(`收到请求: ${req.method} ${req.url} from ${req.connection.remoteAddress}`);
    console.log('请求头:', JSON.stringify(req.headers, null, 2));
    
    // 设置响应头
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
    });
    
    // 返回 JSON 响应
    const response = {
        status: 'ok',
        message: 'Server is working!',
        timestamp: new Date().toISOString(),
        path: req.url,
        method: req.method,
        port: process.env.PORT
    };
    
    res.end(JSON.stringify(response, null, 2));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 服务器成功启动在端口 ${PORT}`);
    console.log(`🌐 监听地址: 0.0.0.0:${PORT}`);
    console.log(`⏰ 启动时间: ${new Date().toISOString()}`);
    
    // 立即测试服务器是否真的在监听
    setTimeout(() => {
        const testReq = http.request({
            hostname: 'localhost',
            port: PORT,
            path: '/',
            method: 'GET'
        }, (res) => {
            console.log(`🧪 本地测试成功: ${res.statusCode}`);
        });
        
        testReq.on('error', (err) => {
            console.error('❌ 本地测试失败:', err.message);
        });
        
        testReq.end();
    }, 1000);
});

server.on('error', (err) => {
    console.error('❌ 服务器错误:', err);
    console.error('错误代码:', err.code);
    console.error('错误消息:', err.message);
    process.exit(1);
});

server.on('listening', () => {
    console.log('🎉 监听事件触发，服务器正在监听');
    const addr = server.address();
    console.log('📍 实际监听地址:', addr);
});

server.on('connection', (socket) => {
    console.log('🔗 新连接建立:', socket.remoteAddress);
});

server.on('request', (req, res) => {
    console.log(`📨 请求事件: ${req.method} ${req.url}`);
});

// 定时心跳
setInterval(() => {
    console.log(`💓 心跳: ${new Date().toISOString()} - 运行时间: ${Math.floor(process.uptime())}秒`);
}, 10000);

// 错误处理
process.on('uncaughtException', (err) => {
    console.error('💥 未捕获异常:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('💥 未处理的Promise拒绝:', reason);
    process.exit(1);
});

console.log('✅ 服务器代码加载完成，等待启动...');
