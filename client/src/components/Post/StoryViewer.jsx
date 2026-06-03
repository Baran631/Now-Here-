import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPostDetailCached } from "../../lib/api";
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
const STORY_DETAIL_PRELOAD_RADIUS = 1;
const STORY_PROGRESS_STEP_MS = 200;

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

function getCommentCount(post) {
  return Number(post?.commentCount) || (post?.comments || []).length || 0;
}

function getStoryCacheIds(storyList, currentIndex) {
  const ids = [];
  const activeId = storyList[currentIndex]?._id;
  if (activeId) ids.push(activeId);

  for (let offset = 1; offset <= STORY_DETAIL_PRELOAD_RADIUS; offset += 1) {
    const previousId = storyList[currentIndex - offset]?._id;
    const nextId = storyList[currentIndex + offset]?._id;
    if (previousId) ids.push(previousId);
    if (nextId) ids.push(nextId);
  }

  return ids;
}

function trimStoryDetailsCache(current, allowedIds) {
  const allowed = new Set(allowedIds);
  return Object.fromEntries(Object.entries(current).filter(([key]) => allowed.has(key)));
}

function releaseVideoElement(videoElement) {
  if (!videoElement) return;
  videoElement.pause();
  videoElement.removeAttribute("src");
  videoElement.load();
}

