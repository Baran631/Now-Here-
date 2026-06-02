import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from "react-leaflet";
import { CustomZoom, RecenterMap } from "./MapUtils";

const markerIconCache = new Map();
const clusterIconCache = new Map();
const CLUSTER_BREAK_ZOOM = 16;
const INITIAL_MAP_ZOOM = 13;
const ROUTE_PATH_OPTIONS = { color: "#18d2b8", weight: 6, opacity: 0.88 };
const TILE_LAYER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const TILE_LAYERS = {
  day: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  },
  night: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  },
};

function createMarkerIcon(category = "genel", selected = false, postType = "permanent") {
  const cacheKey = `${category}-${selected ? "selected" : "idle"}-${postType}`;
  const cachedIcon = markerIconCache.get(cacheKey);
  if (cachedIcon) return cachedIcon;

  const isStory = postType === "story";
  const icon = L.divIcon({
    className: `memory-marker ${selected ? "is-selected" : ""} ${isStory ? "is-story" : ""}`,
    html: `<span class="memory-marker-dot category-${category}"></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
  markerIconCache.set(cacheKey, icon);
  return icon;
}

function createClusterIcon(count) {
  const cacheKey = count > 99 ? "99+" : String(count);
  const cachedIcon = clusterIconCache.get(cacheKey);
  if (cachedIcon) return cachedIcon;

  const icon = L.divIcon({
    className: "cluster-marker",
    html: `<span>${cacheKey}</span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20],
  });
  clusterIconCache.set(cacheKey, icon);
  return icon;
}

