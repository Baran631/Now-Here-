import { useEffect, useState, useRef } from "react";
import "./StoryViewer.css";

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

function formatTimeAgo(dateString) {
  if (!dateString) return "";
  const now = new Date();
  const created = new Date(dateString);
  const diffMs = now.getTime() - created.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "Şimdi";
  if (diffMin < 60) return `${diffMin} dk`;
  if (diffHr < 24) return `${diffHr} sa`;
  return `${Math.floor(diffHr / 24)} gün`;
}

export default function StoryViewer({
  storyList = [],
  initialStoryIndex = 0,
  onClose,
  onLike,
  onComment,
  onReport,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialStoryIndex);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [confirmReport, setConfirmReport] = useState(false);

  const activeStory = storyList[currentIndex];
  const videoRef = useRef(null);
  const progressTimerRef = useRef(null);
  const durationRef = useRef(6000); // 6s photo default

  const hasVideo = activeStory && !!activeStory.video;

  // Auto-advance logic
  useEffect(() => {
    setProgress(0);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    if (!activeStory) return;

    let totalDuration = hasVideo ? 30000 : 6000; // default 30s video or 6s photo
    durationRef.current = totalDuration;

    // Reset video play if exists
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.load();
      videoRef.current.play().catch(() => null);
    }

    const intervalStep = 100; // Update every 100ms
    let elapsed = 0;

    progressTimerRef.current = setInterval(() => {
      // If video is loaded, we can base progress on video duration!
      if (hasVideo && videoRef.current && videoRef.current.duration) {
        totalDuration = videoRef.current.duration * 1000;
        elapsed = videoRef.current.currentTime * 1000;
      } else {
        elapsed += intervalStep;
      }

      const percent = Math.min((elapsed / totalDuration) * 100, 100);
      setProgress(percent);

      if (percent >= 100) {
        clearInterval(progressTimerRef.current);
        goNext();
      }
    }, intervalStep);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [currentIndex, activeStory]);

  function goNext() {
    if (currentIndex < storyList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onClose(); // Exit on last story
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }

  function handleVideoLoadedMetadata(e) {
    if (e.target.duration) {
      durationRef.current = e.target.duration * 1000;
    }
  }

  async function handleLikeClick(e) {
    e.stopPropagation();
    if (!activeStory) return;
    await onLike(activeStory._id);
  }

  function toggleMute(e) {
    e.stopPropagation();
    setIsMuted(!isMuted);
  }

  function handleCommentSubmit(e) {
    e.preventDefault();
    if (!newComment.trim() || !activeStory) return;
    onComment(activeStory._id, newComment.trim());
    setNewComment("");
  }

  async function triggerReport(e) {
    e.stopPropagation();
    setConfirmReport(true);
  }

  async function handleConfirmReport(e) {
    e.stopPropagation();
    if (!activeStory) return;
    try {
      await onReport(activeStory._id);
      // Move to next post if reported
      if (storyList.length <= 1) {
        onClose();
      } else {
        goNext();
      }
    } catch (err) {
      alert(err.message || "Sikayet iletilemedi.");
    } finally {
      setConfirmReport(false);
    }
  }

  if (!activeStory) return null;

  return (
    <div className="story-viewer-overlay" role="dialog" aria-modal="true">
      {/* Background glass blur */}
      <div className="story-viewer-background" style={{ backgroundImage: `url(${activeStory.image || ""})` }} />

      {/* Main Container */}
      <div className="story-viewer-container">
        
        {/* Top Progress Bars */}
        <div className="story-progress-bars">
          {storyList.map((story, idx) => {
            let width = "0%";
            if (idx < currentIndex) width = "100%";
            if (idx === currentIndex) width = `${progress}%`;

            return (
              <div key={story._id || idx} className="story-progress-bg">
                <div className="story-progress-fill" style={{ width }} />
              </div>
            );
          })}
        </div>

        {/* Top Header */}
        <header className="story-viewer-header">
          <div className="story-author-info">
            <span className="story-avatar">
              {activeStory.authorAvatar ? (
                <img src={`data:image/svg+xml;utf8,${activeStory.authorAvatar}`} alt="" />
              ) : (
                <span>{activeStory.authorName?.[0]?.toUpperCase() || "G"}</span>
              )}
            </span>
            <div className="story-meta-text">
              <strong>{activeStory.authorName || "Gezgin"}</strong>
              <small>{formatTimeAgo(activeStory.createdAt)}</small>
            </div>
            <span className={`story-category-tag category-${activeStory.category}`}>
              {categoryLabels[activeStory.category] || "Genel"}
            </span>
          </div>

          <div className="story-header-actions">
            {hasVideo && (
              <button type="button" className="story-icon-btn mute-btn" onClick={toggleMute} aria-label={isMuted ? "Sesi aç" : "Sesi kıs"}>
                {isMuted ? "🔇" : "🔊"}
              </button>
            )}
            <button
              type="button"
              className={`story-icon-btn report-btn ${activeStory.viewerReported ? "is-reported" : ""}`}
              onClick={triggerReport}
              disabled={activeStory.viewerReported}
              title="Sahte veya uygunsuz olarak sikayet et"
            >
              🚩
            </button>
            <button type="button" className="story-close-btn" onClick={onClose} aria-label="Kapat">
              ×
            </button>
          </div>
        </header>

        {/* Story Media Panel */}
        <div className="story-media-panel">
          {/* Navigation Click Zones */}
          <div className="story-tap-zone left-zone" onClick={goPrev} title="Önceki hikaye" />
          <div className="story-tap-zone right-zone" onClick={goNext} title="Sonraki hikaye" />

          {/* Media Content */}
          {hasVideo ? (
            <video
              ref={videoRef}
              src={activeStory.video}
              autoPlay
              muted={isMuted}
              playsInline
              onLoadedMetadata={handleVideoLoadedMetadata}
              className="story-media-element video"
            />
          ) : (
            <img src={activeStory.image || "/placeholder-memory.jpg"} alt="Anı fotoğrafı" className="story-media-element image" />
          )}

          {/* Place Description details card */}
          <div className="story-details-card">
            <div className="story-place-rating">
              <h3>📍 {activeStory.placeName || "Konum"}</h3>
              <span className="story-rating-badge">{activeStory.rating || 0}/5 Puan</span>
              <span className="story-mood-badge">{moodLabels[activeStory.mood] || "Sakin"}</span>
            </div>
            {activeStory.description && <p className="story-caption">{activeStory.description}</p>}
            {!!activeStory.tags?.length && (
              <div className="story-tags">
                {activeStory.tags.map((tag) => (
                  <span key={tag} className="story-tag-bubble">#{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Interactive Area */}
        <footer className="story-viewer-footer">
          <form className="story-comment-input-form" onSubmit={handleCommentSubmit}>
            <input
              type="text"
              placeholder="Hızlı yorum gönder..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <button type="submit" disabled={!newComment.trim()}>Gönder</button>
          </form>

          <div className="story-bottom-actions">
            <button
              type="button"
              className={`story-like-action-btn ${activeStory.viewerLiked ? "liked" : ""}`}
              onClick={handleLikeClick}
              aria-label="Beğen"
            >
              <span className="heart-icon">{activeStory.viewerLiked ? "❤️" : "🤍"}</span>
              <small>{activeStory.likes || 0}</small>
            </button>

            <button
              type="button"
              className="story-comments-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowComments(true);
              }}
            >
              <span className="comment-icon">💬</span>
              <small>{(activeStory.comments || []).length}</small>
            </button>
          </div>
        </footer>

        {/* Comments Overlay */}
        {showComments && (
          <div className="story-comments-panel" onClick={(e) => e.stopPropagation()}>
            <header className="story-comments-header">
              <h3>Yorumlar ({(activeStory.comments || []).length})</h3>
              <button type="button" onClick={() => setShowComments(false)}>×</button>
            </header>
            <div className="story-comments-list">
              {(activeStory.comments || []).length ? (
                (activeStory.comments || []).map((comment) => (
                  <article key={comment._id} className="story-comment-item">
                    <strong>{comment.userName || "Gezgin"}</strong>
                    <p>{comment.text}</p>
                    <small>{formatTimeAgo(comment.createdAt)}</small>
                  </article>
                ))
              ) : (
                <p className="story-comment-empty">Henüz yorum yazılmamış. İlk yorumu sen yaz!</p>
              )}
            </div>
            <form className="story-comments-panel-footer" onSubmit={handleCommentSubmit}>
              <input
                type="text"
                placeholder="Yorum ekle..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button type="submit" disabled={!newComment.trim()}>Gönder</button>
            </form>
          </div>
        )}

        {/* Report Confirmation Modal */}
        {confirmReport && (
          <div className="story-report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="story-report-modal-content">
              <h4>Paylaşımı Şikayet Et</h4>
              <p>Bu paylaşımı sahte veya uygunsuz içerik olarak şikayet etmek istediğinizden emin misiniz?</p>
              <div className="story-report-modal-actions">
                <button type="button" className="confirm-btn" onClick={handleConfirmReport}>
                  Evet, Şikayet Et
                </button>
                <button type="button" className="cancel-btn" onClick={() => setConfirmReport(false)}>
                  Vazgeç
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
