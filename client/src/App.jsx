import { useEffect, useRef, useState } from 'react';

import { GoogleLogin } from '@react-oauth/google';

import { CarFront, MapPin, Wallet, ShieldCheck, UserRound, Clock3, Star, LogOut, Navigation, CheckCircle2, Home as HomeIcon, ClipboardList, LayoutDashboard, MessageCircle, History } from 'lucide-react';

import OpsMap from './OpsMap.jsx';

import ContactCenter from './ContactCenter.jsx';

import DriverApprovals from './DriverApprovals.jsx';

import DriverDocuments from './DriverDocuments.jsx';

import { MAX_DOC_BYTES } from './constants.js';

import { io } from 'socket.io-client';
import RideMap from './RideMap.jsx';



const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const money = n => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n || 0);



export default function App() {

  const [role, setRole] = useState('passenger');

  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('cr_user')); } catch { return null; } });

  const [token, setToken] = useState(() => localStorage.getItem('cr_token') || '');

  const [sessionReady, setSessionReady] = useState(() => !localStorage.getItem('cr_token'));

  const [view, setView] = useState('home');

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', code: '', pickup: '', destination: '', category: 'economy', paymentMethod: 'cash' });

  const [notice, setNotice] = useState('');

  const [rides, setRides] = useState([]);
  const [pickupPoint, setPickupPoint] = useState(null);
  const [destinationPoint, setDestinationPoint] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [liveDriverLocation, setLiveDriverLocation] = useState(null);
  const [livePassengerLocation, setLivePassengerLocation] = useState(null);
  const [locationMessage, setLocationMessage] = useState('Location not selected yet');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [pickupResults, setPickupResults] = useState([]);
  const [destinationResults, setDestinationResults] = useState([]);
  const [searchingDrivers, setSearchingDrivers] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('cr_theme') !== 'light');
  const [topupAmount, setTopupAmount] = useState('5000');
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [availableRides, setAvailableRides] = useState([]);

  const [adminStats, setAdminStats] = useState(null);

  const [adminDrivers, setAdminDrivers] = useState([]);

  const [adminUsers, setAdminUsers] = useState([]);

  const [adminRides, setAdminRides] = useState([]);

  const [adminTab, setAdminTab] = useState('drivers');
