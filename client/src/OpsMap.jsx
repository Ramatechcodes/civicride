import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

function FitMarkers({ drivers }) {
  const map = useMap();
  useEffect(() => {
    const points = drivers.filter(d => Number.isFinite(d.currentLocation?.lat) && Number.isFinite(d.currentLocation?.lng)).map(d => [d.currentLocation.lat, d.currentLocation.lng]);
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: 14 });
  }, [drivers, map]);
  return null;
}

export default function OpsMap({ drivers = [] }) {
  const located = drivers.filter(d => d.driverOnline && Number.isFinite(d.currentLocation?.lat) && Number.isFinite(d.currentLocation?.lng) && d.currentLocation?.updatedAt && Date.now() - new Date(d.currentLocation.updatedAt).getTime() < 120000);
  return <div className="ops-map-wrap">
    <div className="ops-map-heading"><b>Driver operations map</b><span>{located.length} driver location{located.length === 1 ? '' : 's'} available</span></div>
    <MapContainer center={[6.5244, 3.3792]} zoom={11} scrollWheelZoom className="ops-leaflet-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {located.map(d => <Marker key={d._id} position={[d.currentLocation.lat, d.currentLocation.lng]}><Popup><b>{d.name}</b><br />Status: {d.driverStatus}<br />Last update: {d.currentLocation.updatedAt ? new Date(d.currentLocation.updatedAt).toLocaleString() : 'Unknown'}</Popup></Marker>)}
      <FitMarkers drivers={located} />
    </MapContainer>
    <small className="muted">Only approved drivers who are online and have reported GPS within the last two minutes are shown. Map tiles are provided by OpenStreetMap and subject to its usage policy.</small>
  </div>;
}
