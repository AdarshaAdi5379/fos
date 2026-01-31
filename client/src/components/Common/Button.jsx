import React from 'react';
import { ACCESSIBLE_BUTTON_PROPS, ANIMATION_DURATIONS } from '../Common/constants';

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  ...props 
}) => {
  const baseClasses = 'btn btn--' + variant + ' btn--' + size;
  const disabledClasses = disabled ? 'btn--disabled' : '';
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${disabledClasses} ${className}`.trim()}
      aria-label={props['aria-label']}
      role={props.role || ACCESSIBLE_BUTTON_PROPS.role}
      tabIndex={props.tabIndex !== undefined ? props.tabIndex : ACCESSIBLE_BUTTON_PROPS.tabIndex}
      style={{ 
        transitionDuration: ANIMATION_DURATIONS.NORMAL
      }}
      {...(props.role ? {} : { role: undefined })}
    >
      {children}
    </button>
  );
};

export default Button;