const [selectedDocumentDriverId, setSelectedDocumentDriverId] = useState(null);

  const [busy, setBusy] = useState(false);

  const [shareData, setShareData] = useState(null);

  const [driverDocKind, setDriverDocKind] = useState('identity');

  const [driverFile, setDriverFile] = useState(null);

  const [driverDocuments, setDriverDocuments] = useState([]);

  const [vehicleForm, setVehicleForm] = useState({ make: '', model: '', year: '', color: '', plateNumber: '', vehicleType: 'sedan', seats: '4', category: 'economy' });

  const [adminIncidents, setAdminIncidents] = useState([]);
  const [adminActivity, setAdminActivity] = useState([]);

  const [adminLastUpdated, setAdminLastUpdated] = useState(null);

  const adminLoadingRef = useRef(false);

  const adminReloadRef = useRef(false);

  const [uploading, setUploading] = useState(false);

  const [fileKey, setFileKey] = useState(0);
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('cr_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  async function changePassword(e) {
    e.preventDefault();
    if (newPassword.length < 10) { setNotice('Your new password must contain at least 10 characters.'); return; }
    if (newPassword !== confirmPassword) { setNotice('The new password and confirmation do not match.'); return; }
    setSavingPassword(true);
    try {
      const d = await api('/auth/change-password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
      setNotice(d.message || 'Password updated successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e) { setNotice(e.message); }
    finally { setSavingPassword(false); }
  }





  const update = (k, v) => setForm(old => ({ ...old, [k]: v }));



async function api(path, options = {}) {
  const r = await fetch(`${API}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.message || `Request failed (${r.status})`);
  }

  return data;
}


  function signedIn(data) {

    setToken(data.token); setUser(data.user); setSessionReady(true); localStorage.setItem('cr_token', data.token); localStorage.setItem('cr_user', JSON.stringify(data.user)); setView('home'); setNotice(data.message || 'Welcome to CivicRide');

  }

  async function reverseGeocode(lat, lng) {
    try { const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`); const d=await r.json(); return d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
    catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
  }
  async function searchMapPlaces(query) {
    const q=String(query||'').trim(); if(q.length<3) throw new Error('Enter at least 3 characters to search.');
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&namedetails=1&extratags=1&limit=10&countrycodes=ng&q=${encodeURIComponent(q)}`);
    if(!r.ok) throw new Error('Map search is temporarily unavailable. Try again.'); const rows=await r.json();
    return rows.map(x=>({lat:Number(x.lat),lng:Number(x.lon),address:x.display_name,title:x.name||x.namedetails?.name||x.display_name.split(',')[0],type:x.type||x.class||'place'}));
  }
  async function geocodeAddress(query) { const rows=await searchMapPlaces(query); if(!rows.length) throw new Error('No map result found. Add a street, estate, business, centre or nearby landmark.'); return rows[0]; }
  async function searchPickupPlaces() { setBusy(true); try { const rows=await searchMapPlaces(form.pickup); setPickupResults(rows); if(!rows.length)setNotice('No matching pickup addresses. Try a street name plus area and city.'); } catch(e){setNotice(e.message)} finally{setBusy(false)} }
  async function searchDestinationPlaces() { setBusy(true); try { const rows=await searchMapPlaces(destinationQuery||form.destination); setDestinationResults(rows); if(!rows.length)setNotice('No matching destinations. Try a full address, business or landmark.'); } catch(e){setNotice(e.message)} finally{setBusy(false)} }
  function selectMapPlace(place, kind) { if(kind==='pickup'){setPickupPoint(place);update('pickup',place.address);setPickupResults([]);setLocationMessage('Pickup address selected');}else{setDestinationPoint(place);update('destination',place.address);setDestinationQuery(place.address);setDestinationResults([]);} setNotice(`${kind==='pickup'?'Pickup':'Destination'} selected: ${place.address}`); }
  async function useMyLocation() {
    if(!navigator.geolocation){setNotice('This browser does not support location.');return;}
    setLocationMessage('Requesting location permission…');
    navigator.geolocation.getCurrentPosition(async pos=>{const point={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy};const address=await reverseGeocode(point.lat,point.lng);const next={...point,address};setPickupPoint(next);update('pickup',address);setLocationMessage('Pickup set from your device GPS');},err=>{setLocationMessage('Location permission is required to use your current position.');setNotice(err.code===1?'Please allow location access in browser or phone settings.':'Could not get your location. Check GPS and try again.');},{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
  }
  async function searchPickup(e) { e?.preventDefault?.(); await searchPickupPlaces(); }
  async function searchDestination(e) { e?.preventDefault?.(); await searchDestinationPlaces(); }
  async function chooseDestinationOnMap(point) { const address=await reverseGeocode(point.lat,point.lng);const p={...point,address};setDestinationPoint(p);update('destination',address);setDestinationQuery(address);setNotice('Destination pin placed on the map.'); }
  async function loadNearbyDrivers() { if(!pickupPoint||user?.role!=='passenger'||!token)return;setSearchingDrivers(true);try{const d=await api(`/rides/nearby-drivers?lat=${encodeURIComponent(pickupPoint.lat)}&lng=${encodeURIComponent(pickupPoint.lng)}&category=${encodeURIComponent(form.category)}`);setNearbyDrivers(d.drivers||[])}catch{}finally{setSearchingDrivers(false)} }
  async function setDriverAvailability(online) {
  try {
    if (online) {
      if (user?.driverStatus !== 'approved') throw new Error('Your driver account must be approved by an administrator before you can go online.');
      if (!navigator.geolocation) throw new Error('This device/browser does not support GPS location.');
      setNotice('Checking GPS permission and current location…');
      const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
      const available = await api('/drivers/availability', { method: 'PATCH', body: JSON.stringify({ online: true }) });
      await api('/drivers/location', { method: 'PATCH', body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }) });
      const nextUser = { ...user, driverOnline: true };
      setUser(nextUser); localStorage.setItem('cr_user', JSON.stringify(nextUser));
      setNotice(`${available.message} GPS location confirmed. Keep location permission enabled and this app open to receive nearby requests.`);
      await loadAvailableRides();
    } else {
      const d = await api('/drivers/availability', { method: 'PATCH', body: JSON.stringify({ online: false }) });
      const nextUser = { ...user, driverOnline: false };
      setUser(nextUser); localStorage.setItem('cr_user', JSON.stringify(nextUser)); setNotice(d.message);
    }
  } catch (e) {
    const message = e?.code === 1 ? 'Location permission was denied. Allow location for CivicRide in browser/device settings, then try Go online again.' : e?.code === 2 ? 'Your device could not determine its GPS position. Turn on Location/GPS and retry.' : e?.code === 3 ? 'GPS timed out. Move where you have a clearer signal and try again.' : e.message;
    setNotice(message || 'Could not change driver availability.');
  }
}

async function requestOtp() {

    setBusy(true); setNotice('');

    try { const d = await api('/auth/otp/request', { method: 'POST', body: JSON.stringify({ email: form.email, purpose: 'register' }) }); setNotice(d.message + ' Then enter the code below.'); }

    catch (e) { setNotice(e.message); } finally { setBusy(false); }

  }

  async function register(e) {

    e.preventDefault(); setBusy(true);

    try { signedIn(await api('/auth/register/verify', { method: 'POST', body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone, password: form.password, role, code: form.code }) })); }

    catch (e) { setNotice(e.message); } finally { setBusy(false); }

  }

  async function login(e) {

    e.preventDefault(); setBusy(true);

    try { signedIn(await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.email, password: form.password }) })); }

    catch (e) { setNotice(e.message); } finally { setBusy(false); }

  }

  async function googleLogin(credentialResponse) {

    setBusy(true);

    try { signedIn(await api('/auth/google', { method: 'POST', body: JSON.stringify({ credential: credentialResponse.credential, role }) })); }

    catch (e) { setNotice(e.message); } finally { setBusy(false); }

  }

  async function loadRides() {

    try { const d = await api('/rides/mine'); setRides(d.rides || []); }

    catch (e) { setNotice(e.message); }

  }

  async function loadAvailableRides() {

    if (user?.role !== 'driver') return;

    try { const d = await api('/rides/available'); setAvailableRides(d.rides || []); } catch (e) { setNotice(e.message); }

  }

  async function loadAdmin() {

    if (adminLoadingRef.current) { adminReloadRef.current = true; return; }

    adminLoadingRef.current = true;

    try {

      const d = await api('/admin/dashboard');

      setAdminStats(d.stats || null);

      setAdminDrivers(d.drivers || []);

      setAdminRides(d.rides || []);

      setAdminIncidents(d.incidents || []);

      setAdminUsers(d.users || []);

      setAdminLastUpdated(d.serverTime || new Date().toISOString());

    } catch (e) { setNotice(e.message); }

    finally { adminLoadingRef.current = false; if (adminReloadRef.current) { adminReloadRef.current = false; loadAdmin(); } }

  }

  async function reviewDriver(id, decision) {

    try { const d=await api(`/admin/drivers/${id}/decision`,{method:'PATCH',body:JSON.stringify({decision})}); setNotice(d.message); await loadAdmin(); }

    catch(e) { setNotice(e.message); }

  }

  async function shareTrip(rideId) {

    try { const d=await api(`/rides/${rideId}/share`,{method:'POST',body:JSON.stringify({})}); await navigator.clipboard?.writeText(d.shareUrl); setNotice(`${d.message} Link: ${d.shareUrl}`); }

    catch(e){setNotice(e.message)}

  }

  async function sendSOS(rideId) {

    if(!window.confirm('Send an SOS alert to CivicRide administrators? If you are in immediate danger, call local emergency services directly.')) return;

    let coords={}; try { const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:5000})); coords={lat:pos.coords.latitude,lng:pos.coords.longitude}; } catch {}

    try { const d=await api('/safety/sos',{method:'POST',body:JSON.stringify({rideId,...coords,note:'Passenger/driver triggered SOS'})}); setNotice(d.message); } catch(e){setNotice(e.message)}

  }

  async function loadDriverProfile() {

    try { const [p,d] = await Promise.all([api('/drivers/profile'),api('/drivers/documents')]); const v=p.vehicle||{}; setVehicleForm({make:v.make||'',model:v.model||'',year:v.year||'',color:v.color||'',plateNumber:v.plateNumber||'',vehicleType:v.vehicleType||'sedan',seats:v.seats||'4',category:v.category||'economy'}); setDriverDocuments(d.documents||[]); } catch(e) { setNotice(e.message); }

  }



async function saveVehicle(e) {
  e.preventDefault();

  try {
    const d = await api('/drivers/profile', {
      method: 'PATCH',
      body: JSON.stringify({ vehicle: vehicleForm }),
    });

    setNotice(d.message || 'Vehicle details saved successfully.');
    await loadDriverProfile();
  } catch (e) {
    setNotice(e.message || 'Could not save vehicle details.');
  }
}



  async function refreshMe() {

    try { const d = await api('/auth/me'); if (d.user) { setUser(d.user); localStorage.setItem('cr_user', JSON.stringify(d.user)); } } catch { /* keep the cached profile */ }

  }

  async function uploadDriverDocument(e) {

    e.preventDefault();

    if (!driverFile) { setNotice('Choose a document file first'); return; }

    if (driverFile.size > MAX_DOC_BYTES) { setNotice('That file is larger than 8 MB. Choose a smaller file.'); return; }

    const body = new FormData(); body.append('kind', driverDocKind); body.append('file', driverFile);

    setUploading(true);

    try {

      const r = await fetch(`${API}/drivers/documents`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });

      const d = await r.json().catch(() => ({}));

      if (!r.ok) throw new Error(d.message || `Upload failed (${r.status})`);

      setNotice(d.message || 'Document uploaded for review'); setDriverFile(null); setFileKey(k => k + 1);

      if (d.documents) setDriverDocuments(d.documents); else await loadDriverProfile();

    } catch (err) { setNotice(err.message === 'Failed to fetch' ? 'Could not reach the CivicRide server. Check your connection and that the API is running.' : err.message); }

    finally { setUploading(false); }

  }

  async function reviewIncident(id,status) { try { await api(`/admin/incidents/${id}`,{method:'PATCH',body:JSON.stringify({status})}); await loadAdmin(); setNotice('Incident updated'); } catch(e){setNotice(e.message)} }

  async function setUserStatus(target, status) {

    const reason = status === 'active' ? '' : (window.prompt(`Reason for ${status} account ${target.name}:`, target.accountStatusReason || '') ?? null);

    if (reason === null) return;

    if (status !== 'active' && !reason.trim()) { setNotice('Please provide a reason for this action.'); return; }

    try { const d = await api(`/admin/users/${target._id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }); setNotice(d.message); await loadAdmin(); } catch (e) { setNotice(e.message); }

  }

  async function deleteUser(target) {

    if (!window.confirm(`Permanently delete ${target.name} (${target.email || target.phone || target._id})? This cannot be undone. Historical ride and incident records will be retained.`)) return;

    try { const d = await api(`/admin/users/${target._id}`, { method: 'DELETE' }); setNotice(d.message); await loadAdmin(); } catch (e) { setNotice(e.message); }

  }

  useEffect(() => { const match=window.location.pathname.match(/^\/share\/([a-f0-9]{64})$/); if(!match)return; let cancelled=false;const load=()=>fetch(`${API}/safety/share/${match[1]}`,{cache:'no-store'}).then(r=>r.json()).then(d=>{if(!cancelled)setShareData(d)}).catch(()=>{if(!cancelled)setShareData({message:'Trip link could not be loaded'})});load();const timer=setInterval(load,15000);return()=>{cancelled=true;clearInterval(timer)}; }, []);

  useEffect(() => { if (!token) { setSessionReady(true); return; } let cancelled=false; setSessionReady(false); fetch(`${API}/auth/me`, {headers:{Authorization:`Bearer ${token}`},cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||'Session expired');if(!cancelled&&d.user){setUser(d.user);localStorage.setItem('cr_user',JSON.stringify(d.user));}}).catch(()=>{if(!cancelled){localStorage.removeItem('cr_token');localStorage.removeItem('cr_user');setToken('');setUser(null);}}).finally(()=>{if(!cancelled)setSessionReady(true)});return()=>{cancelled=true}; }, [token]);

  // Wait for the server to confirm the current role before calling role-protected APIs.

  // This prevents a cached admin UI from making repeated admin requests with a driver token.

  useEffect(() => { if(!sessionReady || !user || !token) return; if(user.role==='admin') loadAdmin(); else { loadRides(); if(user.role==='driver') { loadAvailableRides(); loadDriverProfile(); } } }, [user?.role,user?.id,token,sessionReady]);

  useEffect(() => {

    if (!sessionReady || !user || !token || !['admin', 'driver'].includes(user.role)) return;

    const role = user.role;

    const socket = io(API.replace(/\/api\/?$/, ''), { auth: { token }, transports: ['polling', 'websocket'], reconnection: true });

    let timer; let firstConnect = true;

    const soon = fn => { clearTimeout(timer); timer = setTimeout(fn, 250); };

    socket.on('connect', () => { if (!firstConnect) { if (role === 'admin') loadAdmin(); else { refreshMe(); loadDriverProfile(); } } firstConnect = false; });

    if (role === 'admin') socket.on('admin:changed', () => soon(loadAdmin));
    if (role === 'admin') socket.on('driver:location', ev => { if(!ev?.driverId)return; setAdminDrivers(old=>old.map(d=>String(d._id)===String(ev.driverId)?{...d,currentLocation:{...(d.currentLocation||{}),lat:ev.lat,lng:ev.lng,updatedAt:ev.updatedAt},driverOnline:true}:d)); });

    if (role === 'driver') socket.on('driver:updated', ev => soon(async () => {

      await refreshMe(); await loadDriverProfile();

      if (ev?.reason === 'decision') setNotice(ev.driverStatus === 'approved' ? 'Good news — your driver account has been approved!' : ev.driverStatus === 'rejected' ? 'Your driver application was rejected. See the admin note on this page.' : 'Your driver application is back under review.');

      else if (ev?.reason === 'document') setNotice(ev.status === 'rejected' ? 'An admin rejected one of your documents. See the reason below and upload a new file.' : ev.status === 'approved' ? 'One of your documents was approved.' : 'A document status changed.');

    }));

    socket.on('connect_error', () => { /* the periodic refresh below keeps things current if WebSockets are blocked */ });

    // Safety net: if the socket is blocked by a proxy, still refresh while the tab is visible.

    const poll = setInterval(() => { if (document.hidden) return; if (role === 'admin') loadAdmin(); else refreshMe(); }, role === 'admin' ? 30000 : 60000);

    return () => { clearTimeout(timer); clearInterval(poll); socket.disconnect(); };

  }, [user?.role, user?.id, token, sessionReady]);

  // Flutterwave sends the passenger back to /payment-result?status=...&transaction_id=...; confirm it with the server.

  useEffect(() => {

    if (!sessionReady || !user || !token || window.location.pathname !== '/payment-result') return;

    const q = new URLSearchParams(window.location.search); const txId = q.get('transaction_id'); const status = q.get('status');

    window.history.replaceState({}, '', '/');

    if (!txId || !['successful', 'completed'].includes(status)) { setNotice('Payment was not completed. You can try again from My rides.'); return; }

    api(`/payments/verify/${encodeURIComponent(txId)}`).then(d => { setNotice(d.message || 'Payment verified'); setView('rides'); loadRides(); }).catch(e => setNotice(e.message));

  }, [sessionReady, token, user?.id]);

  useEffect(()=>{
    if(!sessionReady||!user||!token||user.role==='admin')return;
    const socket=io(API.replace(/\/api\/?$/,''),{auth:{token},transports:['polling','websocket'],reconnection:true});
    const joinActive=()=>rides.filter(r=>['requested','accepted','arriving','in_progress'].includes(r.status)).forEach(r=>socket.emit('ride:join',{rideId:r._id}));
    socket.on('connect',joinActive);
    socket.on('ride:request',()=>{if(user.role==='driver'){loadAvailableRides();setNotice('A new nearby ride request is available.')}});
    socket.on('ride:updated',async ev=>{loadRides();loadAvailableRides();if(user.role==='passenger'&&ev?.status==='accepted'){setNotice('A driver accepted your ride. Check the vehicle plate and live approach map.');if('Notification' in window&&Notification.permission==='granted'){try{const d=await api('/rides/mine');const ride=(d.rides||[]).find(x=>String(x._id)===String(ev.rideId));const v=ride?.driver?.vehicle||{};const vehicle=[v.color,v.make,v.model].filter(Boolean).join(' ')||'Vehicle details pending';const plate=v.plateNumber?`Plate ${v.plateNumber}`:'Plate number pending';new Notification('CivicRide: driver accepted',{body:`Your driver is on the way. ${vehicle} · ${plate}. Open CivicRide to follow the live approach.`})}catch{try{new Notification('CivicRide: driver accepted',{body:'Your driver is on the way. Open CivicRide to view live location.'})}catch{}}}}});
    socket.on('ride:location',ev=>setLiveDriverLocation(ev));
    socket.on('ride:passenger-location',ev=>setLivePassengerLocation(ev));
    return()=>socket.disconnect();
  },[sessionReady,user?.role,user?._id,token,rides.map(r=>r._id+':'+r.status).join('|')]);
  useEffect(()=>{if(user?.role==='passenger'&&pickupPoint&&token){loadNearbyDrivers();const t=setInterval(loadNearbyDrivers,20000);return()=>clearInterval(t)}},[user?.role,token,pickupPoint?.lat,pickupPoint?.lng,form.category]);

