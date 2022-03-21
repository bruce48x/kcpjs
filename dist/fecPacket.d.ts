/// <reference types="node" />
export declare class FecPacket {
    buff: Buffer;
    constructor(buff: Buffer);
    seqId(): number;
    flag(): number;
    data(): Buffer;
}
