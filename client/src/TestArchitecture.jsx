// Test the new component architecture
import React from 'react';
import { Button } from './src/components/Common/Button';
import { Input } from './src/components/Common/Input';

const TestArchitecture = () => {
  return (
    <div className="app-container">
      <div className="card">
        <h1>Component Architecture Test</h1>
        <p>Testing the new modular component system...</p>
        
        <div style={{ marginBottom: '2rem' }}>
          <h2>Button Component Test</h2>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <Button onClick={() => console.log('Primary clicked')} variant="primary">
              Primary Button
            </Button>
            <Button onClick={() => console.log('Secondary clicked')} variant="secondary">
              Secondary Button
            </Button>
            <Button onClick={() => console.log('Disabled clicked')} disabled>
              Disabled Button
            </Button>
          </div>
          
          <h2>Input Component Test</h2>
          <div style={{ marginBottom: '1rem' }}>
            <Input 
              type="text"
              placeholder="Test input..."
              onChange={(e) => console.log('Input changed:', e.target.value)}
            />
            <Input 
              type="text"
              placeholder="Error input..."
              onChange={(e) => console.log('Error input changed:', e.target.value)}
              error="This is a test error"
            />
          </div>
          
          <h2>Design System Test</h2>
          <div className="design-token-test">
            <h3>Typography Scale</h3>
            <div style={{ 
              '--text-base': '20px',
              '--text-secondary': '16px',
              '--accent-primary': '#2563eb'
            }} 
            className="test-token-display"
          >
              <p>Base text (20px)</p>
              <p>Secondary text (16px)</p>
              <p>Accent color (#2563eb)</p>
            </div>
          </div>
        </div>
        
        <style jsx>{`
          .test-token-display {
            font-family: 'SF Mono', monospace;
            padding: 1rem;
            background: #f8f9fa;
            border-radius: 8px;
            margin: 1rem 0;
          }
          
          .app-container {
            padding: 2rem;
            max-width: 800px;
            margin: 0 auto;
          }
        `}</style>
    </div>
  );
};

export default TestArchitecture;