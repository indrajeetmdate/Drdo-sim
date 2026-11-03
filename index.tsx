
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global guard: Prevent mousewheel & touchpad scrolling from inadvertently changing numeric input values anywhere in the app
if (typeof window !== 'undefined') {
  const preventNumberScroll = (e: WheelEvent) => {
    const target = e.target;
    const activeEl = document.activeElement;

    if (target instanceof HTMLInputElement && target.type === 'number') {
      e.preventDefault();
      target.blur();
    } else if (activeEl instanceof HTMLInputElement && activeEl.type === 'number') {
      activeEl.blur();
    }
  };

  // Intercept at capture phase with passive: false so preventDefault() stops native spin stepper
  window.addEventListener('wheel', preventNumberScroll, { passive: false, capture: true });
  document.addEventListener('wheel', preventNumberScroll, { passive: false, capture: true });

  // Direct element hook on focus to ensure element-level wheel cancellation
  document.addEventListener(
    'focusin',
    (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
        const input = e.target;
        input.onwheel = (we: Event) => {
          we.preventDefault();
          input.blur();
        };
      }
    },
    true
  );
}

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

