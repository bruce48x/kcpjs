# kcpjs

纯 js 实现 kcp

参考 kcp-go 来实现

# 运行示例
```sh
ts-node examples/echo.ts
```

# API

## 创建 server
ListenWithOptions

### 参数

port
监听的端口

block
加密模块

dataShards
parityShards
前向纠错参数

callback
客户端连接成功的回调

## 创建 client
DialWithOptions

### 参数

host
服务器地址

port
服务器端口

conv
会话ID

block
加密模块

dataShards
parityShards
前向纠错参数
