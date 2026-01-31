import React, { useState, useEffect } from 'react';
import { Button } from '../Common/Button';
import { Input } from '../Common/Input';
import { Loading } from '../Common/Loading';

const FeedControls = ({ currentMode, onModeChange, onSearch, filters }) => {
  const modes = [
    { id: 'chronological', label: 'Latest', icon: Clock },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'quality', label: 'Quality', icon: TrendingUp },
    { id: 'trending', label: 'Trending', icon: TrendingUp },
    { id: 'topics', label: 'Topics', icon: Hash }
  ];
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  return (
    <div className="feed-controls">
      <div className="view-mode-toggle">
        <span className="control-label">View:</span>
        <div className="mode-buttons">
          {modes.map(mode => (
            <button
              key={mode.id}
              className={`mode-button ${currentMode === mode.id ? 'active' : ''}`}
              onClick={() => onModeChange(mode.id)}
            >
              <mode.icon className="mode-icon" />
              {mode.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="search-section">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search posts by content or author..."
          className="search-input"
        />
        <button 
          className={`advanced-toggle ${showAdvanced ? 'active' : ''}`}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Simple' : 'Advanced'}
        </button>
        
        {showAdvanced && (
          <div className="advanced-filters">
            <div className="filter-group">
              <span className="filter-label">Author:</span>
              <select 
                className="author-filter"
                onChange={(e) => onSearch({ ...filters, author: e.target.value })}
              >
                <option value="">All Authors</option>
                <option value="following">Following</option>
              </select>
            </div>
            
            <div className="filter-group">
              <span className="filter-label">Date Range:</span>
              <select 
                className="date-filter"
                onChange={(e) => onSearch({ ...filters, dateRange: e.target.value })}
              >
                <option value="">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>
            
            <div className="filter-group">
              <span className="filter-label">Quality:</span>
              <div className="quality-filter">
                <label>
                  <input 
                    type="checkbox"
                    checked={filters.highQuality}
                    onChange={(e) => onSearch({ ...filters, highQuality: e.target.checked })}
                  />
                  High Quality Posts
                </label>
                <label>
                  <input 
                    type="checkbox"
                    checked={filters.noSpam}
                    onChange={(e) => onSearch({ ...filters, noSpam: e.target.checked })}
                  />
                  No Spam
                </label>
                <label>
                  <input 
                    type="checkbox"
                    checked={filters.hasMedia}
                    onChange={(e) => onSearch({ ...filters, hasMedia: e.target.checked })}
                  />
                  Has Media Content
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedControls;