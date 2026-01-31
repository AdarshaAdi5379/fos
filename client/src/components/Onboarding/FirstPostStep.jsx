import React, { useState } from 'react';
import { Button } from '../Common/Button';

const FirstPostStep = ({ onComplete }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!content.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Use the actual crypto manager from parent context
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          // publicKey, signature, recovery will be handled by parent
        })
      });
      
      if (response.ok) {
        setIsSubmitted(true);
        setContent('');
        
        // Trigger parent completion
        setTimeout(() => {
          onComplete();
        }, 1500);
      } else {
        setIsSubmitting(false);
      }
    } catch (error) {
      setIsSubmitting(false);
      console.error('Failed to create first post:', error);
    }
  };
  
  return (
    <div className="step">
      <div className="step-icon">
        <div className="first-post-icon">✍</div>
      </div>
      
      <div className="step-content">
        <h2>Create Your First Post</h2>
        <p className="step-description">
          Share your first thought with the Unbound community. Every voice matters.
        </p>
        
        <form onSubmit={handleSubmit} className="first-post-form">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            rows={4}
            className="first-post-textarea"
            required
          />
          
          <div className="first-post-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !content.trim()}
              className="submit-button"
            >
              {isSubmitting ? 'Posting...' : 'Post to Unbound'}
            </Button>
          </div>
        </form>
        
        {isSubmitted && (
          <div className="success-message">
            <div className="success-icon">✓</div>
            <h3>Success!</h3>
            <p>Your first post has been shared with the world.</p>
            <p>Your cryptographic identity is now active and ready for expression.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FirstPostStep;