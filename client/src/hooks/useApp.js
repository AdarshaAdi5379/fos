import { useState, useEffect, useContext, createContext } from 'react';
import { useWebSocket } from './useWebSocket';

const AppContext = createContext({
  identity: null,
  posts: [],
  theme: 'light',
  viewMode: 'chronological',
  filters: {},
  wsConnection: null
});

export const useApp = () => {
  const context = useContext(AppContext);
  
  const setIdentity = (identity) => {
    context.identity = identity;
    // Store in localStorage for persistence
    if (identity) {
      localStorage.setItem('unbound-identity', JSON.stringify(identity));
    }
  };
  
  const getStoredIdentity = () => {
    try {
      const stored = localStorage.getItem('unbound-identity');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load stored identity:', error);
      return null;
    }
  };
  
  const setPosts = (posts) => {
    context.posts = posts;
  };
  
  const setViewMode = (mode) => {
    context.viewMode = mode;
    localStorage.setItem('unbound-view-mode', mode);
  };
  
  const getStoredViewMode = () => {
    return localStorage.getItem('unbound-view-mode') || 'chronological';
  };
  
  const setFilters = (filters) => {
    context.filters = filters;
  };
  
  const setWebSocketConnection = (connection) => {
    context.wsConnection = connection;
  };
  
  // Initialize from localStorage on first load
  useEffect(() => {
    const storedIdentity = getStoredIdentity();
    if (storedIdentity) {
      setIdentity(storedIdentity);
    }
    
    const storedViewMode = getStoredViewMode();
    if (storedViewMode) {
      setViewMode(storedViewMode);
    }
  }, []);
  
  return {
    ...context,
    setIdentity,
    getStoredIdentity,
    setPosts,
    setViewMode,
    getStoredViewMode,
    setFilters,
    setWebSocketConnection
  };
};

export default useApp;