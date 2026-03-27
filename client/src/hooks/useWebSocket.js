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
      // Use secure WebSocket in production or when available
      const protocol = (window.location.protocol === 'https:' || !window.location.hostname.includes('localhost')) ? 'wss:' : 'ws:';
      const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.hostname}:3000`;
      
      // Validate URL to prevent WebSocket hijacking
      const url = new URL(wsUrl);
      if (!['ws:', 'wss:'].includes(url.protocol)) {
        throw new Error('Invalid WebSocket protocol');
      }
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setConnection('connected');
        setReconnectAttempts(0);
        setMessages([]);
      };
      
      ws.onmessage = (event) => {
        try {
          // Validate message size to prevent DoS
          if (event.data.length > 100000) { // 100KB limit
            console.warn('WebSocket message too large, ignoring');
            return;
          }

          const message = JSON.parse(event.data);
          
          // Validate message structure
          if (!message || typeof message !== 'object') {
            console.warn('Invalid WebSocket message format');
            return;
          }

          // Sanitize message to prevent XSS
          const sanitizedMessage = {
            ...message,
            type: typeof message.type === 'string' ? message.type.replace(/[^a-zA-Z0-9_]/g, '') : 'unknown',
            data: message.data || null
          };

          setMessages(prev => [...prev, sanitizedMessage]);
          
          switch (sanitizedMessage.type) {
            case 'new_post':
              // Validate data structure before processing
              if (sanitizedMessage.data && typeof sanitizedMessage.data === 'object') {
                if (typeof window.onNewPost === 'function') {
                  window.onNewPost(sanitizedMessage.data);
                }
              }
              break;
            case 'post_updated':
              if (sanitizedMessage.data && typeof sanitizedMessage.data === 'object') {
                if (typeof window.onPostUpdated === 'function') {
                  window.onPostUpdated(sanitizedMessage.data);
                }
              }
              break;
            case 'connected':
              console.log('WebSocket connection confirmed');
              break;
            default:
              console.warn('Unknown WebSocket message type:', sanitizedMessage.type);
          }
        } catch (error) {
          console.error('WebSocket message parse error:', error);
          // Don't expose error details to potential attackers
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