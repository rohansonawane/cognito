import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DemoOne from '@/components/ui/demo';
import { EnterpriseApp } from './enterprise/EnterpriseApp';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

function Root() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  // Show app at '/', serve landing at '/landing'
  if (path === '/landing' || path.startsWith('/landing')) return <DemoOne />;
  if (path === '/enterprise' || path.startsWith('/enterprise')) {
    return <EnterpriseApp onCanvasMode={() => window.location.href = '/'} />;
  }
  return <AppWithEnterpriseToggle />;
}

function AppWithEnterpriseToggle() {
  const [enterpriseMode, setEnterpriseMode] = useState(false);
  if (enterpriseMode) {
    return <EnterpriseApp onCanvasMode={() => setEnterpriseMode(false)} />;
  }
  return <App onEnterpriseMode={() => setEnterpriseMode(true)} />;
}

root.render(<Root />);


