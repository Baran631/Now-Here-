import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPost } from "../../lib/api";
import "./StoryViewer.css";

const categoryLabels = {
  genel: "Genel",
  diger: "Genel",
  kafe: "Kafe",
  doga: "Doğa",
  etkinlik: "Etkinlik",
  spor: "Spor",
  sanat: "Sanat",
  yemek: "Yemek",
  alisveris: "Alışveriş",
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
  onDelete,
  currentUserId,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialStoryIndex);
  const [progressState, setProgressState] = useState({ index: initialStoryIndex, value: 0 });
  const [isMuted, setIsMuted] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [confirmReport, setConfirmReport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState("");
  const [postDetails, setPostDetails] = useState({});

  const baseStory = storyList[currentIndex];
  const activeStoryId = baseStory?._id || "";
  const loadedStoryDetails = activeStoryId ? postDetails[activeStoryId] : null;
  const activeStory = useMemo(
    () => (baseStory ? { ...baseStory, ...(loadedStoryDetails || {}) } : null),
    [baseStory, loadedStoryDetails]
  );
  const videoRef = useRef(null);
  const progressTimerRef = useRef(null);
  const durationRef = useRef(6000);

  const hasVideo = activeStory && !!activeStory.video;
  const canDelete = Boolean(activeStory?.authorId && activeStory.authorId === currentUserId);
  const progress = progressState.index === currentIndex ? progressState.value : 0;

  const goNext = useCallback(() => {
    if (currentIndex < storyList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgressState({ index: currentIndex + 1, value: 0 });
    } else {
      onClose();
    }
  }, [currentIndex, onClose, storyList.length]);

  useEffect(() => {
    if (!activeStoryId || baseStory.image || baseStory.video || loadedStoryDetails) return;
    let alive = true;

    fetchPost(activeStoryId)
      .then((post) => {
        if (!alive || !post) return;
        setPostDetails((current) => ({ ...current, [activeStoryId]: post }));
      })
      .catch(() => null);

    return () => {
      alive = false;
    };
  }, [activeStoryId, baseStory?.image, baseStory?.video, loadedStoryDetails]);

  useEffect(() => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (!activeStory) return;

    let totalDuration = hasVideo ? 30000 : 6000;
    durationRef.current = totalDuration;

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.load();
      videoRef.current.play().catch(() => null);
    }

    const intervalStep = 100;
    let elapsed = 0;

    progressTimerRef.current = setInterval(() => {
      if (hasVideo && videoRef.current && videoRef.current.duration) {
        totalDuration = videoRef.current.duration * 1000;
        elapsed = videoRef.current.currentTime * 1000;
      } else {
        elapsed += intervalStep;
      }

      const percent = Math.min((elapsed / totalDuration) * 100, 100);
      setProgressState({ index: currentIndex, value: percent });

      if (percent >= 100) {
        clearInterval(progressTimerRef.current);
        goNext();
      }
    }, intervalStep);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [activeStory, currentIndex, goNext, hasVideo]);

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgressState({ index: currentIndex - 1, value: 0 });
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
    setIsMuted((current) => !current);
  }

  function handleCommentSubmit(e) {
    e.preventDefault();
    if (!newComment.trim() || !activeStory) return;
    onComment(activeStory._id, newComment.trim());
    setNewComment("");
  }

  function triggerReport(e) {
    e.stopPropagation();
    setActionError("");
    setConfirmReport(true);
  }

  function triggerDelete(e) {
    e.stopPropagation();
    setActionError("");
    setConfirmDelete(true);
  }

  async function handleConfirmReport(e) {
    e.stopPropagation();
    if (!activeStory) return;
    try {
      await onReport(activeStory._id);
      if (storyList.length <= 1) {
        onClose();
      } else {
        goNext();
      }
      setConfirmReport(false);
    } catch (err) {
      setActionError(err.message || "Bildirim gönderilemedi.");
      return;
    }
  }

  async function handleConfirmDelete(e) {
    e.stopPropagation();
    if (!activeStory || !onDelete) return;
    const deletedId = activeStory._id;
    try {
      await onDelete(deletedId, { skipConfirm: true });
      setConfirmDelete(false);
    } catch (err) {
      setActionError(err.message || "Paylaşım silinemedi.");
      return;
    }

    if (storyList.length <= 1) {
      onClose();
    } else if (currentIndex >= storyList.length - 1) {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
      setProgressState({ index: Math.max(0, currentIndex - 1), value: 0 });
    }
  }

  if (!activeStory) return null;

  return (
    <div className="story-viewer-overlay" role="dialog" aria-modal="true">
      <div className="story-viewer-background" style={{ backgroundImage: `url(${activeStory.image || ""})` }} />

      <div className="story-viewer-container">
        <div className="story-progress-bars" aria-hidden="true">
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
              <button type="button" className="story-icon-btn" onClick={toggleMute} aria-label={isMuted ? "Sesi aç" : "Sesi kıs"}>
                {isMuted ? "Sessiz" : "Ses"}
              </button>
            )}
            {canDelete && (
              <button type="button" className="story-icon-btn delete-btn" onClick={triggerDelete} aria-label="Paylaşımı sil">
                Sil
              </button>
            )}
            <button
              type="button"
              className={`story-icon-btn report-btn ${activeStory.viewerReported ? "is-reported" : ""}`}
              onClick={triggerReport}
              disabled={activeStory.viewerReported}
              title="Sahte veya uygunsuz olarak şikayet et"
            >
              Bildir
            </button>
            <button type="button" className="story-close-btn" onClick={onClose} aria-label="Kapat">
              ×
            </button>
          </div>
        </header>

        <div className="story-media-panel">
          <button type="button" className="story-tap-zone left-zone" onClick={goPrev} aria-label="Önceki hikaye" />
          <button type="button" className="story-tap-zone right-zone" onClick={goNext} aria-label="Sonraki hikaye" />

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

          <div className="story-details-card">
            <div className="story-place-rating">
              <h3>{activeStory.placeName || "Konum"}</h3>
              <span className="story-rating-badge">{activeStory.rating || 0}/5</span>
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

        <footer className="story-viewer-footer">
          <form className="story-comment-input-form" onSubmit={handleCommentSubmit}>
            <input
              type="text"
              placeholder="Kısa yorum gönder"
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
              <span className="heart-icon">♥</span>
              <small>{activeStory.likes || 0}</small>
            </button>

            <button
              type="button"
              className="story-comments-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowComments(true);
              }}
              aria-label="Yorumları aç"
            >
              <span className="comment-icon">Yorum</span>
              <small>{(activeStory.comments || []).length}</small>
            </button>
          </div>
        </footer>

        {showComments && (
          <div className="story-comments-panel" onClick={(e) => e.stopPropagation()}>
            <header className="story-comments-header">
              <h3>Yorumlar ({(activeStory.comments || []).length})</h3>
              <button type="button" onClick={() => setShowComments(false)} aria-label="Yorumları kapat">×</button>
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
                <p className="story-comment-empty">Henüz yorum yok. İlk yorumu sen yaz.</p>
              )}
            </div>
            <form className="story-comments-panel-footer" onSubmit={handleCommentSubmit}>
              <input
                type="text"
                placeholder="Yorum ekle"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button type="submit" disabled={!newComment.trim()}>Gönder</button>
            </form>
          </div>
        )}

        {confirmReport && (
          <div className="story-report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="story-report-modal-content">
              <h4>Paylaşımı bildir</h4>
              <p>Bu paylaşımı sahte veya uygunsuz içerik olarak bildirmek istiyor musun?</p>
              {actionError && <p className="story-action-error">{actionError}</p>}
              <div className="story-report-modal-actions">
                <button type="button" className="confirm-btn" onClick={handleConfirmReport}>
                  Bildir
                </button>
                <button type="button" className="cancel-btn" onClick={() => setConfirmReport(false)}>
                  Vazgeç
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="story-report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="story-report-modal-content delete-modal">
              <h4>Paylaşımı sil</h4>
              <p>Bu paylaşım kalıcı olarak silinecek. Devam etmek istiyor musun?</p>
              {actionError && <p className="story-action-error">{actionError}</p>}
              <div className="story-report-modal-actions">
                <button type="button" className="confirm-btn" onClick={handleConfirmDelete}>
                  Sil
                </button>
                <button type="button" className="cancel-btn" onClick={() => setConfirmDelete(false)}>
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
