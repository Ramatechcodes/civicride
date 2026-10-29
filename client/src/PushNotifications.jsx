import { useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
function decodeVapidKey(key) {
  const padding = '='.repeat((4 - key.length % 4) % 4);
  const raw = atob((key + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
}
export default function PushNotifications({ token }) {
  const [permission, setPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (token && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker registration failed:', err));
  }, [token]);
  if (!token) return null;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  async function enable() {
    if (!supported) { setMessage('Web push is not supported here. On iPhone, install CivicRide from Safari: Share → Add to Home Screen (iOS 16.4+).'); return; }
    setBusy(true); setMessage('');
    try {
      const permissionResult = await Notification.requestPermission(); setPermission(permissionResult);
      if (permissionResult !== 'granted') throw new Error('Permission not granted. Check your browser and device notification settings.');
      const keyRes = await fetch(`${API}/push/public-key`); const keyData = await keyRes.json();
      if (!keyRes.ok || !keyData.publicKey) throw new Error(keyData.message || 'Server VAPID public key is missing.');
      const registration = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(keyData.publicKey) });
      const res = await fetch(`${API}/push/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.message || 'Could not register this device.');
      setMessage('This device is registered. Use Send test to verify notification delivery.');
    } catch (e) { setMessage(e.message || 'Could not enable notifications.'); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`${API}/push/test`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.message || 'Test push failed.');
      setMessage(data.message);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <div className="push-setup-card" role="region" aria-label="Push notification setup">
    <div><b><BellRing size={17} style={{verticalAlign:'middle',marginRight:6}}/>Lock-screen notifications</b>
      <p>Register this device for ride and chat alerts when CivicRide is in the background, where supported.</p></div>
    <div className="push-setup-actions">
      <button type="button" className="primary small" onClick={enable} disabled={busy}><Bell size={15}/> {busy ? 'Please wait…' : permission === 'granted' ? 'Register this device' : 'Enable notifications'}</button>
      <button type="button" className="outline small" onClick={test} disabled={busy || permission !== 'granted'}>Send test</button>
    </div>
    {message && <p className="push-setup-message" aria-live="polite">{message}</p>}
  </div>;
}
