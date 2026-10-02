import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './monacoSetup';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalDiagnosticHandlers } from './services/diagnosticReporter';

installGlobalDiagnosticHandlers();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
