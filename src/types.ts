// Teleparty WebSocket Types (from the library)
import { SessionChatMessage } from 'teleparty-websocket-lib';

// Props interfaces
export interface JoinRoomProps {
  onJoinRoom: (roomData: RoomData) => void;
}

export interface ChatRoomProps {
  roomId: string;
  nickname: string;
  userIcon: string;
  onLeaveRoom: () => void;
  onError?: (error: string) => void;
}

// Data interfaces
export interface RoomData {
  roomId: string;
  nickname: string;
  userIcon?: string;
}

export interface MessageData extends SessionChatMessage {
  isSystemMessage: boolean;
  userIcon?: string;
  userNickname?: string;
  body: string;
  permId: string;
  timestamp: number;
}

// State interfaces
export interface ChatRoomState {
  messages: MessageData[];
  messageInput: string;
  client: any; // Using 'any' for the client as it's a complex external type
  connected: boolean;
  typing: boolean;
  usersTyping: string[];
  error: string;
  connecting: boolean;
}

export interface JoinRoomState {
  nickname: string;
  roomId: string;
  userIcon: string;
  loading: boolean;
  error: string;
} 