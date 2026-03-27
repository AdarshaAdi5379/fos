// Client configuration
export const config = {
  // API Configuration
  API_BASE_URL: getSecureApiUrl(),
  WS_URL: getSecureWebSocketUrl(),
  
  // Environment
  NODE_ENV: import.meta.env.NODE_ENV || 'development',
  IS_PRODUCTION: import.meta.env.PROD,
  
  // Feature Flags
  ENABLE_ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
  ENABLE_ERROR_REPORTING: import.meta.env.VITE_ENABLE_ERROR_REPORTING !== 'false',
  
  // Application Settings
  APP_NAME: import.meta.env.VITE_APP_NAME || 'Unbound',
  APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
  
  // Timeouts
  API_TIMEOUT: parseInt(import.meta.env.VITE_API_TIMEOUT) || 10000,
  WS_RECONNECT_INTERVAL: parseInt(import.meta.env.VITE_WS_RECONNECT_INTERVAL) || 5000,
  
  // UI Settings
  POSTS_PER_PAGE: parseInt(import.meta.env.VITE_POSTS_PER_PAGE) || 50,
  MAX_CONTENT_LENGTH: parseInt(import.meta.env.VITE_MAX_CONTENT_LENGTH) || 10000,
  
  // Feed Settings
  DEFAULT_FEED_STRATEGY: import.meta.env.VITE_DEFAULT_FEED_STRATEGY || 'algorithmic',
  ENABLE_ALGORITHMIC_FEED: import.meta.env.VITE_ENABLE_ALGORITHMIC_FEED !== 'false',
  ENABLE_SEARCH: import.meta.env.VITE_ENABLE_SEARCH !== 'false',
  
  // Security
  ENABLE_CONTENT_WARNING: import.meta.env.VITE_ENABLE_CONTENT_WARNING !== 'false',
  REQUIRE_SSL: import.meta.env.VITE_REQUIRE_SSL === 'true',
};

// Helper function to determine secure API URL
function getSecureApiUrl() {
  const isDev = !import.meta.env.PROD;
  const isSecureConnection = typeof window !== 'undefined' && 
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost');
  
  if (isDev) {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  }
  
  const customUrl = import.meta.env.VITE_API_BASE_URL;
  if (customUrl) {
    return customUrl;
  }
  
  // Production HTTPS
  return 'https://your-domain.com';
}

// Helper function to determine secure WebSocket URL
function getSecureWebSocketUrl() {
  const isDev = !import.meta.env.PROD;
  const isSecureConnection = typeof window !== 'undefined' && 
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost');
  
  if (isDev) {
    return import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
  }
  
  const customUrl = import.meta.env.VITE_WS_URL;
  if (customUrl) {
    return customUrl;
  }
  
  // Production WSS
  return 'wss://your-domain.com';
}

// Utility functions for configuration
export const getApiUrl = (path = '') => {
  return `${config.API_BASE_URL}${path}`;
};

export const getWebSocketUrl = () => {
  return config.WS_URL;
};

export const isDevelopment = () => !config.IS_PRODUCTION;
export const isProduction = () => config.IS_PRODUCTION;

// Log configuration in development
if (isDevelopment()) {
  console.log('Client Configuration:', {
    API_BASE_URL: config.API_BASE_URL,
    WS_URL: config.WS_URL,
    NODE_ENV: config.NODE_ENV,
    IS_PRODUCTION: config.IS_PRODUCTION,
  });
}

export default config;