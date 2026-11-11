import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SyncGate } from './SyncGate';
import './styles.css';
import './styles/ssw-theme.css';
import './styles/ssw-mobile.css';
import './styles/ssw-simple-09c2.css';
import './styles/ssw-compact-09c3.css';
import './styles/ssw-operations-09c4.css';
import './styles/ssw-control-09c5.css';
import './styles/ssw-chegada-09c6.css';
import './styles/ssw-jogos-09c7.css';
import './styles/ssw-times-09c8.css';

import './styles/ssw-interactions-09c9.css';

import './styles/ssw-navegacao-limpa.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><SyncGate><App/></SyncGate></React.StrictMode>,
);