useEffect(()=>{
    if(!user||user.role!=='passenger'||!token||!navigator.geolocation||!rides.some(r=>['accepted','arriving','in_progress'].includes(r.status)))return;
    let last=0;const watch=navigator.geolocation.watchPosition(async pos=>{if(Date.now()-last<15000)return;last=Date.now();try{await api('/rides/passenger-location',{method:'PATCH',body:JSON.stringify({lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy})})}catch{}},()=>{}, {enableHighAccuracy:true,maximumAge:10000,timeout:15000});
    return()=>navigator.geolocation.clearWatch(watch);
  },[user?.role,user?._id,token,rides.map(r=>r._id+':'+r.status).join('|')]);

  useEffect(()=>{
    if(!sessionReady||!user||!token||window.location.pathname!=='/wallet-result') return;
    const q=new URLSearchParams(window.location.search); const txId=q.get('transaction_id'); const status=q.get('status');
    window.history.replaceState({},'', '/');
    if(!txId||!['successful','completed'].includes(status)){setNotice('Wallet top-up was not completed.');return;}
    api(`/payments/wallet/verify/${encodeURIComponent(txId)}`).then(async d=>{setNotice(d.message);await refreshMe();setView('home');}).catch(e=>setNotice(e.message));
  },[sessionReady,token,user?._id]);

  async function loadWalletHistory(){try{const d=await api('/payments/wallet/history');setWalletTransactions(d.transactions||[])}catch(e){setNotice(e.message)}}
  async function topUpWallet(){
    try{const amount=Number(topupAmount);if(!Number.isFinite(amount)||amount<500)throw new Error('Minimum top-up is ₦500.');const d=await api('/payments/wallet/initialize',{method:'POST',body:JSON.stringify({amount})});window.location.href=d.paymentUrl;}
    catch(e){setNotice(e.message)}
  }

  useEffect(() => {
    if (!user || user.role !== 'driver' || user.driverStatus !== 'approved' || !user.driverOnline || !token || !navigator.geolocation) return;
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(async pos => {
      if (Date.now() - lastSent < 12000) return;
      lastSent = Date.now();
      try {
        await api('/drivers/location', { method: 'PATCH', body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }) });
      } catch (e) { setNotice(`You are online, but GPS update failed: ${e.message}`); }
    }, err => {
      if (err.code === 1) setNotice('GPS permission was denied. Nearby passengers cannot find you until location permission is enabled.');
      else if (err.code === 2) setNotice('GPS location is unavailable. Turn on device Location/GPS.');
      else if (err.code === 3) setNotice('GPS is taking too long. Keep the app open and retry location.');
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [user?.role, user?.driverStatus, user?.driverOnline, token]);

  useEffect(() => {
    if (!user || user.role !== 'driver' || !token) return;
    const timer = setInterval(() => { if (!document.hidden) { loadAvailableRides(); loadRides(); } }, 10000);
    return () => clearInterval(timer);
  }, [user?.role, user?.id, token, user?.driverOnline]);



    async function createRide(e) {
    e.preventDefault(); setBusy(true);
    try {
      let pickup=pickupPoint;
      if(!pickup && navigator.geolocation) pickup=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(async pos=>{const address=await reverseGeocode(pos.coords.latitude,pos.coords.longitude);resolve({lat:pos.coords.latitude,lng:pos.coords.longitude,address});},()=>reject(new Error('Allow location access or press Use my current location before requesting a ride.')),{enableHighAccuracy:true,timeout:12000}));
      let destination=destinationPoint;
      if(!destination) destination=await geocodeAddress(form.destination);
      if(!pickup || !destination) throw new Error('Select both pickup and destination from map search before requesting a ride.');
      setPickupPoint(pickup); setDestinationPoint(destination); update('pickup',pickup.address); update('destination',destination.address);
      setSearchingDrivers(true); await loadNearbyDrivers();
      const d=await api('/rides',{method:'POST',body:JSON.stringify({pickup,destination,category:form.category,paymentMethod:form.paymentMethod,preferredDriverId:selectedDriverId||undefined})});
      setNotice(`${d.message||'Ride requested.'} Estimated fare: ${money(d.ride.estimatedFare)} · ${d.ride.distanceKm||'—'} km`); setView('rides'); await loadRides();
    } catch(e){setNotice(e.message)} finally{setBusy(false);setSearchingDrivers(false)}
  }