function useDecodedStoryImage(story) {
  const thumbnailSrc = story?.imageThumbnail || "";
  const fullSrc = story?.image || "";
  const fallbackSrc = thumbnailSrc || "/placeholder-memory.jpg";
  const [decodedFullSrc, setDecodedFullSrc] = useState("");
  const isFullReady = !fullSrc || fullSrc === fallbackSrc || decodedFullSrc === fullSrc;
  const displaySrc = isFullReady && fullSrc ? fullSrc : fallbackSrc;

  useEffect(() => {
    let alive = true;

    if (!fullSrc || fullSrc === fallbackSrc || decodedFullSrc === fullSrc) {
      return () => {
        alive = false;
      };
    }

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (!alive) return;
      const decodePromise = typeof image.decode === "function" ? image.decode().catch(() => null) : Promise.resolve();
      decodePromise.then(() => {
        if (!alive) return;
        setDecodedFullSrc(fullSrc);
      });
    };
    image.onerror = () => null;
    image.src = fullSrc;

    return () => {
      alive = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [decodedFullSrc, fallbackSrc, fullSrc]);

  return { displaySrc, isFullReady };
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
  const postDetailsRef = useRef({});

  const cachedStoryIds = useMemo(() => getStoryCacheIds(storyList, currentIndex), [currentIndex, storyList]);
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
  const closeRef = useRef(onClose);
  const progressValueRef = useRef(0);
  const touchStartRef = useRef(null);

  useEffect(() => {
    postDetailsRef.current = postDetails;
  }, [postDetails]);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const cleanupStoryResources = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    releaseVideoElement(videoRef.current);
  }, []);

  const hasVideo = activeStory && !!activeStory.video;
  const storyImage = useDecodedStoryImage(hasVideo ? null : activeStory);
  const canDelete = Boolean(activeStory?.authorId && activeStory.authorId === currentUserId);
  const progress = progressState.index === currentIndex ? progressState.value : 0;
  const progressStories = useMemo(
    () =>
      storyList
        .map((story, idx) => ({ story, idx }))
        .slice(Math.max(0, currentIndex - 1), Math.min(storyList.length, currentIndex + 2)),
    [currentIndex, storyList]
  );

  const handleClose = useCallback(() => {
    cleanupStoryResources();
    setPostDetails({});
    closeRef.current();
  }, [cleanupStoryResources]);

  useEffect(() => () => {
    cleanupStoryResources();
  }, [cleanupStoryResources]);

  const goToIndex = useCallback((nextIndex) => {
    setShowComments(false);
    setConfirmReport(false);
    setConfirmDelete(false);
    setActionError("");
    setNewComment("");
    progressValueRef.current = 0;
    setPostDetails((current) => trimStoryDetailsCache(current, getStoryCacheIds(storyList, nextIndex)));
    setCurrentIndex(nextIndex);
    setProgressState({ index: nextIndex, value: 0 });
  }, [storyList]);

  const goNext = useCallback(() => {
    if (currentIndex < storyList.length - 1) {
      goToIndex(currentIndex + 1);
    } else {
      handleClose();
    }
  }, [currentIndex, goToIndex, handleClose, storyList.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      goToIndex(currentIndex - 1);
    }
  }, [currentIndex, goToIndex]);

  const handleOverlayClick = useCallback((event) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  const handleTouchStart = useCallback((event) => {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, []);

  const handleTouchEnd = useCallback((event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    if (deltaX < 0) {
      goNext();
    } else {
      goPrev();
    }
  }, [goNext, goPrev]);

  useEffect(() => {
    let alive = true;
    const idsToLoad = cachedStoryIds.filter((storyId) => {
      const story = storyList.find((item) => item?._id === storyId);
      const isActiveStory = storyId === activeStoryId;
      if (!isActiveStory && story?.hasVideo) return false;
      return storyId && story && !story.image && !story.video && !postDetailsRef.current[storyId];
    });

    idsToLoad.forEach((storyId) => {
      fetchPostDetailCached(storyId)
        .then((post) => {
          if (!alive || !post) return;
          setPostDetails((current) => {
            const allowedIds = new Set(getStoryCacheIds(storyList, currentIndex));
            if (!allowedIds.has(storyId)) return trimStoryDetailsCache(current, Array.from(allowedIds));
            return trimStoryDetailsCache({ ...current, [storyId]: post }, Array.from(allowedIds));
          });
        })
        .catch(() => null);
    });

    return () => {
      alive = false;
    };
  }, [activeStoryId, cachedStoryIds, currentIndex, storyList]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose]);

  useEffect(() => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (!activeStory) return;

    let totalDuration = hasVideo ? 30000 : 6000;
    durationRef.current = totalDuration;
    const videoElement = videoRef.current;

    if (videoElement) {
      videoElement.currentTime = 0;
      videoElement.load();
      videoElement.play().catch(() => null);
    }

    const intervalStep = STORY_PROGRESS_STEP_MS;
    let elapsed = 0;
    progressValueRef.current = 0;

    progressTimerRef.current = setInterval(() => {
      if (hasVideo && videoElement && videoElement.duration) {
        totalDuration = videoElement.duration * 1000;
        elapsed = videoElement.currentTime * 1000;
      } else {
        elapsed += intervalStep;
      }

      const percent = Math.min((elapsed / totalDuration) * 100, 100);
      if (percent >= 100 || percent - progressValueRef.current >= 2) {
        progressValueRef.current = percent;
        setProgressState({ index: currentIndex, value: percent });
      }

      if (percent >= 100) {
        clearInterval(progressTimerRef.current);
        goNext();
      }
    }, intervalStep);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (videoElement) {
        videoElement.pause();
      }
    };
  }, [activeStory, currentIndex, goNext, hasVideo]);

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
        handleClose();
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
      handleClose();
    } else if (currentIndex >= storyList.length - 1) {
      goToIndex(Math.max(0, currentIndex - 1));
    }
  }

  if (!activeStory) return null;

  return (
    <div
      className="story-viewer-overlay"
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="story-viewer-background" style={{ backgroundImage: `url(${activeStory.imageThumbnail || ""})` }} />

      <div className="story-viewer-container" onClick={(event) => event.stopPropagation()}>
        <div className="story-progress-bars" aria-hidden="true">
          {progressStories.map(({ story, idx }) => {
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
                <img src={`data:image/svg+xml;utf8,${activeStory.authorAvatar}`} alt="" loading="lazy" decoding="async" />
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
            <button type="button" className="story-close-btn" onClick={handleClose} aria-label="Kapat">
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
              preload="metadata"
              onLoadedMetadata={handleVideoLoadedMetadata}
              className="story-media-element video"
            />
          ) : (
            <img
              src={storyImage.displaySrc}
              alt="Anı fotoğrafı"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className={`story-media-element image ${storyImage.isFullReady ? "is-full-ready" : "is-loading-full"}`}
            />
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
              <small>{getCommentCount(activeStory)}</small>
            </button>
          </div>
        </footer>

        {showComments && (
          <div className="story-comments-panel" onClick={(e) => e.stopPropagation()}>
            <header className="story-comments-header">
              <h3>Yorumlar ({getCommentCount(activeStory)})</h3>
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
