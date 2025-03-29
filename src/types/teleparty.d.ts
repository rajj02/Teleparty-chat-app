declare module 'teleparty-websocket-lib' {
  export enum SocketMessageTypes {
    SEND_MESSAGE = 'sendMessage',
    SET_TYPING_PRESENCE = 'setTypingPresence'
  }

  export interface SessionChatMessage {
    isSystemMessage: boolean;
    userIcon?: string;
    userNickname?: string;
    body: string;
    permId: string;
    timestamp: number;
  }

  export interface SocketEventHandler {
    onConnectionReady: () => void;
    onClose: () => void;
    onMessage: (message: any) => void;
    onError?: (error: Error) => void;
  }

  export class TelepartyClient {
    constructor(eventHandler: SocketEventHandler);
    createChatRoom(nickname: string, userIcon?: string): Promise<string>;
    joinChatRoom(nickname: string, roomId: string, userIcon?: string): void;
    sendMessage(type: string | SocketMessageTypes, data: any): void;
    // Note: close method is not implemented in the library
  }
} 