import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DemoOne from '@/components/ui/demo';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

function Root() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  // Show app at '/', serve landing at '/landing'
  if (path === '/landing' || path.startsWith('/landing')) return <DemoOne />;
  return <App />;
}

root.render(<Root />);


