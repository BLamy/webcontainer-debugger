import React from 'react';
import ReactDOM from 'react-dom/client';
import { WebContainerProvider } from './WebContainerProvider';
import WebContainerDebugger from './WebContainerDebugger';
import '../index.css'; // Ensure styles are imported

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WebContainerProvider>
      <WebContainerDebugger />
    </WebContainerProvider>
  </React.StrictMode>
); 