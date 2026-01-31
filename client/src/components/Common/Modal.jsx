import React from 'react';

const Modal = ({ 
  isOpen, 
  onClose,
  title,
  children,
  size = 'md',
  className = '',
  closable = true,
  ...props 
}) => {
  if (!isOpen) return null;
  
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };
  
  const sizeClasses = {
    sm: 'modal--sm',
    md: 'modal--md',
    lg: 'modal--lg'
  };
  
  return (
    <div className={`modal-overlay ${isOpen ? 'modal-overlay--open' : ''}`}>
      <div className={`modal ${sizeClasses[size] || ''} ${className}`} onClick={handleOverlayClick}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {closable && (
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;