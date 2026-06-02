import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const MIN_RECENTER_DISTANCE_METERS = 12;

function distanceMeters(from, to) {
  if (!from || !to) return Infinity;
  return L.latLng(from[0], from[1]).distanceTo(L.latLng(to[0], to[1]));
}

export function RecenterMap({ location }) {
  const map = useMap();

  useEffect(() => {
    if (!location) return;
    const center = map.getCenter();
    const currentLocation = [center.lat, center.lng];
    if (distanceMeters(currentLocation, location) < MIN_RECENTER_DISTANCE_METERS) return;

    map.flyTo(location, Math.max(map.getZoom(), 13), {
      duration: 0.8,
      easeLinearity: 0.2,
    });
  }, [location, map]);

  return null;
}

export function CustomZoom() {
  const map = useMap();

  useEffect(() => {
    const zoom = L.control.zoom({ position: "bottomleft" });
    zoom.addTo(map);
    return () => zoom.remove();
  }, [map]);

  return null;
}