const userIcon = L.divIcon({
  className: "user-marker",
  html: "<span></span>",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function getClusterCellSize(zoom) {
  if (zoom >= CLUSTER_BREAK_ZOOM) return 0;
  return 360 / (2 ** Math.max(1, zoom) * 8);
}

function groupPosts(posts, zoom) {
  const groups = new Map();
  const cellSize = getClusterCellSize(zoom);

  posts
    .filter((post) => Number.isFinite(Number(post.lat)) && Number.isFinite(Number(post.lng)))
    .forEach((post) => {
      const lat = Number(post.lat);
      const lng = Number(post.lng);
      const key = cellSize
        ? `${Math.floor(lat / cellSize)},${Math.floor(lng / cellSize)}`
        : `${post._id}-${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(post);
    });

  return Array.from(groups.values()).map((items) => {
    const center = items.reduce(
      (acc, post) => [acc[0] + Number(post.lat) / items.length, acc[1] + Number(post.lng) / items.length],
      [0, 0]
    );
    return { center, items };
  });
}

const clickedLocationIcon = L.divIcon({
  className: "clicked-location-marker",
  html: "<span></span>",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function MapClickHandler({ onMapClick }) {
  const timerRef = useRef(null);
  const movedRef = useRef(false);
  const suppressContextMenuRef = useRef(false);

  const clearMouseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const selectLocation = useCallback((latlng) => {
    if (onMapClick) {
      onMapClick([latlng.lat, latlng.lng]);
    }
  }, [onMapClick]);

  const map = useMapEvents({
    mousedown(e) {
      movedRef.current = false;
      clearMouseTimer();
      timerRef.current = setTimeout(() => {
        if (!movedRef.current) {
          selectLocation(e.latlng);
        }
      }, 2000);
    },
    mousemove() {
      movedRef.current = true;
      clearMouseTimer();
    },
    mouseup() {
      clearMouseTimer();
    },
    contextmenu(e) {
      if (suppressContextMenuRef.current) {
        suppressContextMenuRef.current = false;
        return;
      }
      selectLocation(e.latlng);
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    let touchTimer = null;
    let touchMoved = false;

    function onTouchStart(e) {
      touchMoved = false;
      const touch = e.touches[0];
      if (!touch) return;
      touchTimer = setTimeout(() => {
        if (!touchMoved) {
          const point = map.containerPointToLatLng(
            L.point(touch.clientX - container.getBoundingClientRect().left,
                    touch.clientY - container.getBoundingClientRect().top)
          );
          suppressContextMenuRef.current = true;
          selectLocation(point);
        }
      }, 2000);
    }

    function onTouchMove() {
      touchMoved = true;
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    }

    function onTouchEnd() {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      if (touchTimer) clearTimeout(touchTimer);
      clearMouseTimer();
    };
  }, [clearMouseTimer, map, selectLocation]);

  return null;
}

function MapView({
  location,
  focusLocation,
  posts = [],
  route,
  selectedPostId,
  onBoundsChange,
  onSelectPost,
  clickedCoords,
  clickedAddress,
  onMapClick,
  onClearClickedCoords,
  onShareHere,
  mapTheme = "night",
}) {
  const [currentZoom, setCurrentZoom] = useState(INITIAL_MAP_ZOOM);
  const tileLayer = TILE_LAYERS[mapTheme] || TILE_LAYERS.night;
  const groupedPosts = useMemo(() => groupPosts(posts, currentZoom), [currentZoom, posts]);
  const markerList = useMemo(
    () =>
      groupedPosts.map((group) =>
        group.items.length > 1 ? (
          <ClusterPostMarker
            key={`${group.center[0]}-${group.center[1]}-${group.items.length}`}
            center={group.center}
            items={group.items}
            onSelectPost={onSelectPost}
          />
        ) : (
          <SinglePostMarker
            key={group.items[0]._id}
            post={group.items[0]}
            selected={selectedPostId === group.items[0]._id}
            onSelectPost={onSelectPost}
          />
        )
      ),
    [groupedPosts, onSelectPost, selectedPostId]
  );

  return (
    <MapContainer
      center={location}
      zoom={INITIAL_MAP_ZOOM}
      zoomControl={false}
      className="map-canvas"
      preferCanvas
    >
      <CustomZoom />
      <BoundsReporter onBoundsChange={onBoundsChange} onZoomChange={setCurrentZoom} />
      <MapClickHandler onMapClick={onMapClick} />
      <RecenterMap location={focusLocation || location} />
      <TileLayer
        key={mapTheme}
        attribution={TILE_LAYER_ATTRIBUTION}
        url={tileLayer.url}
        subdomains="abcd"
      />
      <Marker position={location} icon={userIcon}>
        <Popup>Bulunduğun nokta</Popup>
      </Marker>

      {clickedCoords && (
        <Marker position={clickedCoords} icon={clickedLocationIcon}>
          <Popup
            onClose={onClearClickedCoords}
            minWidth={200}
            className="clicked-coords-popup"
          >
            <div className="popup-content clicked-popup-content">
              <strong>Seçilen Konum</strong>
              <p>{clickedAddress || "Yükleniyor..."}</p>
              <button
                type="button"
                className="share-here-btn"
                onClick={onShareHere}
              >
                Burada Paylaşım Yap
              </button>
            </div>
          </Popup>
        </Marker>
      )}

      {route?.positions && (
        <Polyline
          positions={route.positions}
          pathOptions={ROUTE_PATH_OPTIONS}
        />
      )}

      {markerList}
    </MapContainer>
  );
}

export default memo(MapView, areMapViewPropsEqual);

function sameLatLng(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return Number(a[0]) === Number(b[0]) && Number(a[1]) === Number(b[1]);
}

function areMapViewPropsEqual(prev, next) {
  return (
    sameLatLng(prev.location, next.location) &&
    sameLatLng(prev.focusLocation, next.focusLocation) &&
    prev.posts === next.posts &&
    prev.route === next.route &&
    prev.selectedPostId === next.selectedPostId &&
    sameLatLng(prev.clickedCoords, next.clickedCoords) &&
    prev.clickedAddress === next.clickedAddress &&
    prev.mapTheme === next.mapTheme &&
    prev.onBoundsChange === next.onBoundsChange &&
    prev.onSelectPost === next.onSelectPost &&
    prev.onMapClick === next.onMapClick &&
    prev.onClearClickedCoords === next.onClearClickedCoords &&
    prev.onShareHere === next.onShareHere
  );
}

function BoundsReporter({ onBoundsChange, onZoomChange }) {
  const reportBounds = useCallback((map) => {
    if (!onBoundsChange) return;
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    onZoomChange?.(zoom);
    onBoundsChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
      zoom,
    });
  }, [onBoundsChange, onZoomChange]);

  const map = useMapEvents({
    moveend: () => reportBounds(map),
    zoomend: () => reportBounds(map),
    resize: () => reportBounds(map),
  });

  useEffect(() => {
    reportBounds(map);
  }, [map, reportBounds]);

  return null;
}

const ClusterPostMarker = memo(function ClusterPostMarker({ center, items, onSelectPost }) {
  const icon = useMemo(() => createClusterIcon(items.length), [items.length]);

  return (
    <Marker position={center} icon={icon}>
      <Popup className="memory-popup" minWidth={240}>
        <div className="popup-content cluster-popup">
          <strong>{items.length} paylaşım burada</strong>
          {items.slice(0, 8).map((post) => (
            <ClusterPopupItem key={post._id} post={post} onSelectPost={onSelectPost} />
          ))}
        </div>
      </Popup>
    </Marker>
  );
});

const ClusterPopupItem = memo(function ClusterPopupItem({ post, onSelectPost }) {
  const handleClick = useCallback(() => {
    onSelectPost(post);
  }, [onSelectPost, post]);

  return (
    <button type="button" onClick={handleClick} className="cluster-popup-item">
      <span className={`category-dot category-${post.category || "genel"}`} />
      <span>
        <b>{post.placeName || "Konum"}</b>
        <small>{post.description || "Paylaşım"}</small>
      </span>
    </button>
  );
});

const SinglePostMarker = memo(function SinglePostMarker({ post, selected, onSelectPost }) {
  const position = useMemo(() => [Number(post.lat), Number(post.lng)], [post.lat, post.lng]);
  const icon = useMemo(
    () => createMarkerIcon(post.category, selected, post.postType),
    [post.category, post.postType, selected]
  );
  const handleClick = useCallback(() => {
    onSelectPost(post);
  }, [onSelectPost, post]);
  const eventHandlers = useMemo(() => ({ click: handleClick }), [handleClick]);

  return (
    <Marker
      position={position}
      icon={icon}
      eventHandlers={eventHandlers}
      keyboard={false}
      riseOnHover
    />
  );
}, areSingleMarkerPropsEqual);

function areSingleMarkerPropsEqual(prev, next) {
  return (
    prev.selected === next.selected &&
    prev.onSelectPost === next.onSelectPost &&
    prev.post._id === next.post._id &&
    prev.post.lat === next.post.lat &&
    prev.post.lng === next.post.lng &&
    prev.post.category === next.post.category &&
    prev.post.postType === next.post.postType
  );
}
