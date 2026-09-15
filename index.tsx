import React from 'react';
import './index.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './sw-register';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for offline support and performance
registerServiceWorker();
