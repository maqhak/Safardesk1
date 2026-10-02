// Ensure window.fetch has both getter and setter in iframe/sandbox environments
try {
  const targetObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (targetObj && typeof targetObj.fetch === 'function') {
    const origFetch = targetObj.fetch.bind(targetObj);
    let activeFetch = origFetch;
    const desc = Object.getOwnPropertyDescriptor(targetObj, 'fetch');
    if (!desc || !desc.set) {
      try {
        Object.defineProperty(targetObj, 'fetch', {
          get: () => activeFetch,
          set: (fn) => { activeFetch = fn; },
          configurable: true,
          enumerable: true,
        });
      } catch {
        if (typeof Window !== 'undefined' && Window.prototype) {
          try {
            Object.defineProperty(Window.prototype, 'fetch', {
              get: () => activeFetch,
              set: (fn) => { activeFetch = fn; },
              configurable: true,
              enumerable: true,
            });
          } catch {
            // ignore
          }
        }
      }
    }
  }
} catch {
  // ignore
}

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
