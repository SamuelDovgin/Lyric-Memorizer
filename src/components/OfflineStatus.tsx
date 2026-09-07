import { useEffect, useState } from 'react';
export function OfflineStatus() {
  const [status, setStatus] = useState('Saving the app for offline use…');
  useEffect(() => {
    let active = true;
    if (!('serviceWorker' in navigator)) { setStatus('Offline app caching is unavailable in this browser.'); return; }
    const timer = setTimeout(() => { if (active) setStatus('Offline setup is not ready. Connect to the internet and reopen the app.'); }, 20000);
    void navigator.serviceWorker.ready.then(() => { if (active) { clearTimeout(timer); setStatus('App ready offline · Imported songs stay on this device'); } });
    return () => { active = false; clearTimeout(timer); };
  }, []);
  return <p className="offline-status" role="status">{status}</p>;
}
