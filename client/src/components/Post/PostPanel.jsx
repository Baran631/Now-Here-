import { useEffect, useMemo, useRef, useState } from "react";
import Camera from "./Camera";
import { searchPlaces } from "../../lib/api";
import { preparePostImageSet } from "../../lib/imageTools";
import "./PostPanel.css";

const categories = [
  { value: "genel", label: "Genel" },
  { value: "kafe", label: "Kafe" },
  { value: "doga", label: "Doga" },
  { value: "etkinlik", label: "Etkinlik" },
  { value: "spor", label: "Spor" },
  { value: "sanat", label: "Sanat" },
  { value: "yemek", label: "Yemek" },
  { value: "alisveris", label: "Alisveris" },
];

const moods = [
  { value: "calm", label: "Sakin" },
  { value: "social", label: "Sosyal" },
  { value: "focus", label: "Odak" },
  { value: "energy", label: "Enerjik" },
  { value: "view", label: "Manzara" },
];

function parseTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 6);
}

export default function PostPanel({ location, onSubmit, onClose }) {
  const videoObjectUrlRef = useRef("");
  const [form, setForm] = useState({
    description: "",
    placeName: "Bulundugum nokta",
    category: "genel",
    mood: "calm",
    rating: 4,
    tagsText: "",
  });

  const [image, setImage] = useState("");
  const [imageThumbnail, setImageThumbnail] = useState("");
  const [video, setVideo] = useState("");
  const [postType, setPostType] = useState("permanent"); // 'permanent' veya 'story'

  const [currentCoords, setCurrentCoords] = useState(location || [41.0082, 28.9784]);
  const [locationSearch, setLocationSearch] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tagPreview = useMemo(() => parseTags(form.tagsText), [form.tagsText]);

  useEffect(() => () => {
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current);
      videoObjectUrlRef.current = "";
    }
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "rating" ? Number(value) : value,
    }));
  }

  // Handle Location Search
  async function handleLocationSearch(val) {
    setLocationSearch(val);
    if (val.trim().length < 2) {
      setLocationSuggestions([]);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await searchPlaces(val);
      setLocationSuggestions(results || []);
    } catch (err) {
      console.error("Konum arama hatasi:", err);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleSelectSuggestion(place) {
    const coords = [Number(place.lat), Number(place.lon)];
    setCurrentCoords(coords);

    // Get a shorter, cleaner name if possible or use the display name
    const shortName = place.display_name.split(",")[0] || place.display_name;
    setForm((current) => ({
      ...current,
      placeName: shortName,
    }));

    setLocationSearch("");
    setLocationSuggestions([]);
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");

    if (file.type.startsWith("image/")) {
      if (file.size > 4 * 1024 * 1024) {
        setError("Gorsel 4 MB altinda olmali.");
        return;
      }

      try {
        const preparedImage = await preparePostImageSet(file);
        setImage(preparedImage.image);
        setImageThumbnail(preparedImage.imageThumbnail);
        setVideo(""); // Clear video if image is chosen
        setError("");
      } catch {
        setError("Gorsel hazirlanamadi.");
      }
    } else if (file.type.startsWith("video/")) {
      if (file.size > 6 * 1024 * 1024) {
        setError("Video 6 MB altinda olmali.");
        return;
      }

      // Check duration
      const videoEl = document.createElement("video");
      const objectUrl = URL.createObjectURL(file);
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
      }
      videoObjectUrlRef.current = objectUrl;

      function clearVideoObjectUrl() {
        if (videoObjectUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          videoObjectUrlRef.current = "";
        }
      }

      videoEl.preload = "metadata";
      videoEl.onloadedmetadata = () => {
        clearVideoObjectUrl();
        if (videoEl.duration > 30.5) {
          setError("Video 30 saniyeden uzun olamaz!");
        } else {
          // Process file as base64
          const reader = new FileReader();
          reader.onload = () => {
            setVideo(String(reader.result));
            setImage(""); // Clear image if video is chosen
            setImageThumbnail("");
          };
          reader.readAsDataURL(file);
        }
      };
      videoEl.onerror = () => {
        clearVideoObjectUrl();
        setError("Video okunamadi.");
      };
      videoEl.src = objectUrl;
    } else {
      setError("Lutfen gorsel veya video dosyasi sec.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.description.trim() && !image && !video) {
      setError("Bir not yaz, fotograf veya video ekle.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onSubmit({
        description: form.description.trim(),
        placeName: form.placeName.trim() || "Konum",
        category: form.category,
        mood: form.mood,
        rating: Number(form.rating) || 0,
        tags: tagPreview,
        image,
        imageThumbnail,
        video,
        postType,
        lat: currentCoords[0],
        lng: currentCoords[1],
      });
    } catch (err) {
      setError(err.message || "Paylasim kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="post-overlay" role="dialog" aria-modal="true" aria-label="Yeni paylasim">
      {showCamera && (
        <Camera
          onCapture={async (captured) => {
            if (captured.startsWith("data:video/")) {
              setVideo(captured);
              setImage("");
              setImageThumbnail("");
            } else {
              try {
                const preparedImage = await preparePostImageSet(captured);
                setImage(preparedImage.image);
                setImageThumbnail(preparedImage.imageThumbnail);
                setVideo("");
                setError("");
              } catch {
                setError("Gorsel hazirlanamadi.");
              }
            }
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      <section className="post-panel">
        <header className="post-panel-header">
          <div>
            <p>Canli Harita</p>
            <h2>Yeni ani ekle</h2>
          </div>
          <button type="button" className="icon-close" onClick={onClose} aria-label="Paneli kapat">
            ×
          </button>
        </header>

        {error && <p className="post-error">{error}</p>}

        <form className="post-form" onSubmit={handleSubmit}>
          {/* Post Type Selector */}
          <div className="post-type-selector">
            <button
              type="button"
              className={postType === "permanent" ? "is-selected" : ""}
              onClick={() => setPostType("permanent")}
            >
              Kalıcı Paylaşım
            </button>
            <button
              type="button"
              className={postType === "story" ? "is-selected story-btn" : "story-btn"}
              onClick={() => setPostType("story")}
            >
              24s Hikaye (Story)
            </button>
          </div>

          {/* Location Search Box */}
          <div className="location-search-field">
            <label htmlFor="panel-location-search">
              <span>Konum Ara (Opsiyonel)</span>
            </label>
            <div className="search-input-wrapper">
              <input
                id="panel-location-search"
                value={locationSearch}
                onChange={(e) => handleLocationSearch(e.target.value)}
                placeholder="Mekan adi, cadde veya sehir ara... (Tıpkı Harita gibi)"
                autoComplete="off"
              />
              {searchLoading && <span className="search-spinner" />}
            </div>
            {locationSuggestions.length > 0 && (
              <ul className="panel-suggestions-list">
                {locationSuggestions.map((place) => (
                  <li key={place.place_id || `${place.lat}-${place.lon}`}>
                    <button type="button" onClick={() => handleSelectSuggestion(place)}>
                      <strong>{place.display_name.split(",")[0]}</strong>
                      <small>{place.display_name.split(",").slice(1).join(",")}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="post-smart-grid">
            <label>
              <span>Mekan adi</span>
              <input
                name="placeName"
                value={form.placeName}
                onChange={updateField}
                placeholder="Ornek: Moda Sahil"
                maxLength={120}
              />
            </label>

            <label>
              <span>Etiketler</span>
              <input
                name="tagsText"
                value={form.tagsText}
                onChange={updateField}
                placeholder="kahve, manzara, sakin"
                maxLength={120}
              />
            </label>
          </div>

          <fieldset className="category-picker">
            <legend>Kategori</legend>
            <div>
              {categories.map((category) => (
                <button
                  type="button"
                  className={form.category === category.value ? "is-selected" : ""}
                  key={category.value}
                  onClick={() => setForm((current) => ({ ...current, category: category.value }))}
                >
                  <span className={`category-dot category-${category.value}`} aria-hidden="true" />
                  {category.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mood-picker">
            <legend>Atmosfer</legend>
            <div>
              {moods.map((mood) => (
                <button
                  type="button"
                  key={mood.value}
                  className={form.mood === mood.value ? "is-selected" : ""}
                  onClick={() => setForm((current) => ({ ...current, mood: mood.value }))}
                >
                  {mood.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="rating-control">
            <span>Yer puani: {form.rating}/5</span>
            <input name="rating" type="range" min="1" max="5" value={form.rating} onChange={updateField} />
          </label>

          <label>
            <span>Not</span>
            <textarea
              name="description"
              value={form.description}
              onChange={updateField}
              placeholder="Burasi nasil bir yer? Kisa, net ve gercek bir izlenim yaz."
              maxLength={500}
              rows={4}
            />
          </label>
          <div className="character-row">
            <span>
              {currentCoords[0].toFixed(5)}, {currentCoords[1].toFixed(5)}
            </span>
            <span>{form.description.length} / 500</span>
          </div>

          {!!tagPreview.length && (
            <div className="tag-preview" aria-label="Etiket onizleme">
              {tagPreview.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          )}

          {/* Media Previews */}
          {image && (
            <figure className="image-preview">
              <img src={imageThumbnail || image} alt="Paylasim onizlemesi" loading="lazy" decoding="async" />
              <button type="button" onClick={() => {
                setImage("");
                setImageThumbnail("");
              }}>
                Gorseli kaldir
              </button>
            </figure>
          )}

          {video && (
            <figure className="image-preview video-preview-container">
              <video src={video} controls playsInline preload="metadata" className="video-preview-element" />
              <button type="button" onClick={() => setVideo("")}>
                Videoyu kaldir
              </button>
            </figure>
          )}

          <div className="media-actions">
            <button type="button" className="soft-button" onClick={() => setShowCamera(true)}>
              Kamera / On-Arka (Foto/Video)
            </button>
            <label className="soft-button file-button">
              Galeri
              <input type="file" accept="image/*,video/*" onChange={handleFileUpload} />
            </label>
          </div>

          <button type="submit" className="post-submit" disabled={loading}>
            {loading ? "Paylasiliyor..." : "Haritaya ekle"}
          </button>
        </form>
      </section>
    </div>
  );
}
