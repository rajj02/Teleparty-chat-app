import React, { useState, useRef, useEffect } from 'react';
import { TelepartyClient } from 'teleparty-websocket-lib';
import { JoinRoomProps } from '../types';

function JoinRoom({ onJoinRoom }: JoinRoomProps) {
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState('');
  const [userIcon, setUserIcon] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tabVisible, setTabVisible] = useState(true);
  
  // Keep a reference to the client
  const clientRef = useRef<TelepartyClient | null>(null);
  const connectionReadyRef = useRef<boolean>(false);

  // Monitor tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      console.log('Join Room - Tab visibility changed:', isVisible ? 'visible' : 'hidden');
      setTabVisible(isVisible);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleCreateRoom = async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    if (!tabVisible) {
      setError('Please keep this tab active while creating a room');
      return;
    }

    setLoading(true);
    setError('');
    console.log('Creating room with nickname:', nickname);

    // Promise that resolves when connection is ready
    let connectionReadyResolve: (() => void) | null = null;
    const connectionReadyPromise = new Promise<void>((resolve) => {
      connectionReadyResolve = resolve;
    });

    try {
      // Create a more complete event handler with error handling
      const eventHandler = {
        onConnectionReady: () => {
          console.log('Connection ready for room creation');
          connectionReadyRef.current = true;
          if (connectionReadyResolve) {
            connectionReadyResolve();
          }
        },
        onClose: () => {
          console.log('Connection closed for room creation');
          connectionReadyRef.current = false;
          if (loading) {
            setError('Connection closed unexpectedly. Please ensure you have a stable internet connection.');
            setLoading(false);
          }
        },
        onMessage: (message: any) => {
          console.log('Message received during room creation:', message);
        },
        onError: (err: Error) => {
          console.error('WebSocket error during room creation:', err);
          setError('WebSocket error: ' + (err.message || 'Unknown error'));
          setLoading(false);
        }
      };
      
      console.log('Initializing TelepartyClient for room creation');
      const client = new TelepartyClient(eventHandler);
      clientRef.current = client;
      console.log('TelepartyClient initialized, waiting for connection');
      
      // Use a timeout to prevent hanging indefinitely for connection
      const connectionTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timed out')), 15000);
      });
      
      // Wait for the connection to be ready before creating a room
      await Promise.race([connectionReadyPromise, connectionTimeoutPromise]);
      console.log('Connection is ready, proceeding to create room');
      
      // Verify connection is still ready and tab is visible
      if (!connectionReadyRef.current || !clientRef.current) {
        throw new Error('Connection was lost before room could be created');
      }

      if (!tabVisible) {
        throw new Error('Tab became inactive during room creation. Please keep this tab in focus.');
      }
      
      // Double check with a small delay to ensure everything is settled
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check again before proceeding
      if (!connectionReadyRef.current || !clientRef.current) {
        throw new Error('Connection was lost before room could be created');
      }
      
      // Use a timeout to prevent hanging indefinitely for room creation
      const roomCreationTimeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Room creation timed out')), 15000);
      });
      
      console.log('Attempting to create chat room...');
      const createdRoomId = await Promise.race([
        clientRef.current.createChatRoom(nickname, userIcon),
        roomCreationTimeoutPromise
      ]);
      
      console.log('Room created successfully with ID:', createdRoomId);
      
      // Store room ID in session storage for potential recovery
      sessionStorage.setItem('lastRoomId', createdRoomId);
      sessionStorage.setItem('lastNickname', nickname);
      if (userIcon) {
        sessionStorage.setItem('lastUserIcon', userIcon);
      }
      
      onJoinRoom({
        roomId: createdRoomId,
        nickname,
        userIcon
      });
      
      // After successfully joining the room, release the client reference
      // This is important to prevent conflict with the ChatRoom component
      setTimeout(() => {
        clientRef.current = null;
        connectionReadyRef.current = false;
      }, 500);
      
    } catch (err) {
      console.error('Failed to create room:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to create room: ' + errorMessage);
      setLoading(false);
      
      // Clean up client on error (don't use close method)
      clientRef.current = null;
      connectionReadyRef.current = false;
    }
  };

  const handleJoinRoom = async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    if (!roomId.trim()) {
      setError('Please enter a room ID');
      return;
    }

    if (!tabVisible) {
      setError('Please keep this tab active while joining a room');
      return;
    }

    // Store room info in session storage for potential recovery
    sessionStorage.setItem('lastRoomId', roomId);
    sessionStorage.setItem('lastNickname', nickname);
    if (userIcon) {
      sessionStorage.setItem('lastUserIcon', userIcon);
    }

    onJoinRoom({
      roomId,
      nickname,
      userIcon
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => {
        if (event.target?.result) {
          setUserIcon(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Check for previous session on load
  useEffect(() => {
    const lastRoomId = sessionStorage.getItem('lastRoomId');
    const lastNickname = sessionStorage.getItem('lastNickname');
    
    if (lastRoomId && lastNickname) {
      setRoomId(lastRoomId);
      setNickname(lastNickname);
      
      const lastUserIcon = sessionStorage.getItem('lastUserIcon');
      if (lastUserIcon) {
        setUserIcon(lastUserIcon);
      }
    }
  }, []);

  return (
    <div className="join-room">
      <h2>Join or Create a Chat Room</h2>
      
      {!tabVisible && (
        <div className="tab-inactive-warning">
          <p>This tab is inactive. Please keep this tab active when creating or joining a room.</p>
        </div>
      )}
      
      <div className="form-group">
        <label htmlFor="nickname">Nickname:</label>
        <input
          type="text"
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Enter your nickname"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="room-id">Room ID (to join existing room):</label>
        <input
          type="text"
          id="room-id"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Enter room ID"
        />
      </div>

      <div className="form-group">
        <label htmlFor="user-icon">User Icon (optional):</label>
        <input
          type="file"
          id="user-icon"
          accept="image/*"
          onChange={handleFileChange}
        />
        {userIcon && (
          <div className="icon-preview">
            <img src={userIcon} alt="User icon" height="40" />
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="button-group">
        <button
          onClick={handleCreateRoom}
          disabled={loading || !tabVisible}
        >
          {loading ? 'Creating...' : 'Create New Room'}
        </button>
        <button
          onClick={handleJoinRoom}
          disabled={loading || !roomId.trim() || !tabVisible}
        >
          Join Room
        </button>
      </div>
    </div>
  );
}

export default JoinRoom; 