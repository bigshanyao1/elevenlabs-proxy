// server.js - ElevenLabs 代理服务器
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// 配置 CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'xi-api-key', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'audio/*', limit: '50mb' }));

// 健康检查
app.get('/', (req, res) => {
    res.json({
        status: 'ElevenLabs Proxy Server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            api: '/api/elevenlabs/*',
            websocket: '/ws/elevenlabs'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ElevenLabs API 代理
app.all('/api/elevenlabs/*', async (req, res) => {
    try {
        const apiPath = req.path.replace('/api/elevenlabs', '');
        const elevenLabsUrl = `https://api.elevenlabs.io${apiPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;
        
        console.log(`📡 代理请求: ${req.method} ${apiPath}`);
        
        // 准备请求头
        const headers = {
            'Content-Type': req.headers['content-type'] || 'application/json',
            'User-Agent': 'ElevenLabsProxy/1.0',
        };
        
        // 转发认证头
        if (req.headers['xi-api-key']) {
            headers['xi-api-key'] = req.headers['xi-api-key'];
        }
        
        if (req.headers['authorization']) {
            headers['Authorization'] = req.headers['authorization'];
        }
        
        // 准备请求体
        let body = undefined;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (req.headers['content-type']?.includes('application/json')) {
                body = JSON.stringify(req.body);
            } else {
                body = req.body;
            }
        }
        
        // 发送请求到 ElevenLabs
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(elevenLabsUrl, {
            method: req.method,
            headers: headers,
            body: body,
            timeout: 30000
        });
        
        console.log(`📨 ElevenLabs 响应: ${response.status} ${response.statusText}`);
        
        // 处理响应
        const contentType = response.headers.get('content-type');
        
        // 设置响应头
        res.status(response.status);
        if (contentType) {
            res.set('Content-Type', contentType);
        }
        
        // 根据内容类型处理响应
        if (contentType?.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else if (contentType?.includes('audio/')) {
            const buffer = await response.buffer();
            res.send(buffer);
        } else {
            const text = await response.text();
            res.send(text);
        }
        
    } catch (error) {
        console.error('❌ ElevenLabs 代理错误:', error.message);
        
        res.status(500).json({
            error: '代理服务器错误',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// WebSocket 代理 (用于 Conversational AI)
const wss = new WebSocket.Server({ 
    server, 
    path: '/ws/elevenlabs',
    perMessageDeflate: false 
});

wss.on('connection', (clientWs, request) => {
    console.log('🔗 客户端连接到 ElevenLabs WebSocket 代理');
    
    // 获取认证信息
    const url = new URL(request.url, `http://${request.headers.host}`);
    const apiKey = url.searchParams.get('api_key') || request.headers['xi-api-key'];
    
    if (!apiKey) {
        console.log('❌ 缺少API Key');
        clientWs.close(1008, '缺少API Key');
        return;
    }
    
    let elevenLabsWs = null;
    let isConnected = false;
    let messageBuffer = [];
    
    // 连接到 ElevenLabs WebSocket
    function connectToElevenLabs() {
        try {
            console.log('🌐 连接到 ElevenLabs WebSocket API');
            
            elevenLabsWs = new WebSocket('wss://api.elevenlabs.io/v1/convai/conversation', {
                headers: {
                    'xi-api-key': apiKey,
                    'User-Agent': 'ElevenLabsProxy/1.0'
                },
                timeout: 10000
            });
            
            elevenLabsWs.on('open', () => {
                console.log('✅ ElevenLabs WebSocket 连接成功');
                isConnected = true;
                
                // 通知客户端连接成功
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                        type: 'proxy.connected',
                        message: 'ElevenLabs 代理连接成功'
                    }));
                }
                
                // 发送缓冲的消息
                while (messageBuffer.length > 0 && elevenLabsWs.readyState === WebSocket.OPEN) {
                    const bufferedMessage = messageBuffer.shift();
                    elevenLabsWs.send(bufferedMessage);
                }
            });
            
            elevenLabsWs.on('message', (data) => {
                console.log('📨 ElevenLabs -> Client: 消息转发');
                
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(data);
                }
            });
            
            elevenLabsWs.on('error', (error) => {
                console.error('❌ ElevenLabs WebSocket 错误:', error.message);
                isConnected = false;
                
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                        type: 'error',
                        error: {
                            message: '连接 ElevenLabs 时出现错误: ' + error.message,
                            code: 'ELEVENLABS_ERROR'
                        }
                    }));
                }
            });
            
            elevenLabsWs.on('close', (code, reason) => {
                console.log('🔌 ElevenLabs WebSocket 连接关闭:', code, reason.toString());
                isConnected = false;
                
                // 尝试重连
                if (clientWs.readyState === WebSocket.OPEN) {
                    console.log('🔄 5秒后尝试重连...');
                    setTimeout(() => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            connectToElevenLabs();
                        }
                    }, 5000);
                }
            });
            
        } catch (error) {
            console.error('❌ 创建 ElevenLabs 连接失败:', error);
        }
    }
    
    // 处理客户端消息
    clientWs.on('message', (data) => {
        console.log('📤 Client -> ElevenLabs: 消息转发');
        
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
            elevenLabsWs.send(data);
        } else {
            console.log('📥 ElevenLabs 未连接，消息加入缓冲区');
            messageBuffer.push(data);
            
            if (!isConnected) {
                connectToElevenLabs();
            }
        }
    });
    
    // 客户端断开连接
    clientWs.on('close', (code, reason) => {
        console.log('👋 客户端断开 WebSocket 连接:', code, reason);
        
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
            elevenLabsWs.close();
        }
        
        messageBuffer = [];
    });
    
    clientWs.on('error', (error) => {
        console.error('❌ 客户端 WebSocket 错误:', error.message);
        
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
            elevenLabsWs.close();
        }
    });
    
    // 初始连接
    connectToElevenLabs();
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('💥 服务器错误:', error);
    res.status(500).json({
        error: '服务器内部错误',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// 获取端口
const PORT = process.env.PORT || 3001;

// 启动服务器
server.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 ElevenLabs 代理服务器启动成功!');
    console.log(`📍 服务器地址: http://0.0.0.0:${PORT}`);
    console.log(`🔗 API 代理: http://0.0.0.0:${PORT}/api/elevenlabs/*`);
    console.log(`🔗 WebSocket 代理: ws://0.0.0.0:${PORT}/ws/elevenlabs`);
    console.log(`🏥 健康检查: http://0.0.0.0:${PORT}/health`);
    console.log('⏰ 启动时间:', new Date().toISOString());
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('📴 收到 SIGTERM 信号，正在关闭服务器...');
    
    wss.clients.forEach((ws) => {
        ws.close(1001, '服务器关闭');
    });
    
    server.close(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('📴 收到 SIGINT 信号，正在关闭服务器...');
    
    wss.clients.forEach((ws) => {
        ws.close(1001, '服务器关闭');
    });
    
    server.close(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    });
});