import { useState, useEffect } from 'react';

/**
 * useApp - Application state hook
 * 
 * Provides reactive state management for identity, posts, view mode and filters.
 * Uses React useState so changes trigger re-renders correctly.
 */
export const useApp = () => {
  const [identity, setIdentityState] = useState(null);
  const [posts, setPostsState] = useState([]);
  const [theme, setThemeState] = useState('light');
  const [viewMode, setViewModeState] = useState('chronological');
  const [filters, setFiltersState] = useState({});
  const [wsConnection, setWsConnectionState] = useState(null);

  // Initialize from localStorage on first load
  useEffect(() => {
    const storedIdentity = getStoredIdentity();
    if (storedIdentity) {
      setIdentityState(storedIdentity);
    }

    const storedViewMode = getStoredViewMode();
    if (storedViewMode) {
      setViewModeState(storedViewMode);
    }
  }, []);

  const setIdentity = (newIdentity) => {
    setIdentityState(newIdentity);
    // Persist to localStorage for session persistence
    if (newIdentity) {
      localStorage.setItem('unbound-identity', JSON.stringify(newIdentity));
    } else {
      localStorage.removeItem('unbound-identity');
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

  const setPosts = (newPosts) => {
    setPostsState(newPosts);
  };

  const setViewMode = (mode) => {
    setViewModeState(mode);
    localStorage.setItem('unbound-view-mode', mode);
  };

  const getStoredViewMode = () => {
    return localStorage.getItem('unbound-view-mode') || 'chronological';
  };

  const setFilters = (newFilters) => {
    setFiltersState(newFilters);
  };

  const setWebSocketConnection = (connection) => {
    setWsConnectionState(connection);
  };

  return {
    identity,
    posts,
    theme,
    viewMode,
    filters,
    wsConnection,
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
