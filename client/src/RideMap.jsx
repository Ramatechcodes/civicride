import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';

const pin = color => L.divIcon({ className: 'cr-map-pin-wrap', html: `<span class="cr-map-pin ${color}"></span>`, iconSize: [22,22], iconAnchor: [11,11] });
const pickupIcon = pin('pickup'), destinationIcon = pin('destination'), driverIcon = pin('driver');
function Recenter({ center }) { const map=useMap(); useEffect(()=>{ if(center && Number.isFinite(center.lat)&&Number.isFinite(center.lng)) map.setView([center.lat,center.lng],14,{animate:true}); },[center?.lat,center?.lng]); return null; }
function ClickPicker({ enabled, onPick }) { useMapEvents({ click(e){ if(enabled) onPick({lat:e.latlng.lat,lng:e.latlng.lng}); } }); return null; }
export default function RideMap({ pickup, destination, drivers=[], liveDriverLocation, center, onPickDestination, height=300 }) {
  const [routeLine,setRouteLine]=useState([]);
  useEffect(()=>{let cancelled=false;setRouteLine([]);if(!pickup||!destination||!Number.isFinite(pickup.lat)||!Number.isFinite(destination.lat))return;fetch(`https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`,{signal:AbortSignal.timeout(7000)}).then(r=>r.json()).then(d=>{const coords=d?.routes?.[0]?.geometry?.coordinates;if(!cancelled&&Array.isArray(coords))setRouteLine(coords.map(([lng,lat])=>[lat,lng]));}).catch(()=>{});return()=>{cancelled=true}},[pickup?.lat,pickup?.lng,destination?.lat,destination?.lng]);
  const fallback=[4.0511,9.7679]; const c=center && Number.isFinite(center.lat)&&Number.isFinite(center.lng)?[center.lat,center.lng]:fallback;
  return <div className="ride-map-frame" style={{height}}><MapContainer center={c} zoom={13} scrollWheelZoom className="ride-map">
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <Recenter center={center}/><ClickPicker enabled={Boolean(onPickDestination)} onPick={onPickDestination}/>
    {pickup && Number.isFinite(pickup.lat)&&Number.isFinite(pickup.lng)&&<Marker position={[pickup.lat,pickup.lng]} icon={pickupIcon}><Popup>Pickup: {pickup.address||'Your location'}</Popup></Marker>}
    {destination && Number.isFinite(destination.lat)&&Number.isFinite(destination.lng)&&<Marker position={[destination.lat,destination.lng]} icon={destinationIcon}><Popup>Destination: {destination.address||'Destination'}</Popup></Marker>}
    {pickup && destination && Number.isFinite(pickup.lat)&&Number.isFinite(destination.lat)&&<Polyline positions={routeLine.length?routeLine:[[pickup.lat,pickup.lng],[destination.lat,destination.lng]]} pathOptions={{color:'#00c98b',weight:4,dashArray:routeLine.length?undefined:'8 8'}}/>}
    {liveDriverLocation&&Number.isFinite(liveDriverLocation.lat)&&Number.isFinite(liveDriverLocation.lng)&&<Marker position={[liveDriverLocation.lat,liveDriverLocation.lng]} icon={driverIcon}><Popup>Live driver location</Popup></Marker>}{drivers.map(d=>d.location&&Number.isFinite(d.location.lat)&&Number.isFinite(d.location.lng)&&<Marker key={d._id} position={[d.location.lat,d.location.lng]} icon={driverIcon}><Popup>{d.name} · {d.distanceKm} km away<br/>{d.vehicle?.make} {d.vehicle?.model}<br/>Plate: {d.vehicle?.plateNumber||'Pending'}</Popup></Marker>)}
  </MapContainer></div>;
}
