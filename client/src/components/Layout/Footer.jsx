import React from 'react';
import { designTokens } from '../styles/design-tokens';

const Footer = () => {
  return (
    <footer className="main-footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>Unbound</h4>
          <p>A cryptographically pseudonymous platform for unrestricted expression</p>
        </div>
        
        <div className="footer-section">
          <p>Built with React & Vite</p>
        </div>
        
        <div className="footer-section">
          <p>© 2026 Unbound Project</p>
        </div>
      </div>
      
      <div className="footer-bottom">
        <a 
          href="https://github.com/your-repo/unbound" 
          target="_blank" 
          rel="noopener noreferrer"
          className="footer-link"
        >
          Source Code
        </a>
        
        <a 
          href="/privacy" 
          className="footer-link"
        >
          Privacy
        </a>
        
        <a 
          href="/terms" 
          className="footer-link"
        >
          Terms
        </a>
      </div>
    </footer>
  );
};

export default Footer;