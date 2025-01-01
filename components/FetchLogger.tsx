'use client'

import { useEffect } from 'react'

export default function FetchLogger() {
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      console.log('Fetch request:', args);
      return originalFetch.apply(this, args);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}

