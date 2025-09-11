# kcpjs


[![npm version](https://img.shields.io/npm/v/kcpjs.svg)](https://www.npmjs.com/package/kcpjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
| <b>English</b> | <a href="./README-zh.md"><b>简体中文</b></a> |
</p>

A pure JavaScript implementation of KCP (KCP Protocol) with FEC (Forward Error Correction) and encryption support.

---

## Features

- **Pure JavaScript Implementation**: No native dependencies
- **FEC Support**: Reed-Solomon error correction
- **Encryption Support**: AES-GCM encryption
- **TypeScript Support**: Full type definitions
- **High Performance**: Optimized for real-time communication

Compared to [node-kcp-x](https://github.com/bruce48x/node-kcp), this implementation adds two key features:

1. **FEC (Forward Error Correction)**: Improves reliability over unreliable networks
2. **Encryption**: Secure data transmission

---

## Installation

```bash
npm install kcpjs
```

---

## Quick Start

### Example 1: Echo Server

```bash
ts-node examples/echo.ts
```

### Example 2: Client-Server Communication

```bash
# Terminal 1
ts-node examples/server.ts

# Terminal 2
ts-node examples/client.ts
```

---

## API Reference

### Server

#### `ListenWithOptions(options)`

Creates a KCP server listener

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `port` | `number` | Server port |
| `block` | `CryptBlock \| undefined` | Encryption module |
| `dataShards` | `number` | FEC data shards |
| `parityShards` | `number` | FEC parity shards |
| `callback` | `(session: Session) => void` | Client connection callback |

### Client

#### `DialWithOptions(options)`

Creates a KCP client connection

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `host` | `string` | Server address |
| `port` | `number` | Server port |
| `conv` | `number` | Session ID |
| `block` | `CryptBlock \| undefined` | Encryption module |
| `dataShards` | `number` | FEC data shards |
| `parityShards` | `number` | FEC parity shards |

---

## Usage Examples

### Basic Server

```typescript
import { ListenWithOptions } from 'kcpjs';
import { AesBlock } from 'kcpjs/crypt';
import * as crypto from 'crypto';

// Encryption setup
const algorithm: crypto.CipherGCMTypes = 'aes-128-gcm';
const key = crypto.randomBytes(128 / 8);
const iv = crypto.randomBytes(12);

// FEC configuration
const dataShards = 4;
const parityShards = 1;

const server = ListenWithOptions({
    port: 22333,
    block: new AesBlock(algorithm, key, iv),
    dataShards,
    parityShards,
    callback: (session) => {
        console.log('New client connected');
        
        session.on('recv', (data: Buffer) => {
            // Echo back received data
            session.write(data);
        });
    },
});
```

### Basic Client

```typescript
import { DialWithOptions } from 'kcpjs';
import { AesBlock } from 'kcpjs/crypt';
import * as crypto from 'crypto';

// Same encryption setup as server
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
    console.log('Received:', data.toString());
});

// Send data
setInterval(() => {
    const message = Buffer.from('Hello from client');
    session.write(message);
}, 1000);
```

---

## Configuration

### FEC (Forward Error Correction)

FEC helps recover lost packets without retransmission

- `dataShards`: Number of data shards
- `parityShards`: Number of parity shards
- Set either to `0` to disable FEC

### Encryption

Supports AES-GCM encryption

- `algorithm`: Cipher algorithm (e.g., 'aes-128-gcm')
- `key`: Encryption key
- `iv`: Initialization vector
- Set any parameter to empty to disable encryption

---

## Development

### Build

```bash
yarn build
```

### Format

```bash
yarn format
```

### Lint

```bash
yarn lint
```

---

## License

MIT License

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## Related Projects

- [kcp-go](https://github.com/skywind3000/kcp) - Original KCP implementation in Go
- [node-kcp-x](https://github.com/bruce48x/node-kcp) - Basic Node.js KCP implementation
