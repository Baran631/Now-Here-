import { useCallback, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from "react-leaflet";
import { CustomZoom, RecenterMap } from "./MapUtils";

const categoryLabels = {
  genel: "Genel",
  diger: "Genel",
  kafe: "Kafe",
  doga: "Doga",
  etkinlik: "Etkinlik",
  spor: "Spor",
  sanat: "Sanat",
  yemek: "Yemek",
  alisveris: "Alisveris",
};

const moodLabels = {
  calm: "Sakin",
  social: "Sosyal",
  focus: "Odak",
  energy: "Enerjik",
  view: "Manzara",
};

function createMarkerIcon(category = "genel", selected = false, postType = "permanent") {
  const isStory = postType === "story";
  return L.divIcon({
    className: `memory-marker ${selected ? "is-selected" : ""} ${isStory ? "is-story" : ""}`,
    html: `<span class="memory-marker-dot category-${category}"></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function createClusterIcon(count) {
  return L.divIcon({
    className: "cluster-marker",
    html: `<span>${count}</span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20],
  });
}

const userIcon = L.divIcon({
  className: "user-marker",
  html: "<span></span>",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function groupPosts(posts) {
  const groups = new Map();

  posts
    .filter((post) => Number.isFinite(Number(post.lat)) && Number.isFinite(Number(post.lng)))
    .forEach((post) => {
      const key = `${Number(post.lat).toFixed(4)},${Number(post.lng).toFixed(4)}`;
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

export default function MapView({
  location,
  focusLocation,
  posts = [],
  route,
  selectedPostId,
  onBoundsChange,
  onSelectPost,
  onRoute,
  onLike,
  clickedCoords,
  clickedAddress,
  onMapClick,
  onClearClickedCoords,
  onShareHere,
}) {
  const groupedPosts = useMemo(() => groupPosts(posts), [posts]);

  return (
    <MapContainer
      center={location}
      zoom={13}
      zoomControl={false}
      className="map-canvas"
      preferCanvas
    >
      <CustomZoom />
      <BoundsReporter onBoundsChange={onBoundsChange} />
      <MapClickHandler onMapClick={onMapClick} />
      <RecenterMap location={focusLocation || location} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
          pathOptions={{ color: "#18d2b8", weight: 6, opacity: 0.88 }}
        />
      )}

      {groupedPosts.map((group) =>
        group.items.length > 1 ? (
          <Marker
            key={`${group.center[0]}-${group.center[1]}-${group.items.length}`}
            position={group.center}
            icon={createClusterIcon(group.items.length)}
          >
            <Popup className="memory-popup" minWidth={280}>
              <div className="popup-content cluster-popup">
                <strong>{group.items.length} paylaşım burada</strong>
                {group.items.map((post) => (
                  <button
                    type="button"
                    key={post._id}
                    onClick={() => onSelectPost(post)}
                    className="cluster-popup-item"
                  >
                    <span className={`category-dot category-${post.category || "genel"}`} />
                    <span>
                      <b>{post.placeName || "Konum"}</b>
                      <small>{post.description || "Fotoğraflı paylaşım"}</small>
                    </span>
                  </button>
                ))}
              </div>
            </Popup>
          </Marker>
        ) : (
          <SinglePostMarker
            key={group.items[0]._id}
            post={group.items[0]}
            selected={selectedPostId === group.items[0]._id}
            onSelectPost={onSelectPost}
            onRoute={onRoute}
            onLike={onLike}
          />
        )
      )}
    </MapContainer>
  );
}

function BoundsReporter({ onBoundsChange }) {
  const reportBounds = useCallback((map) => {
    if (!onBoundsChange) return;
    const bounds = map.getBounds();
    onBoundsChange({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
      zoom: map.getZoom(),
    });
  }, [onBoundsChange]);

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

function SinglePostMarker({ post, selected, onSelectPost, onRoute, onLike }) {
  return (
    <Marker
      position={[Number(post.lat), Number(post.lng)]}
      icon={createMarkerIcon(post.category, selected, post.postType)}
      eventHandlers={{
        click: () => onSelectPost(post),
      }}
    >
      <Popup className="memory-popup" minWidth={250}>
        <div className="popup-content">
          <span className="popup-category">{categoryLabels[post.category] || "Genel"}</span>
          <strong>{post.placeName || "Konum"}</strong>
          <small>{post.authorName ? `${post.authorName} tarafından` : "Paylaşım"}</small>
          <div className="popup-meta-line">
            <span>{moodLabels[post.mood] || "Sakin"}</span>
            <span>{post.rating || 0}/5</span>
          </div>
          {post.description && <p>{post.description}</p>}
          {!!post.tags?.length && <small className="popup-tags">{post.tags.map((tag) => `#${tag}`).join(" ")}</small>}
          {post.image && <img src={post.image} alt="Paylaşım" />}
          <div className="popup-actions">
            <button type="button" onClick={() => onRoute(post)}>
              Yol tarifi
            </button>
            <button type="button" onClick={() => onLike(post._id)}>
              {post.viewerLiked ? "Beğenildi" : "Beğen"} {post.likes || 0}
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
