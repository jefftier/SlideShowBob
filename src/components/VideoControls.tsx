import React, { useState, useEffect, useRef, useCallback } from 'react';
import './VideoControls.css';

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Show controls when hovering over the media display area */
  visible: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const VideoControls: React.FC<VideoControlsProps> = ({ videoRef, visible }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const durationRef = useRef(0);

  // Keep durationRef in sync
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Sync play state and metadata from video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onDurationChange = () => {
      const d = video.duration || 0;
      setDuration(d);
      durationRef.current = d;
    };
    const onLoadedMetadata = () => {
      const d = video.duration || 0;
      setDuration(d);
      durationRef.current = d;
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);

    // Set initial state
    setIsPlaying(!video.paused);
    if (video.duration && isFinite(video.duration)) {
      setDuration(video.duration);
      durationRef.current = video.duration;
    }

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [videoRef, videoRef.current]);

  // Update current time and buffered via rAF for smooth progress
  useEffect(() => {
    const update = () => {
      const video = videoRef.current;
      if (video) {
        if (!isSeeking) {
          setCurrentTime(video.currentTime);
        }
        // Update buffered
        if (video.buffered.length > 0) {
          setBuffered(video.buffered.end(video.buffered.length - 1));
        }
        // Keep duration in sync in case it wasn't set by event
        if (video.duration && isFinite(video.duration) && video.duration !== durationRef.current) {
          setDuration(video.duration);
          durationRef.current = video.duration;
        }
      }
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [videoRef, isSeeking]);

  const togglePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef]);

  const seekToPosition = useCallback((clientX: number) => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video) return;
    const d = video.duration;
    if (!d || !isFinite(d)) return;

    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const fraction = x / rect.width;
    const newTime = fraction * d;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [videoRef]);

  const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsSeeking(true);
    seekToPosition(e.clientX);

    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      seekToPosition(ev.clientX);
    };
    const onUp = () => {
      setIsSeeking(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [seekToPosition]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      className={`video-controls-overlay ${visible ? 'visible' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="video-controls-bar">
        <button
          className="video-play-btn"
          onClick={togglePlayPause}
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
          tabIndex={visible ? 0 : -1}
        >
          {isPlaying ? (
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 2.5v11l9-5.5L4 2.5z" />
            </svg>
          )}
        </button>
        <span className="video-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div
        className="video-progress-track"
        ref={trackRef}
        onMouseDown={handleTrackMouseDown}
        role="slider"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(currentTime)}
        tabIndex={visible ? 0 : -1}
      >
        <div
          className="video-progress-buffered"
          style={{ width: `${bufferedProgress}%` }}
        />
        <div
          className="video-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default VideoControls;
