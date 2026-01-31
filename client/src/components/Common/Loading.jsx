import React from 'react';

const Loading = ({ size = 'md', className = '' }) => {
  return (
    <div className={`loading loading--${size} ${className}`}>
      <div className="loading-spinner"></div>
      <div className="loading-text">Loading...</div>
    </div>
  );
};

export default Loading;