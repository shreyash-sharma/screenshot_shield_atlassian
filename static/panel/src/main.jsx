import React from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import App from './App.jsx';
import './styles.css';

// Jira supplies its own design tokens and light or dark mode to the panel.
Promise.resolve(view.theme?.enable?.()).catch(() => {});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
