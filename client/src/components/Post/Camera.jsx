import { useCallback, useEffect, useRef, useState } from "react";
import "./Camera.css";

const cameraModes = {
  environment: {
    label: "Arka kamera",
    facingMode: { ideal: "environment" },
  },
  user: {
    label: "On kamera",
    facingMode: { ideal: "user" },
  },
};

export default function Camera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("environment");
  const [switching, setSwitching] = useState(false);

  const [captureMode, setCaptureMode] = useState("photo"); // 'photo' veya 'video'
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const stopStream = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (nextMode, nextCaptureMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Bu tarayici kamera erisimini desteklemiyor.");
      return;
    }

    setReady(false);
    setSwitching(true);
    setError("");
    stopStream();

    try {
      const constraints = {
        video: {
          facingMode: cameraModes[nextMode].facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: nextCaptureMode === "video",
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }
      setReady(true);
    } catch (err) {
      console.error("Kamera baslatilamadi:", err);
      if (nextCaptureMode === "video") {
        try {
          const constraintsNoAudio = {
            video: {
              facingMode: cameraModes[nextMode].facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraintsNoAudio);
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => null);
          }
          setReady(true);
        } catch (innerErr) {
          setError(innerErr.message || "Kamera acilamadi.");
        }
      } else {
        setError(err.message || "Kamera acilamadi.");
      }
    } finally {
      setSwitching(false);
    }
  }, [stopStream]);

  useEffect(() => {
    let mounted = true;
    // Camera access is an external browser API and must be synchronized when mode changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera(mode, captureMode).then(() => {
      if (!mounted) stopStream();
    });

    return () => {
      mounted = false;
      stopStream();
    };
  }, [mode, captureMode, startCamera, stopStream]);

  function closeCamera() {
    stopStream();
    onClose();
  }

  function switchCamera() {
    setMode((current) => (current === "environment" ? "user" : "environment"));
  }

  function handleModeChange(newMode) {
    if (isRecording) return;
    setCaptureMode(newMode);
  }

  function capturePhoto() {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video || !video.videoWidth) {
      setError("Kamera goruntusu henuz hazir degil.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");

    if (mode === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL("image/jpeg", 0.84);
    stopStream();
    onCapture(imageData);
  }

  const startRecording = () => {
    if (!streamRef.current || isRecording) return;

    recordedChunksRef.current = [];
    let mimeType = "video/webm;codecs=vp9";
    if (MediaRecorder.isTypeSupported("video/mp4;codecs=h264")) {
      mimeType = "video/mp4;codecs=h264";
    } else if (MediaRecorder.isTypeSupported("video/mp4")) {
      mimeType = "video/mp4";
    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=h264")) {
      mimeType = "video/webm;codecs=h264";
    } else if (MediaRecorder.isTypeSupported("video/webm")) {
      mimeType = "video/webm";
    }

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            stopStream();
            onCapture(String(reader.result)); // Base64 URL
          };
          reader.readAsDataURL(blob);
        }
      };

      setIsRecording(true);
      setRecordingSeconds(0);
      mediaRecorder.start(1000); // trigger every second

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 29) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Kayit baslatilamadi:", err);
      setError("Video kaydi baslatilamadi: " + err.message);
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleShutterClick = () => {
    if (captureMode === "photo") {
      capturePhoto();
    } else {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  };

  return (
    <div className="camera-screen">
      {error ? (
        <div className="camera-error">
          <strong>Kamera kullanilamiyor</strong>
          <p>{error}</p>
          <button type="button" onClick={closeCamera}>
            Kapat
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`camera-video ${mode === "user" ? "is-selfie" : ""}`}
          />
          <canvas ref={canvasRef} hidden />

          <div className="camera-hud" aria-live="polite">
            <span className="camera-mode-indicator">
              {cameraModes[mode].label} · {captureMode === "photo" ? "FOTOGRAF" : "VIDEO"}
            </span>
            {isRecording ? (
              <small className="recording-indicator">
                <span className="red-dot"></span>
                {`00:${recordingSeconds < 10 ? "0" + recordingSeconds : recordingSeconds} / 00:30`}
              </small>
            ) : (
              <small>{switching ? "Kamera degistiriliyor..." : captureMode === "photo" ? "Fotograf cekmek icin bas" : "30sn video kaydi icin bas"}</small>
            )}
          </div>

          <div className="camera-mode-selector">
            <button
              type="button"
              className={`mode-btn ${captureMode === "photo" ? "active" : ""}`}
              onClick={() => handleModeChange("photo")}
              disabled={isRecording}
            >
              Fotograf
            </button>
            <button
              type="button"
              className={`mode-btn ${captureMode === "video" ? "active" : ""}`}
              onClick={() => handleModeChange("video")}
              disabled={isRecording}
            >
              Video
            </button>
          </div>

          <div className="camera-controls">
            <button type="button" className="camera-secondary" onClick={closeCamera} disabled={isRecording}>
              Vazgec
            </button>
            <button
              type="button"
              className={`camera-shutter ${captureMode === "video" ? "is-video-mode" : ""} ${isRecording ? "is-recording" : ""}`}
              onClick={handleShutterClick}
              disabled={!ready || switching}
              aria-label={captureMode === "photo" ? "Fotograf cek" : isRecording ? "Kaydi durdur" : "Kaydi baslat"}
            />
            <button
              type="button"
              className="camera-secondary camera-switch"
              onClick={switchCamera}
              disabled={switching || isRecording}
            >
              Cevir
            </button>
          </div>
        </>
      )}
    </div>
  );
}
