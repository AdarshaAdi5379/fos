import React from 'react';
import { COMMON_INPUT_PROPS } from './constants';

const Input = ({ 
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  onFocus,
  error = '',
  disabled = false,
  className = '',
  ...props 
}) => {
  const baseClasses = 'input';
  const errorClasses = error ? 'input--error' : '';
  const disabledClasses = disabled ? 'input--disabled' : '';
  
  return (
    <div className={`input-container ${className}`}>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        disabled={disabled}
        className={`${baseClasses} ${errorClasses} ${disabledClasses}`}
        aria-label={props['aria-label']}
        role={props.role || 'textbox'}
        tabIndex={props.tabIndex !== undefined ? props.tabIndex : COMMON_INPUT_PROPS.tabIndex}
        autoComplete={COMMON_INPUT_PROPS.autoComplete}
        required={COMMON_INPUT_PROPS.required}
        {...(props.role ? {} : { role: undefined })}
      />
      {error && (
        <span className="input-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default Input;