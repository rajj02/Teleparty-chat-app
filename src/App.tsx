import React, { useState, useCallback } from 'react';
import './App.css';
import ChatRoom from './components/ChatRoom';
import JoinRoom from './components/JoinRoom';
import { RoomData } from './types';

function App() {
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [nickname, setNickname] = useState('');
  const [userIcon, setUserIcon] = useState(''); // Optional: for user icons
  const [appError, setAppError] = useState('');

  const handleJoinRoom = useCallback((roomData: RoomData): void => {
    try {
      setRoomId(roomData.roomId);
      setNickname(roomData.nickname);
      setUserIcon(roomData.userIcon || '');
      setInRoom(true);
      setAppError('');
    } catch (error) {
      console.error('Error joining room:', error);
      setAppError('Failed to join chat room. Please try again.');
    }
  }, []);

  const handleLeaveRoom = useCallback((): void => {
    setInRoom(false);
    setRoomId('');
    setAppError('');
  }, []);

  const handleError = useCallback((error: string): void => {
    console.error('App error:', error);
    setAppError(error);
    setInRoom(false);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Teleparty Chat</h1>
      </header>
      
      {appError && (
        <div className="app-error-banner">
          <p>{appError}</p>
          <button onClick={() => setAppError('')}>Dismiss</button>
        </div>
      )}
      
      <main>
        {!inRoom ? (
          <JoinRoom onJoinRoom={handleJoinRoom} />
        ) : (
          <ChatRoom 
            roomId={roomId} 
            nickname={nickname} 
            userIcon={userIcon}
            onLeaveRoom={handleLeaveRoom}
            onError={handleError}
          />
        )}
      </main>
      
      <footer className="App-footer">
        <p>Teleparty Chat - Built with React & TypeScript</p>
      </footer>
    </div>
  );
}

export default App; 