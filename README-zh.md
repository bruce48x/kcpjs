# kcpjs

[![npm version](https://img.shields.io/npm/v/kcpjs.svg)](https://www.npmjs.com/package/kcpjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
| <a href="./README.md"><b>English</b></a> | <b>简体中文</b> |
</p>

纯 JavaScript 实现的 KCP 协议，支持前向纠错（FEC）和加密功能。

---

## 特性

- **纯 JavaScript 实现**: 无原生依赖
- **前向纠错支持**: Reed-Solomon 纠错算法
- **加密支持**: AES-GCM 加密
- **TypeScript 支持**: 完整的类型定义
- **高性能**: 针对实时通信优化

相比 [node-kcp-x](https://github.com/bruce48x/node-kcp)，此实现增加了两个关键特性：

1. **前向纠错（FEC）**: 提高不可靠网络上的可靠性
2. **加密**: 安全的数据传输

---

## 安装

```bash
npm install kcpjs
```

---

## 快速开始

### 示例1：回显服务器

```bash
ts-node examples/echo.ts
```

### 示例2：客户端-服务器通信

```bash
# 终端1
ts-node examples/server.ts

# 终端2
ts-node examples/client.ts
```

---

## API 参考

### 服务器

#### `ListenWithOptions(options)`

创建 KCP 服务器监听器

**参数:**

| 参数 | 类型 | 描述 |
|------|------|------|
| `port` | `number` | 服务器端口 |
| `block` | `CryptBlock \| undefined` | 加密模块 |
| `dataShards` | `number` | FEC 数据分片数 |
| `parityShards` | `number` | FEC 校验分片数 |
| `callback` | `(session: Session) => void` | 客户端连接回调 |

### 客户端

#### `DialWithOptions(options)`

创建 KCP 客户端连接

**参数:**

| 参数 | 类型 | 描述 |
|------|------|------|
| `host` | `string` | 服务器地址 |
| `port` | `number` | 服务器端口 |
| `conv` | `number` | 会话ID |
| `block` | `CryptBlock \| undefined` | 加密模块 |
| `dataShards` | `number` | FEC 数据分片数 |
| `parityShards` | `number` | FEC 校验分片数 |

---

## 使用示例

### 基础服务器

```typescript
import { ListenWithOptions } from 'kcpjs';
import { AesBlock } from 'kcpjs/crypt';
import * as crypto from 'crypto';

// 加密设置
const algorithm: crypto.CipherGCMTypes = 'aes-128-gcm';
const key = crypto.randomBytes(128 / 8);
const iv = crypto.randomBytes(12);

// FEC 配置
const dataShards = 4;
const parityShards = 1;

const server = ListenWithOptions({
    port: 22333,
    block: new AesBlock(algorithm, key, iv),
    dataShards,
    parityShards,
    callback: (session) => {
        console.log('新客户端连接');
        
        session.on('recv', (data: Buffer) => {
            // 回显接收到的数据
            session.write(data);
        });
    },
});
```

### 基础客户端

```typescript
import { DialWithOptions } from 'kcpjs';
import { AesBlock } from 'kcpjs/crypt';
import * as crypto from 'crypto';

// 与服务器相同的加密设置
const algorithm: crypto.CipherGCMTypes = 'aes-128-gcm';
const key = crypto.randomBytes(128 / 8);
const iv = crypto.randomBytes(12);

const dataShards = 4;
const parityShards = 1;

const session = DialWithOptions({
    host: '127.0.0.1',
    port: 22333,
    conv: 255,
    block: new AesBlock(algorithm, key, iv),
    dataShards,
    parityShards,
});

session.on('recv', (data: Buffer) => {
    console.log('接收到:', data.toString());
});

// 发送数据
setInterval(() => {
    const message = Buffer.from('来自客户端的问候');
    session.write(message);
}, 1000);
```

---

## 配置

### 前向纠错（FEC）

FEC 帮助在不重传的情况下恢复丢失的数据包

- `dataShards`: 数据分片数量
- `parityShards`: 校验分片数量
- 将任一参数设为 `0` 可禁用 FEC

### 加密

支持 AES-GCM 加密

- `algorithm`: 加密算法（如 'aes-128-gcm'）
- `key`: 加密密钥
- `iv`: 初始化向量
- 将任一参数设为空可禁用加密

---

## 开发

### 构建

```bash
yarn build
```

### 格式化

```bash
yarn format
```

### 代码检查

```bash
yarn lint
```

---

## 许可证

MIT 许可证

---

## 贡献

欢迎贡献！请随时提交 Pull Request。

---

## 相关项目

- [kcp-go](https://github.com/skywind3000/kcp) - Go 语言原始 KCP 实现
- [node-kcp-x](https://github.com/bruce48x/node-kcp) - 基础 Node.js KCP 实现
