import React, { useState, useEffect, useRef } from 'react';
import { TelepartyClient, SocketMessageTypes } from 'teleparty-websocket-lib';
import { ChatRoomProps, MessageData } from '../types';

function ChatRoom({ roomId, nickname, userIcon, onLeaveRoom, onError }: ChatRoomProps) {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [usersTyping, setUsersTyping] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  
  const clientRef = useRef<TelepartyClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const connectionReady = useRef<boolean>(false);
  const isJoiningRoom = useRef<boolean>(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageCache = useRef<Set<string>>(new Set());
  const lastMessageTimestampRef = useRef<number>(0);

  // Safe error handling
  const handleError = (errorMessage: string, isFatal = false) => {
    console.error('Chat error:', errorMessage);
    setError(errorMessage);
    setConnecting(false);
    
    if (isFatal && onError) {
      onError(errorMessage);
    }
  };

  // Helper function to generate a unique ID for a message
  const generateMessageId = (message: Partial<MessageData>): string => {
    return `${message.userNickname || 'system'}-${message.timestamp}-${message.body?.substring(0, 10)}`;
  };

  // Handle tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      console.log('Tab visibility changed:', isVisible ? 'visible' : 'hidden');
      setTabVisible(isVisible);
      
      // If becoming visible again and connection was lost, try to reconnect
      if (isVisible && !connected && connectionReady.current === false) {
        console.log('Tab became visible, attempting to reconnect...');
        initializeConnection();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connected]);

  // Setup cross-tab communication
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === `${roomId}-lastMessageTimestamp`) {
        const storedTimestamp = parseInt(event.newValue || '0', 10);
        if (storedTimestamp > lastMessageTimestampRef.current) {
          console.log('Another tab received a message, initiating refresh');
          // Another tab received a newer message, we should check for updates
          lastMessageTimestampRef.current = storedTimestamp;
          
          // If we're connected, don't do anything - our socket will get the message
          // If we're not connected, we might want to reconnect
          if (!connected && tabVisible) {
            console.log('Reconnecting to get latest messages');
            initializeConnection();
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [roomId, connected, tabVisible]);

  // Set up heartbeat to keep connection alive
  useEffect(() => {
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    
    if (connected && connectionReady.current && clientRef.current) {
      // Send a heartbeat every 30 seconds to keep the connection alive
      heartbeatInterval = setInterval(() => {
        if (clientRef.current && connectionReady.current) {
          try {
            // Send a ping to keep the connection alive
            clientRef.current.sendMessage('heartbeat', {
              timestamp: Date.now(),
              nickname
            });
            console.log('Heartbeat sent');
          } catch (err) {
            console.error('Failed to send heartbeat:', err);
          }
        }
      }, 30000); // 30 seconds
    }
    
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [connected, nickname]);

  // Main connection initialization function 
  const initializeConnection = () => {
    // Clear any pending reconnect attempts
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    setConnecting(true);
    setError('');
    connectionReady.current = false;
    isJoiningRoom.current = false;
    
    const eventHandler = {
      onConnectionReady: () => {
        console.log('Connection ready');
        setConnected(true);
        setConnecting(false);
        connectionReady.current = true;
        
        // Join the room once connection is ready
        if (clientRef.current && !isJoiningRoom.current) {
          try {
            // Mark that we're joining to prevent duplicate joins
            isJoiningRoom.current = true;
            
            // Use setTimeout to ensure the connection is fully established
            setTimeout(() => {
              try {
                if (clientRef.current) {
                  console.log('Joining chat room:', roomId);
                  clientRef.current.joinChatRoom(nickname, roomId, userIcon);
                  
                  // Request any recent messages that we might have missed
                  try {
                    clientRef.current.sendMessage('getMessages', {
                      roomId,
                      timestamp: lastMessageTimestampRef.current
                    });
                  } catch (err) {
                    console.error('Error requesting messages:', err);
                  }
                  
                  // Add system message that user joined
                  const joinMessage: MessageData = {
                    isSystemMessage: true,
                    body: `${nickname} joined the room`,
                    permId: 'system',
                    timestamp: Date.now()
                  };
                  
                  // Add message to UI but don't send to server
                  addMessageToUI(joinMessage);
                }
              } catch (err) {
                console.error('Error joining room after delay:', err);
                handleError('Failed to join room: ' + (err instanceof Error ? err.message : 'Unknown error'));
              }
            }, 1000); // 1 second delay to ensure connection is ready
          } catch (err) {
            console.error('Error joining room:', err);
            handleError('Failed to join room: ' + (err instanceof Error ? err.message : 'Unknown error'));
          }
        }
      },
      onClose: () => {
        console.log('Connection closed');
        setConnected(false);
        connectionReady.current = false;
        isJoiningRoom.current = false;
        
        // Don't show error if tab is not visible
        if (tabVisible) {
          handleError('Connection to the chat room was closed');
          
          // Try to reconnect after a delay if tab is visible
          reconnectTimerRef.current = setTimeout(() => {
            if (tabVisible) {
              console.log('Attempting to reconnect...');
              initializeConnection();
            }
          }, 5000);
        }
      },
      onMessage: (message: any) => {
        console.log('Message received:', message);
        
        if (message.type === 'chatMessage' || message.type === 'sendMessage') {
          const newMessage: MessageData = {
            ...message.data,
            timestamp: message.data.timestamp || Date.now()
          };
          
          // Update timestamp for cross-tab communication
          if (newMessage.timestamp > lastMessageTimestampRef.current) {
            lastMessageTimestampRef.current = newMessage.timestamp;
            localStorage.setItem(`${roomId}-lastMessageTimestamp`, lastMessageTimestampRef.current.toString());
          }
          
          // Ensure we don't add duplicate messages
          addMessageToUI(newMessage);
        } else if (message.type === 'typingPresence' || message.type === 'setTypingPresence') {
          handleTypingPresence(message.data);
        } else if (message.type === 'userList') {
          console.log('User list received:', message.data);
          // Could be used to show who's in the room
        } else if (message.type === 'historicalMessages' && Array.isArray(message.data)) {
          console.log('Received historical messages:', message.data.length);
          
          // Process historical messages
          message.data.forEach((msg: any) => {
            const histMessage: MessageData = {
              ...msg,
              timestamp: msg.timestamp || Date.now()
            };
            addMessageToUI(histMessage);
          });
        } else if (message.type === 'heartbeat') {
          // Heartbeat received - connection is alive
          console.log('Heartbeat received');
        }
      },
      onError: (err: Error) => {
        console.error('WebSocket error:', err);
        handleError('WebSocket error: ' + err.message);
      }
    };

    // Initialize client
    try {
      console.log('Initializing TelepartyClient');
      const client = new TelepartyClient(eventHandler);
      clientRef.current = client;
    } catch (err) {
      handleError('Failed to initialize client: ' + (err instanceof Error ? err.message : 'Unknown error'), true);
    }
  };
  
  // Helper to add message to UI with deduplication
  const addMessageToUI = (message: MessageData) => {
    const messageId = generateMessageId(message);
    
    if (!messageCache.current.has(messageId)) {
      messageCache.current.add(messageId);
      setMessages(prev => [...prev, message]);
      
      // For non-system messages, update the timestamp for cross-tab awareness
      if (!message.isSystemMessage && message.timestamp) {
        if (message.timestamp > lastMessageTimestampRef.current) {
          lastMessageTimestampRef.current = message.timestamp;
          localStorage.setItem(`${roomId}-lastMessageTimestamp`, lastMessageTimestampRef.current.toString());
        }
      }
    } else {
      console.log('Duplicate message ignored:', messageId);
    }
  };

  // Initialize connection when component mounts
  useEffect(() => {
    // Clear any existing cache before setting up a new connection
    messageCache.current.clear();
    lastMessageTimestampRef.current = 0;
    
    initializeConnection();

    // Cleanup function - do not use close() method
    return () => {
      console.log('Cleaning up chat room connection');
      
      // Clear any pending reconnect attempts
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      
      // Just dereference the client and let garbage collection handle it
      clientRef.current = null;
      isJoiningRoom.current = false;
      connectionReady.current = false;
    };
  }, [roomId, nickname, userIcon]);

  // Try to load previous messages on connection
  useEffect(() => {
    if (connected && messages.length === 0) {
      // You could attempt to retrieve message history from the server here
      // For now, we're just demonstrating the concept
      console.log('Connected and ready to retrieve message history if available');
    }
  }, [connected, messages.length]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle typing indicator timeout
  useEffect(() => {
    let typingTimeout: ReturnType<typeof setTimeout>;
    
    if (typing) {
      typingTimeout = setTimeout(() => {
        setTyping(false);
        sendTypingStatus(false);
      }, 3000);
    }
    
    return () => {
      if (typingTimeout) clearTimeout(typingTimeout);
    };
  }, [typing]);

  const handleTypingPresence = (data: { nickname: string; isTyping: boolean }) => {
    setUsersTyping(prev => {
      if (data.isTyping && !prev.includes(data.nickname)) {
        return [...prev, data.nickname];
      } else if (!data.isTyping) {
        return prev.filter(user => user !== data.nickname);
      }
      return prev;
    });
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !connected || !clientRef.current || !connectionReady.current) {
      console.log('Cannot send message - not ready', {
        hasInput: !!messageInput.trim(),
        isConnected: connected,
        hasClient: !!clientRef.current,
        connectionReady: connectionReady.current
      });
      return;
    }
    
    try {
      // Create a unique ID for this message
      const timestamp = Date.now();
      const uniqueId = `${nickname}-${timestamp}-${Math.random().toString(36).substring(2, 8)}`;
      
      // Create the message data
      const messageData: Partial<MessageData> = {
        isSystemMessage: false,
        userIcon,
        userNickname: nickname,
        body: messageInput,
        timestamp: timestamp,
        permId: uniqueId
      };
      
      // Send to server ONLY - don't add to UI right away
      // We'll let the server echo it back to ensure all tabs get it
      clientRef.current.sendMessage(SocketMessageTypes.SEND_MESSAGE, messageData);
      
      // Clear input and typing status
      setMessageInput('');
      setTyping(false);
      sendTypingStatus(false);
    } catch (err) {
      handleError('Failed to send message: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    
    if (!typing && e.target.value.trim()) {
      setTyping(true);
      sendTypingStatus(true);
    } else if (typing && !e.target.value.trim()) {
      setTyping(false);
      sendTypingStatus(false);
    }
  };

  const sendTypingStatus = (isTyping: boolean) => {
    if (connected && clientRef.current && connectionReady.current) {
      try {
        clientRef.current.sendMessage(SocketMessageTypes.SET_TYPING_PRESENCE, {
          nickname,
          isTyping
        });
      } catch (err) {
        console.error('Failed to send typing status:', err);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const handleLeaveRoom = () => {
    // Just dereference the client
    clientRef.current = null;
    onLeaveRoom();
  };

  // Render with connection status indicator
  const getConnectionStatusText = () => {
    if (!tabVisible) return "Tab inactive - connection paused";
    if (!connected) return "Connecting to chat room...";
    if (!connectionReady.current) return "Establishing connection...";
    if (isJoiningRoom.current) return "Joining room...";
    return null;
  };

  const connectionStatusText = getConnectionStatusText();

  return (
    <div className="chat-room">
      <div className="chat-header">
        <h2>Chat Room: {roomId}</h2>
        <div className="user-info">
          <span>Logged in as: {nickname}</span>
          {userIcon && <img src={userIcon} alt="User Icon" className="user-icon-small" />}
        </div>
        <button onClick={handleLeaveRoom} className="leave-button">Leave Room</button>
      </div>
      
      {!tabVisible && (
        <div className="tab-inactive-warning">
          <p>This tab is inactive. Messages may be delayed.</p>
        </div>
      )}
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          {!connected && (
            <button onClick={initializeConnection}>Reconnect</button>
          )}
        </div>
      )}
      
      {connectionStatusText && (
        <div className="connecting-message">
          <p>{connectionStatusText}</p>
        </div>
      )}
      
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div 
              key={index} 
              className={`message ${message.isSystemMessage ? 'system-message' : ''} ${message.userNickname === nickname ? 'own-message' : ''}`}
            >
              {!message.isSystemMessage && (
                <div className="message-header">
                  {message.userIcon && <img src={message.userIcon} alt="User Icon" className="message-user-icon" />}
                  <span className="message-sender">{message.userNickname}</span>
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}
              <div className="message-body">{message.body}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {usersTyping.length > 0 && (
        <div className="typing-indicator">
          <p>
            {usersTyping.filter(user => user !== nickname).join(', ')}
            {usersTyping.length === 1 ? ' is typing...' : ' are typing...'}
          </p>
        </div>
      )}
      
      <div className="message-input-container">
        <input
          type="text"
          value={messageInput}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={connected ? "Type a message..." : "Connecting..."}
          disabled={!connected}
        />
        <button 
          onClick={sendMessage} 
          disabled={!connected || !messageInput.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatRoom;