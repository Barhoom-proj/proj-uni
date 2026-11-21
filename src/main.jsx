import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DemoProvider } from './context/DemoContext.jsx';
import App from './App.jsx';
import './awsConfig.js';
import { AuthProvider } from './context/AuthContext.jsx';
import './styles/base.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/mobile-auth.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider><DemoProvider><App /></DemoProvider></AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

