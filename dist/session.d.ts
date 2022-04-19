/// <reference types="node" />
import * as dgram from 'dgram';
import EventEmitter = require('events');
import { FecDecoder } from './fecDecoder';
import { FecEncoder } from './fecEncoder';
import { Kcp } from './kcp';
import { CryptBlock } from 'crypt';
export declare class Listener {
    block: CryptBlock;
    dataShards: number;
    parityShards: number;
    conn: dgram.Socket;
    ownConn: boolean;
    sessions: {
        [key: string]: UDPSession;
    };
    callback: ListenCallback;
    private packetInput;
    /**
     * 停止 UDP 监听，关闭 socket
     */
    close(): any;
    closeSession(key: string): boolean;
    monitor(): void;
}
export declare class UDPSession extends EventEmitter {
    key: string;
    conn: dgram.Socket;
    ownConn: boolean;
    kcp: Kcp;
    listener: Listener;
    block: CryptBlock;
    recvbuf: Buffer;
    bufptr: Buffer;
    fecDecoder: FecDecoder;
    fecEncoder: FecEncoder;
    port: number;
    host: string;
    headerSize: number;
    ackNoDelay: boolean;
    writeDelay: boolean;
    constructor();
    write(b: Buffer): number;
    writeBuffers(v: Buffer[]): number;
    close(): void;
    setWriteDelay(delay: boolean): void;
    setWindowSize(sndwnd: number, rcvwnd: number): void;
    setMtu(mtu: number): boolean;
    setStreamMode(enable: boolean): void;
    setACKNoDelay(nodelay: boolean): void;
    setNoDelay(nodelay: number, interval: number, resend: number, nc: number): void;
    output(buf: Buffer): void;
    check(): void;
    getConv(): number;
    getRTO(): number;
    getSRTT(): number;
    getSRTTVar(): number;
    packetInput(data: Buffer): void;
    kcpInput(data: Buffer): void;
    readLoop(): void;
}
export declare type ListenCallback = (session: UDPSession) => void;
export declare function Listen(port: number, callback: ListenCallback): any;
export interface ListenOptions {
    port: number;
    block?: CryptBlock;
    keyLength?: number;
    dataShards?: number;
    parityShards?: number;
    callback: ListenCallback;
}
export declare function ListenWithOptions(opts: ListenOptions): Listener;
export declare function ServeConn(block: any, dataShards: number, parityShards: number, conn: dgram.Socket, callback: ListenCallback): Listener;
export declare function Dial(conv: number, port: number, host: string): any;
export interface DialOptions {
    conv: number;
    port: number;
    host: string;
    block?: CryptBlock;
    dataShards?: number;
    parityShards?: number;
}
export declare function DialWithOptions(opts: DialOptions): UDPSession;