async function rideAction(id, action, body = {}) {

    try { await api(`/rides/${id}/${action}`, { method: action === 'rating' ? 'POST' : 'PATCH', body: JSON.stringify(body) }); setNotice('Ride updated'); await loadRides(); await loadAvailableRides(); }

    catch (e) { setNotice(e.message); }

  }

  async function pay(rideId) {

    try { const d = await api('/payments/initialize', { method: 'POST', body: JSON.stringify({ rideId }) }); window.location.href = d.paymentUrl; }

    catch (e) { setNotice(e.message); }

  }

  function logout() { localStorage.removeItem('cr_token'); localStorage.removeItem('cr_user'); setToken(''); setUser(null); setSessionReady(true); setRides([]); setAvailableRides([]); setView('home'); setNotice('You have signed out.'); }

  const cards = [{ title: 'Economy', price: 'From ₦800', value: 'economy' }, { title: 'Comfort', price: 'From ₦1,300', value: 'comfort' }, { title: 'XL', price: 'From ₦2,000', value: 'xl' }];



  return <div className="app-shell">

    <header className="topbar"><a className="brand" onClick={() => setView('home')}><span className="brand-icon"><Navigation size={22}/></span><span>Civic<span className="green">Ride</span><small>Ride smarter. Live better.</small></span></a>

      <nav><button className="nav-link" onClick={() => setView('home')}>Home</button>{user && <>{user.role !== 'admin' && <button className="nav-link" onClick={() => { setView('rides'); loadRides(); }}>My rides</button>}{user.role === 'admin' && <button className="nav-link" onClick={() => { setView('admin'); loadAdmin(); }}>Admin console</button>}<button className="nav-link" onClick={() => setView('safety')}>Safety</button></>}{user ? <button className="outline" onClick={logout}><LogOut size={16}/> Sign out</button> : <button className="primary small" onClick={() => setView('auth')}>Get started</button>}</nav>

    </header>

    {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}

    <main>

      {!sessionReady && token ? <section className="panel session-loading"><p>Checking your secure CivicRide session…</p></section> : window.location.pathname.startsWith('/share/') ? <section className="panel"><h1>CivicRide trip sharing</h1>{shareData ? shareData.message ? <p>{shareData.message}</p> : <><p><b>Status:</b> {shareData.status}</p><p><b>Pickup:</b> {shareData.pickup}</p><p><b>Destination:</b> {shareData.destination}</p>{shareData.driver && <><p><b>Driver:</b> {shareData.driver.name}</p><p><b>Vehicle:</b> {shareData.driver.vehicle?.make||''} {shareData.driver.vehicle?.model||''} · {shareData.driver.vehicle?.plateNumber||'plate not provided'}</p>{shareData.driver.location && <p><a href={`https\://www.openstreetmap.org/?mlat=${shareData.driver.location.lat}&mlon=${shareData.driver.location.lng}#map=16/${shareData.driver.location.lat}/${shareData.driver.location.lng}`} target="_blank" rel="noreferrer">View latest driver location on map</a></p>}{shareData.pickupPoint&&shareData.destinationPoint&&<RideMap pickup={shareData.pickupPoint} destination={shareData.destinationPoint} liveDriverLocation={shareData.driver.location} center={shareData.driver.location||shareData.pickupPoint} height={300}/>}</>}<small>Last updated {new Date(shareData.updatedAt).toLocaleString()}</small></> : <p>Loading trip details…</p>}<p className="safety-note">This page shows limited trip information. If there is an immediate emergency, contact local emergency services.</p></section> : view === 'auth' && !user ? <section className="auth-layout">

        <div className="auth-promo"><div className="eyebrow">MOVE WITH CONFIDENCE</div><h1>Your city.<br/><span className="green">Your ride.</span></h1><p>Safe, reliable and affordable rides for the journeys that matter.</p><div className="promo-stat"><div><b>24/7</b><span>Ride requests</span></div><div><b>3</b><span>Ride categories</span></div></div></div>

        <div className="panel auth-panel"><div className="tabs"><button className={view === 'auth' ? 'active' : ''} onClick={() => setView('auth')}>Create account / Sign in</button></div>

          <p className="muted">Choose how you want to use CivicRide.</p><div className="role-switch"><button className={role === 'passenger' ? 'selected' : ''} onClick={() => setRole('passenger')}><UserRound/> Passenger</button><button className={role === 'driver' ? 'selected' : ''} onClick={() => setRole('driver')}><CarFront/> Driver</button></div>

          <GoogleLogin onSuccess={googleLogin} onError={() => setNotice('Google sign-in failed. Check OAuth configuration.')} />

          <div className="or"><span>or use email</span></div>

          <form onSubmit={login} className="form-stack"><label>Email<input type="email" value={form.email} onChange={e => update('email', e.target.value)} required placeholder="you@example.com"/></label><label>Password<input type="password" value={form.password} onChange={e => update('password', e.target.value)} required minLength="10" placeholder="At least 10 characters"/></label><button className="primary" disabled={busy}>Sign in</button></form>

          <details><summary>New to CivicRide? Create an account</summary><form onSubmit={register} className="form-stack details-form">

            <label>Full name<input value={form.name} onChange={e => update('name', e.target.value)} required/></label><label>Phone (optional)<input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+2348012345678"/></label>

            <label>Email verification code<div className="inline-input"><input value={form.code} onChange={e => update('code', e.target.value)} required inputMode="numeric" maxLength="6" placeholder="6-digit code"/><button type="button" className="outline" disabled={busy} onClick={requestOtp}>Send OTP</button></div></label>

            <button className="primary" disabled={busy}>Verify & create account</button></form></details>

          <p className="fineprint">Drivers are pending approval until their identity and vehicle documents are reviewed.</p>

        </div>

      </section> : view === 'settings' && user ? <section className="panel settings-panel"><div className="section-title"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>Settings</h2></div><span className="icon-box"><UserRound/></span></div><div className="settings-row"><div><b>Appearance</b><small>Choose a comfortable display for day or night.</small></div><button className="outline" type="button" onClick={() => setDarkMode(v => !v)}>{darkMode ? '🌙 Dark mode · On' : '☀️ Light mode · On'}</button></div><div className="settings-row"><div><b>Ride notifications</b><small>Allow ride status alerts where your browser or installed app supports them.</small></div><button className="outline" type="button" onClick={async()=>{if(!('Notification' in window)){setNotice('This browser does not support web notifications.');return;}const result=await Notification.requestPermission();setNotice(result==='granted'?'Notifications allowed. Lock-screen alerts are device/browser dependent.':`Notification permission: ${result}. You can change this in your device settings.`)}}>Enable notifications</button></div><div className="settings-section"><h3>Change password</h3><p className="muted">Use at least 10 characters. Your current password is required.</p><form className="form-stack" onSubmit={changePassword}><label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required/></label><label>New password<input type="password" autoComplete="new-password" minLength="10" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength="10" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></label><button className="primary" disabled={savingPassword}>{savingPassword?'Updating…':'Update password'}</button></form></div><div className="settings-section"><h3>Account and profile</h3><p className="muted">Signed in as <b>{user.name}</b> · {user.email} · {user.role}</p>{user.role==='driver'&&<button className="outline" type="button" onClick={()=>setView('home')}>Vehicle & driver documents</button>}<button className="outline" type="button" onClick={()=>setView('safety')}>Safety centre and SOS</button></div><p className="fineprint">For true native lock-screen live activities, CivicRide needs a native Android/iOS implementation and push/background services. Web notifications alone cannot guarantee persistent lock-screen tracking.</p></section> : view === 'safety' ? <section className="panel"><h2><ShieldCheck/> Safety centre</h2><p>Trip sharing creates a limited-view link. SOS alerts are recorded for administrators but do not automatically call emergency services.</p><div className="safety-note">If you are in immediate danger, call the appropriate local emergency service. Do not rely solely on an in-app SOS.</div>{rides.filter(r=>['accepted','arriving','in_progress'].includes(r.status)).map(r=><div className="admin-row" key={r._id}><div><b>{r.pickup.address} → {r.destination.address}</b><small>{r.status} · Ride ID {r._id}</small></div><div className="ride-actions"><button className="outline small" onClick={()=>shareTrip(r._id)}>Share trip link</button><button className="sos-button small" onClick={()=>sendSOS(r._id)}>SOS alert</button></div></div>)}<div className="feature-grid"><div className="feature"><ShieldCheck/><b>Driver verification</b><span>Drivers must be approved before accepting rides.</span></div><div className="feature"><MapPin/><b>Trip sharing</b><span>Share a limited trip status and recent driver location.</span></div><div className="feature"><Clock3/><b>Incident records</b><span>Admin users can review SOS events in the console.</span></div></div></section>

      : !user ? <section className="hero-grid"><div className="hero-copy"><div className="eyebrow"><span className="dot"/> YOUR RIDE, REIMAGINED</div><h1>Every journey<br/>starts with <span className="green">CivicRide.</span></h1><p>Reliable rides, transparent fares and a smoother way to move around your city.</p><div className="hero-actions"><button className="primary" onClick={() => { setRole('passenger'); setView('auth'); }}>Book a ride <Navigation size={17}/></button><button className="outline" onClick={() => { setRole('driver'); setView('auth'); }}>Become a driver</button></div><div className="trust-row"><span><ShieldCheck/> Safety focused</span><span><CheckCircle2/> Clear fares</span></div></div><div className="hero-art"><div className="map-grid"><div className="road road-one"/><div className="road road-two"/><div className="road road-three"/><span className="map-pin pin-a"><MapPin/></span><span className="map-pin pin-b"><CarFront/></span><span className="map-label">Your next ride</span><div className="map-card"><span className="car-bubble"><CarFront/></span><div><b>Ride in comfort</b><small>Local rides, made easy</small></div><span className="green">›</span></div></div></div></section>

      : <section className="dashboard"><div className="dashboard-head"><div><div className="eyebrow">WELCOME BACK</div><h1>Hello, {user.name.split(' ')[0]} <span className="green">✦</span></h1><p className="muted">{user.role === 'driver' ? 'Your driver workspace' : 'Where would you like to go today?'}</p></div><div className="profile-chip"><span className="avatar">{user.name[0]}</span><div><b>{user.name}</b><small>{user.role}</small></div></div></div>

        {user.role === 'admin' ? <div className="admin-console">

        <div className="admin-stats">{[['Users',adminStats?.users],['Drivers online',adminStats?.driversOnline],['Pending drivers',adminStats?.driversPending],['Approved drivers',adminStats?.driversApproved],['All rides',adminStats?.rides],['Active rides',adminStats?.activeRides],['Completed fare',money(adminStats?.grossCompletedFare||0)]].map(([label,value])=><div className="panel stat-card" key={label}><small>{label}</small><b>{value??'—'}</b></div>)}</div>

        <div className="panel"><div className="admin-tabs"><button className={adminTab==='drivers'?'active':''} onClick={()=>setAdminTab('drivers')}>Driver approvals ({adminStats?.driversPending ?? 0} pending)</button><button className={adminTab==='rides'?'active':''} onClick={()=>setAdminTab('rides')}>All ride activity</button><button className={adminTab==='users'?'active':''} onClick={async()=>{setAdminTab('users');try{const d=await api('/admin/users');setAdminUsers(d.users||[])}catch(e){setNotice(e.message)}}}>Users</button><button className={adminTab==='activity'?'active':''} onClick={()=>setAdminTab('activity')}>Activity log</button><button className={adminTab==='incidents'?'active':''} onClick={()=>setAdminTab('incidents')}>SOS / Incidents ({adminIncidents.filter(i=>i.kind==='sos'&&i.status!=='resolved').length})</button><span className="muted live-status"><span className="live-dot"/> Live updates · {adminLastUpdated ? `updated ${new Date(adminLastUpdated).toLocaleTimeString()}` : 'connecting…'}</span></div>

        {adminTab==='activity' ? (adminActivity.length===0 ? <p className="muted empty">No recorded activity yet. New ride, location and payment events will appear here.</p> : adminActivity.map(a=><div className="admin-row" key={a._id}><div><b>{a.action.replaceAll('_',' ')}</b><small>{a.actorName} · {a.actorRole} · {a.entityType}{a.entityId?` #${a.entityId}`:''}</small><small>{a.details||'No additional details'} · {new Date(a.createdAt).toLocaleString()}</small></div></div>)) : adminTab==='drivers' ? <><OpsMap drivers={adminDrivers} /><DriverApprovals drivers={adminDrivers} apiBase={API} token={token} api={api} onChanged={loadAdmin} notify={setNotice} /></> : adminTab==='rides' ? adminRides.map(r=><div className="admin-row" key={r._id}><div><b>{r.pickup?.address} → {r.destination?.address}</b><small>{r.passenger?.name||'Passenger'} · Driver: {r.driver?.name||'Unassigned'}</small><small>{r.status} · {r.paymentStatus} · {money(r.finalFare??r.estimatedFare)}</small></div><span className="status-pill">{r.status}</span></div>) : adminTab==='incidents' ? (adminIncidents.length===0 ? <p className="muted empty">No SOS alerts or safety incidents have been reported.</p> : adminIncidents.map(i=><div className={`admin-row incident-row ${i.status==='open'?'incident-open':''}`} key={i._id}><div><b>🚨 {i.kind.toUpperCase()} · {i.status.toUpperCase()}</b><small>{i.reporter?.name||'Reporter'} · {i.reporter?.phone||i.reporter?.email||'No contact details'}</small><small>{i.note||'No additional note'} · {new Date(i.createdAt).toLocaleString()}</small>{i.ride&&<small>Ride: {i.ride.pickup?.address||'Unknown pickup'} → {i.ride.destination?.address||'Unknown destination'} · Trip status: {i.ride.status||'unknown'}</small>}{Number.isFinite(i.location?.lat)&&Number.isFinite(i.location?.lng)&&<small>Reported location: {i.location.lat.toFixed(6)}, {i.location.lng.toFixed(6)} · <a href={`https\://www.google.com/maps?q=${i.location.lat},${i.location.lng}`} target="_blank" rel="noreferrer">Open map location</a></small>}</div><div className="ride-actions">{i.status==='open'&&<button className="outline small" onClick={()=>reviewIncident(i._id,'acknowledged')}>Acknowledge</button>}{i.status!=='resolved'&&<button className="primary small" onClick={()=>reviewIncident(i._id,'resolved')}>Resolve</button>}</div></div>)) : adminUsers.map(u=><div className="admin-row" key={u._id}><div><b>{u.name}</b><small>{u.email||'No email'} · {u.phone||'No phone'} · Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown'}</small><small>Role: {u.role} · Wallet: {money(u.walletBalance)} · Coins: {u.rideCoins||0} · {u.driverOnline?'Online':'Offline'} · Account: {u.accountStatus||'active'}{u.role==='driver' ? ` · Driver review: ${u.driverStatus||'pending'}` : ''}</small>{u.accountStatusReason&&<small>Reason: {u.accountStatusReason}</small>}</div><div className="ride-actions user-admin-actions">{u.role==='driver'&&<><button className="primary small" onClick={()=>reviewDriver(u._id,'approved')}>Approve driver</button><button className="outline small" onClick={()=>reviewDriver(u._id,'rejected')}>Reject driver</button></>}{u.role!=='admin'&&<>{u.accountStatus==='suspended'?<button className="primary small" onClick={()=>setUserStatus(u,'active')}>Restore</button>:<button className="outline small" onClick={()=>setUserStatus(u,'suspended')}>Suspend</button>}{u.accountStatus==='banned'?<button className="primary small" onClick={()=>setUserStatus(u,'active')}>Unban</button>:<button className="sos-button small" onClick={()=>setUserStatus(u,'banned')}>Ban</button>}<button className="sos-button small" onClick={()=>deleteUser(u)}>Delete</button></>}</div></div>)}</div>

        <p className="fineprint">Approved drivers can share browser GPS while the app is active and location permission is granted. GPS is sensitive: disclose it in your privacy policy and limit operational access. Verify identity, licence, vehicle registration, insurance and inspection documents before approval.</p></div> : user.role === 'passenger' ? <div className="dashboard-grid"><div className="panel booking-panel"><div className="section-title"><div><span className="eyebrow">PLAN YOUR JOURNEY</span><h2>Where to?</h2></div><span className="icon-box"><MapPin/></span></div>{'Notification' in window&&Notification.permission==='default'&&<button type="button" className="outline small" onClick={async()=>{const result=await Notification.requestPermission();setNotice(result==='granted'?'Ride notifications enabled. Lock-screen delivery depends on your browser/device and installed app notification permissions.':'Notifications were not enabled. Keep CivicRide open to see ride updates.')}}>Enable ride notifications</button>}<form className="form-stack" onSubmit={createRide}><div className="map-tools"><button type="button" className="outline" onClick={useMyLocation}><MapPin size={16}/> Use my current location</button><span className="location-status">{locationMessage}</span></div><label>Pickup location<input value={form.pickup} onChange={e => {update('pickup',e.target.value);setPickupPoint(null)}} required placeholder="e.g. 12 Omowunmi Street, Amoshe, Meiran, Lagos"/><small>Use GPS or search a full street address, estate, business or landmark.</small><button type="button" className="outline small" onClick={searchPickup} disabled={busy}>Search pickup addresses</button>{pickupResults.map((p,i)=><button type="button" className="place-result" key={`${p.lat}-${p.lng}-${i}`} onClick={()=>selectMapPlace(p,'pickup')}><b>{p.title}</b><small>{p.address}</small></button>)}</label><label>Destination<input value={destinationQuery || form.destination} onChange={e=>{setDestinationQuery(e.target.value);update('destination',e.target.value);setDestinationPoint(null)}} required placeholder="Search street, landmark or destination"/><button type="button" className="outline small" onClick={searchDestination} disabled={busy}>Search addresses, businesses & places</button>{destinationResults.map((p,i)=><button type="button" className="place-result" key={`${p.lat}-${p.lng}-${i}`} onClick={()=>selectMapPlace(p,'destination')}><b>{p.title}</b><small>{p.address}</small></button>)}</label><RideMap pickup={pickupPoint} destination={destinationPoint} drivers={nearbyDrivers} center={pickupPoint||destinationPoint} onPickDestination={chooseDestinationOnMap} height={260}/><div className="driver-search-status">{searchingDrivers ? <><span className="search-spinner"/> Searching for available drivers near your pickup…</> : `${nearbyDrivers.length} approved online driver(s) found within 15 km for ${form.category}.`}</div>{nearbyDrivers.map(d=><button type="button" className={`driver-card-mini ${selectedDriverId===d._id?'selected-driver':''}`} key={d._id} onClick={()=>setSelectedDriverId(d._id)}><span className="driver-dot"/><div className="driver-meta"><b>{d.name} · {d.distanceKm} km away</b><small>{d.vehicle?.make} {d.vehicle?.model} · {d.vehicle?.color||''} · Plate {d.vehicle?.plateNumber||'pending'}</small></div><strong>{selectedDriverId===d._id?'Selected':'Select'}</strong></button>)}{selectedDriverId&&<button type="button" className="text-button" onClick={()=>setSelectedDriverId('')}>Clear selected driver and notify nearby drivers</button>}<div className="ride-options">{cards.map(c => <button type="button" key={c.value} onClick={() => update('category', c.value)} className={`ride-option ${form.category === c.value ? 'chosen' : ''}`}><CarFront/><b>{c.title}</b><small>{c.price}</small></button>)}</div><label>Payment method<select value={form.paymentMethod} onChange={e => update('paymentMethod', e.target.value)}><option value="cash">Cash</option><option value="flutterwave">Online payment (Flutterwave)</option></select></label><button className="primary" disabled={busy}>{busy ? <><span className="search-spinner"/> Finding your ride…</> : <>Request ride <Navigation size={17}/></>}</button><p className="fineprint">Fare is estimated from available road distance and expected travel time; traffic and route changes may affect the final amount.</p></form></div><div className="side-stack"><div className="panel mini-panel"><div className="icon-box"><Wallet/></div><h3>Wallet & ride coins</h3><p>Wallet balance: {money(user.walletBalance)} · <span className="wallet-coin">✦ {user.rideCoins||0} coins</span></p><p>Earn loyalty coins on completed rides. Top up through Flutterwave to use your wallet.</p><label>Top-up amount (NGN)<input type="number" min="500" max="1000000" step="500" value={topupAmount} onChange={e=>setTopupAmount(e.target.value)}/></label><button className="primary" onClick={topUpWallet}>Add money with Flutterwave</button><button className="text-button" onClick={() => { setView('rides'); loadRides(); }}>View rides & transactions →</button></div><div className="panel mini-panel dark-mini"><div className="icon-box"><ShieldCheck/></div><h3>Your safety matters</h3><p>Review safety information before your trip.</p><button className="text-button" onClick={() => setView('safety')}>Safety centre →</button></div></div></div>

        : <div className="dashboard-grid"><div className="panel booking-panel"><div className="section-title"><div><span className="eyebrow">DRIVER MODE</span><h2>Ride requests</h2></div><span className="status-pill">{user.driverStatus || 'pending'}</span></div>{user.driverStatus !== 'approved' && <div className="warning">{user.driverStatus === 'rejected' ? 'Your application was rejected.' : 'Your account is awaiting admin approval.'} {user.driverReviewNote ? `Admin note: ${user.driverReviewNote}. ` : ''}You cannot accept trips until approved. Save your vehicle details and upload all five documents so an admin can review them.</div>}<div className="map-tools"><button className={user.driverOnline?"primary":"outline"} onClick={()=>setDriverAvailability(!user.driverOnline)}>{user.driverOnline?"Go offline":"Go online to receive trips"}</button><button className="outline" onClick={()=>{refreshMe();loadAvailableRides();loadRides();loadDriverProfile();}}>Refresh requests</button></div><p className="location-status">{user.driverOnline?'You are marked online. GPS is refreshed while this app is open; keep location permission enabled.': 'You are offline; passengers will not see your live driver location.'}</p>{user.driverStatus==='approved'&&user.driverOnline&&<div className="driver-online-hint"><b>Ready to receive requests</b><span>Check that your vehicle details are saved with the same category the passenger selects. Refresh requests if a ride does not appear.</span></div>}<h3>Available requests</h3>{availableRides.length === 0 ? <p className="muted empty">No open ride requests right now.</p> : availableRides.map(r => <div className="ride-row" key={r._id}><div><b>{r.pickup.address} → {r.destination.address}</b><small>{r.category} · {money(r.estimatedFare)}</small></div><button className="primary small" onClick={() => rideAction(r._id, 'accept')}>Accept</button></div>)}<h3>My assigned trips</h3>{rides.filter(r=>!['completed','cancelled'].includes(r.status)).length===0?<p className="muted">No active trips assigned.</p>:rides.filter(r=>!['completed','cancelled'].includes(r.status)).map(r=><div className="ride-row" key={r._id}><div><b>{r.pickup.address} → {r.destination.address}</b><small>{r.status} · {money(r.estimatedFare)}</small>{r.passenger&&<small>Passenger: {r.passenger.name||'Passenger'}</small>}{['accepted','arriving','in_progress'].includes(r.status)&&<div className="ride-live-map"><RideMap pickup={r.pickup} destination={r.destination} liveDriverLocation={livePassengerLocation?.rideId===r._id?livePassengerLocation:null} center={livePassengerLocation?.rideId===r._id?livePassengerLocation:r.pickup} height={200}/><small>Passenger GPS is shared only during this active ride when permission is granted.</small></div>}</div>{r.status==='accepted'&&<button className="outline small" onClick={()=>rideAction(r._id,'status',{status:'arriving'})}>Arriving</button>}{r.status==='arriving'&&<button className="outline small" onClick={()=>rideAction(r._id,'status',{status:'in_progress'})}>Start trip</button>}{r.status==='in_progress'&&<button className="primary small" onClick={()=>rideAction(r._id,'status',{status:'completed'})}>Complete</button>}</div>)}</div><div className="panel mini-panel"><CarFront/><h3>Vehicle details</h3><p>Complete these details so CivicRide and the admin can identify the vehicle assigned to you.</p><form className="form-stack" onSubmit={saveVehicle}><label>Car make<input value={vehicleForm.make} onChange={e=>setVehicleForm(v=>({...v,make:e.target.value}))} placeholder="e.g. Toyota" required/></label><label>Car model<input value={vehicleForm.model} onChange={e=>setVehicleForm(v=>({...v,model:e.target.value}))} placeholder="e.g. Corolla" required/></label><div className="form-grid"><label>Year<input type="number" min="1980" max={new Date().getFullYear()+1} value={vehicleForm.year} onChange={e=>setVehicleForm(v=>({...v,year:e.target.value}))} placeholder="2020"/></label><label>Colour<input value={vehicleForm.color} onChange={e=>setVehicleForm(v=>({...v,color:e.target.value}))} placeholder="White" required/></label></div><label>Plate number<input value={vehicleForm.plateNumber} onChange={e=>setVehicleForm(v=>({...v,plateNumber:e.target.value.toUpperCase()}))} placeholder="ABC-123-XY" required/></label><label>Vehicle type<select value={vehicleForm.vehicleType} onChange={e=>setVehicleForm(v=>({...v,vehicleType:e.target.value}))}><option value="sedan">Sedan</option><option value="suv">SUV</option><option value="hatchback">Hatchback</option><option value="minivan">Minivan</option><option value="pickup">Pickup</option><option value="other">Other</option></select></label><div className="form-grid"><label>Passenger seats<input type="number" min="1" max="20" value={vehicleForm.seats} onChange={e=>setVehicleForm(v=>({...v,seats:e.target.value}))}/></label><label>Ride category<select value={vehicleForm.category} onChange={e=>setVehicleForm(v=>({...v,category:e.target.value}))}><option value="economy">Economy</option><option value="comfort">Comfort</option><option value="xl">XL</option></select></label></div><button className="primary" type="submit">Save vehicle details</button></form><DriverDocuments documents={driverDocuments} kind={driverDocKind} setKind={setDriverDocKind} file={driverFile} setFile={setDriverFile} fileKey={fileKey} uploading={uploading} onSubmit={uploadDriverDocument} /></div></div>}

      </section>}

      {view === 'activities' && user && <section className="panel rides-panel"><div className="section-title"><div><span className="eyebrow">TRIP HISTORY</span><h2>Activities</h2></div><button className="outline" onClick={loadRides}>Refresh</button></div>{rides.length===0?<p className="muted">Your ride activity will appear here.</p>:rides.slice().sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0)).map(r=><div className="admin-row" key={r._id}><div><b>{r.pickup?.address} → {r.destination?.address}</b><small>{new Date(r.createdAt||Date.now()).toLocaleString()} · {r.category} · {money(r.finalFare??r.estimatedFare)}</small><small>Ride status: {String(r.status||'unknown').replaceAll('_',' ')} · Payment: {r.paymentStatus||'pending'}</small></div><span className="status-pill">{r.status}</span></div>)}</section>}

      {view === 'rides' && user && <section className="panel rides-panel"><div className="section-title"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>{user.role === 'driver' ? 'Available rides' : 'Your rides'}</h2></div><button className="outline" onClick={loadRides}>Refresh</button></div>{rides.length === 0 ? <p className="muted">No rides to show yet.</p> : rides.map(r => <div className="ride-row" key={r._id}><div className="ride-row-icon"><CarFront/></div><div className="ride-info"><b>{r.pickup.address} → {r.destination.address}</b><small>{r.status.replace('_', ' ')} · {r.category} · {money(r.finalFare ?? r.estimatedFare)}</small><small>Payment: {r.paymentStatus} ({r.paymentMethod}) · Coins earned: {r.coinsAwarded||0}</small>{user.role==='passenger'&&r.driver&&<div className="ride-vehicle-badge"><b>{r.driver.name}</b><div>{r.driver.vehicle?.make} {r.driver.vehicle?.model} · {r.driver.vehicle?.color||''}</div><strong>Plate: {r.driver.vehicle?.plateNumber||'Not supplied'}</strong></div>}{['requested','accepted','arriving','in_progress'].includes(r.status)&&<div className="trip-progress-card"><div className="trip-progress-head"><b>{r.status==='requested'?'Searching for a driver':r.status==='accepted'?'Driver accepted your ride':r.status==='arriving'?'Your driver is approaching pickup':'Trip in progress'}</b><span>{r.status==='requested'?'LIVE':r.status==='in_progress'?'ON TRIP':'LIVE'}</span></div><div className="trip-progress-track"><span style={{width:r.status==='requested'?'12%':r.status==='accepted'?'35%':r.status==='arriving'?'65%':'100%'}}/></div><small>{r.driver?.vehicle?.make||''} {r.driver?.vehicle?.model||''} · {r.driver?.vehicle?.color||''} · Plate {r.driver?.vehicle?.plateNumber||'Waiting for driver acceptance'}</small>{r.status==='arriving'&&liveDriverLocation?.rideId===r._id&&(()=>{const km=distanceBetween(liveDriverLocation,r.pickup);return <small>{km===null?'Updating driver distance…':km<0.1?'Your driver is very close to pickup':`Driver is approximately ${km.toFixed(1)} km from pickup`}</small>})()}{r.status==='in_progress'&&liveDriverLocation?.rideId===r._id&&(()=>{const km=distanceBetween(liveDriverLocation,r.destination);return <small>{km===null?'Updating destination distance…':km<0.1?'You are near your destination':`Approximately ${km.toFixed(1)} km to destination (straight-line estimate)`}</small>})()}</div>}{['accepted','arriving','in_progress'].includes(r.status)&&r.driver&&<div className="ride-live-map"><RideMap pickup={r.pickup} destination={r.destination} liveDriverLocation={liveDriverLocation?.rideId===r._id?liveDriverLocation:null} center={liveDriverLocation?.rideId===r._id?liveDriverLocation:r.pickup} height={220}/><small>Live driver location updates while driver app is online and trip is active.</small></div>}</div><div className="ride-actions">{user.role === 'passenger' && r.paymentMethod === 'flutterwave' && r.paymentStatus !== 'paid' && <button className="outline small" onClick={() => pay(r._id)}>Pay online</button>}{user.role === 'driver' && r.status === 'accepted' && <button className="outline small" onClick={() => rideAction(r._id, 'status', { status: 'arriving' })}>Arriving</button>}{user.role === 'driver' && r.status === 'arriving' && <button className="outline small" onClick={() => rideAction(r._id, 'status', { status: 'in_progress' })}>Start trip</button>}{user.role === 'driver' && r.status === 'in_progress' && <button className="primary small" onClick={() => rideAction(r._id, 'status', { status: 'completed' })}>Complete</button>}{user.role === 'passenger' && ['requested','accepted','arriving'].includes(r.status) && <button className="outline small" onClick={() => rideAction(r._id, 'status', { status: 'cancelled' })}>Cancel</button>}{['accepted','arriving','in_progress'].includes(r.status) && <button className="outline small" onClick={()=>shareTrip(r._id)}>Share trip</button>}{['accepted','arriving','in_progress'].includes(r.status) && <button className="sos-button small" onClick={()=>sendSOS(r._id)}>SOS</button>}{user.role === 'passenger' && r.status === 'completed' && !r.rating && <button className="outline small" onClick={() => { const rating = Number(prompt('Rate your ride from 1 to 5')); if (rating) rideAction(r._id, 'rating', { rating }); }}><Star size={14}/> Rate</button>}</div></div>)}</section>}

      <section className="feature-strip"><div><ShieldCheck/><b>Safety first</b><span>Designed around safer journeys</span></div><div><Wallet/><b>Clear payments</b><span>Know your fare before you ride</span></div><div><Star/><b>Better every trip</b><span>Ratings help build trust</span></div></section>

    </main>

    {user && <nav className="mobile-tabbar" aria-label="Main navigation">

      <button className={view==='home'?'active':''} onClick={()=>setView('home')}><HomeIcon size={20}/><span>Home</span></button>
      <button className={view==='activities'?'active':''} onClick={()=>{setView('activities');loadRides();}}><History size={20}/><span>Activities</span></button>

      {user.role==='admin' ? <button className={view==='admin'?'active':''} onClick={()=>{setView('admin');loadAdmin();}}><LayoutDashboard size={20}/><span>Admin</span></button> : <button className={view==='rides'?'active':''} onClick={()=>{setView('rides');loadRides();if(user.role==='driver')loadAvailableRides();}}><ClipboardList size={20}/><span>My rides</span></button>}

      <button className={view==='safety'?'active':''} onClick={()=>setView('safety')}><ShieldCheck size={20}/><span>SOS</span></button><button className={view==='settings'?'active':''} onClick={()=>setView('settings')}><UserRound size={20}/><span>Settings</span></button>

      <button onClick={()=>{const el=document.querySelector('.contact-fab');if(el)el.click();else setNotice('Sign in to use Call & chat.')}}><MessageCircle size={20}/><span>Call & chat</span></button>

    </nav>}

    {user && <ContactCenter user={user} token={token} />}

    <footer><a className="brand footer-brand" onClick={() => setView('home')}><span className="brand-icon"><Navigation size={18}/></span><span>Civic<span className="green">Ride</span></span></a><span>Ride smarter. Live better.</span><span>Development starter · Configure before production</span></footer>

  </div>;

}
