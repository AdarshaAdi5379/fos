import { useState, useRef, useEffect } from 'react';

interface ComposeBoxProps {
  onPost: (content: string) => Promise<void>;
  isLoading?: boolean;
  publicKey?: string;
  maxLength?: number;
}

export function ComposeBox({ onPost, isLoading = false, publicKey, maxLength = 500 }: ComposeBoxProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remainingChars = maxLength - content.length;
  const isOverLimit = remainingChars < 0;
  const isNearLimit = remainingChars <= 50 && remainingChars > 0;
  const canPost = content.trim().length > 0 && !isOverLimit && !isLoading;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const handlePost = async () => {
    if (!canPost) return;
    
    try {
      await onPost(content);
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to post:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to post
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canPost) {
      e.preventDefault();
      handlePost();
    }
  };

  // Generate avatar initial from public key
  const avatarInitial = publicKey ? publicKey.substring(2, 3).toUpperCase() : '?';

  return (
    <div className="compose-box">
      <div className="compose-container">
        <div className="compose-avatar">
          {avatarInitial}
        </div>
        <div className="compose-content">
          <textarea
            ref={textareaRef}
            className="compose-textarea"
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <div className="compose-footer">
            <div 
              className={`char-count ${isOverLimit ? 'error' : isNearLimit ? 'warning' : ''}`}
            >
              {remainingChars}
            </div>
            <button 
              className="btn btn-primary btn-post-submit"
              onClick={handlePost}
              disabled={!canPost}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner-sm"></span>
                  Posting...
                </>
              ) : (
                'Post'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComposeBox;
