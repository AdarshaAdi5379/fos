import { useState, useEffect, useCallback } from 'react';

const useWebSocket = () => {
  const [connection, setConnection] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds
  
  const connect = useCallback(() => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }
    
    try {
      const ws = new WebSocket('ws://localhost:3000');
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setConnection('connected');
        setReconnectAttempts(0);
        setMessages([]);
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setMessages(prev => [...prev, message]);
          
          switch (message.type) {
            case 'new_post':
              // Trigger global refresh if needed
              if (typeof window.onNewPost === 'function') {
                window.onNewPost(message.data);
              }
              break;
            case 'post_updated':
              if (typeof window.onPostUpdated === 'function') {
                window.onPostUpdated(message.data);
              }
              break;
            case 'connected':
              console.log('WebSocket connection confirmed');
              break;
          }
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', {
          type: error.type,
          code: error.code,
          message: error.message
        });
        setConnection('error');
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket connection closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        setConnection('closed');
        
        // Attempt reconnection if it was an abnormal closure
        if (!event.wasClean && event.code !== 1000 && event.code !== 1006) {
          console.log('🔄 Attempting to reconnect in 3 seconds...');
          setReconnectAttempts(prev => prev + 1);
          setTimeout(connect, reconnectDelay);
        }
      };
      
      ws.addEventListener('close', (event) => {
        console.log('WebSocket closed with close event:', event);
        setConnection(null);
      });
      
      return ws;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnection('error');
    }
  }, [reconnectAttempts]);
  
  const sendMessage = useCallback((message) => {
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }, [connection]);
  
  const disconnect = useCallback(() => {
    if (connection) {
      connection.close(1000, 'User disconnected');
      setConnection(null);
    }
  }, [connection]);
  
  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (connection) {
        connection.close();
      }
    };
  }, []);
  
  return {
    connection,
    messages,
    connect,
    sendMessage,
    disconnect,
    reconnectAttempts
  };
};

export default useWebSocket;