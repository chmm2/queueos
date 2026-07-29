import { Component } from 'react';

/**
 * Catches render-time errors anywhere below it so a single component bug shows
 * a recoverable message instead of a blank white screen. Wraps the whole app
 * in main.jsx.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // In production you'd forward this to an error tracker (e.g. Sentry).
    console.error('[ui] render error:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', background: '#f6f7fb', color: '#374151', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
              The page hit an unexpected error. Reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.assign('/')}
              style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#3b6fe0', color: '#fff', fontSize: 14, cursor: 'pointer' }}
            >
              Reload the app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
