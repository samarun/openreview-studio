"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { buildMediaProxyUrl } from "../lib/media";
import type { AssetVersion } from "../lib/types";

export type PlaybackState = {
  currentTime: number;
  playing: boolean;
};

export type ReviewPlayerHandle = {
  getCurrentTime: () => number;
  setCurrentTime: (seconds: number) => void;
  getFrameRate: () => number;
  getVideoElement: () => HTMLVideoElement | null;
  play: () => Promise<void>;
  pause: () => void;
  isPlaying: () => boolean;
};

type ReviewPlayerProps = {
  version: AssetVersion;
  mediaBasePath?: string;
  authQuery: string;
  onTimeUpdate?: (seconds: number) => void;
  onPlaybackChange?: (state: PlaybackState) => void;
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  syncPlayback?: PlaybackState | null;
  playbackRole?: "master" | "follower" | "independent";
  presenterMode?: boolean;
  mode?: "review" | "preview";
  layout?: "fill" | "aspect";
  hideControls?: boolean;
};

function clampTime(seconds: number, durationSeconds: number | null | undefined) {
  const max = durationSeconds && durationSeconds > 0 ? durationSeconds : undefined;
  if (max === undefined) return Math.max(0, seconds);
  return Math.min(Math.max(0, seconds), max);
}

export const ReviewPlayer = forwardRef<ReviewPlayerHandle, ReviewPlayerProps>(function ReviewPlayer(
  {
    version,
    mediaBasePath = "/media/proxies",
    authQuery,
    onTimeUpdate,
    onPlaybackChange,
    onVideoElement,
    syncPlayback,
    playbackRole = "independent",
    presenterMode,
    mode = "review",
    layout,
    hideControls = false
  },
  ref
) {
  const resolvedLayout = layout ?? (mode === "preview" ? "aspect" : "fill");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const applyingRemoteSync = useRef(false);
  const syncPlaybackRef = useRef(syncPlayback);
  const onVideoElementRef = useRef(onVideoElement);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [instanceKey, setInstanceKey] = useState(0);

  const isFollower = playbackRole === "follower";
  const isMaster = playbackRole === "master";
  const fillLayout = resolvedLayout === "fill" || presenterMode;
  const canPlay = Boolean(version.proxyKey) && version.status !== "FAILED";
  const poster = version.thumbnailKey
    ? buildMediaProxyUrl(version.thumbnailKey, authQuery, mediaBasePath)
    : undefined;
  const proxyUrl = version.proxyKey ? buildMediaProxyUrl(version.proxyKey, authQuery, mediaBasePath) : null;

  syncPlaybackRef.current = syncPlayback;
  onVideoElementRef.current = onVideoElement;

  function readPlaying() {
    return Boolean(videoRef.current && !videoRef.current.paused);
  }

  function readCurrentTime() {
    return videoRef.current?.currentTime ?? 0;
  }

  function emitPlayback() {
    const currentTime = readCurrentTime();
    onTimeUpdate?.(currentTime);
    if (applyingRemoteSync.current || isFollower) return;
    if (isMaster || playbackRole === "independent") {
      onPlaybackChange?.({ currentTime, playing: readPlaying() });
    }
  }

  function applyCurrentTime(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const target = clampTime(seconds, version.durationSeconds);
    if (Math.abs(video.currentTime - target) > 0.01) {
      video.currentTime = target;
    }
  }

  async function startFollowerPlayback(video: HTMLVideoElement) {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          window.clearTimeout(timer);
          video.removeEventListener("canplay", finish);
          video.removeEventListener("loadeddata", finish);
          resolve();
        };
        const timer = window.setTimeout(finish, 3000);
        video.addEventListener("canplay", finish);
        video.addEventListener("loadeddata", finish);
      });
    }
    try {
      await video.play();
    } catch {
      // Muted follow playback is allowed without gesture in modern browsers; ignore transient errors.
    }
  }

  function enforceFollowerSync() {
    const video = videoRef.current;
    const sync = syncPlaybackRef.current;
    if (!video || !isFollower || !sync || applyingRemoteSync.current) return;

    const target = clampTime(sync.currentTime, version.durationSeconds);
    if (Math.abs(video.currentTime - target) > 0.05) {
      applyingRemoteSync.current = true;
      video.currentTime = target;
      applyingRemoteSync.current = false;
    }

    const playing = readPlaying();
    if (sync.playing !== playing) {
      applyingRemoteSync.current = true;
      if (sync.playing) void startFollowerPlayback(video);
      else video.pause();
      applyingRemoteSync.current = false;
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: readCurrentTime,
      setCurrentTime: applyCurrentTime,
      getFrameRate: () => version.frameRate ?? 24,
      getVideoElement: () => videoRef.current,
      play: async () => {
        const video = videoRef.current;
        if (!video) return;
        if (isFollower) video.muted = true;
        await video.play();
      },
      pause: () => {
        videoRef.current?.pause();
      },
      isPlaying: readPlaying
    }),
    [version.durationSeconds, version.frameRate]
  );

  useEffect(() => {
    setPlaybackError(null);
    setInstanceKey((value) => value + 1);
  }, [version.id, version.proxyKey]);

  useEffect(() => {
    onVideoElementRef.current?.(videoRef.current);
    return () => onVideoElementRef.current?.(null);
  }, [instanceKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !proxyUrl) return;

    onVideoElementRef.current?.(video);

    video.controls = !isFollower && !hideControls;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = "auto";
    video.muted = isFollower;
    video.poster = poster ?? "";
    video.src = proxyUrl;
    video.className = "review-player-video";

    let initialised = false;

    const onNativeEvent = () => {
      if (isFollower) {
        enforceFollowerSync();
        return;
      }
      emitPlayback();
    };

    const onLoaded = () => {
      onVideoElementRef.current?.(video);
      if (initialised) return;
      initialised = true;
      if (isFollower && syncPlaybackRef.current) {
        applyCurrentTime(syncPlaybackRef.current.currentTime);
        if (!syncPlaybackRef.current.playing) video.pause();
      }
    };

    video.addEventListener("timeupdate", onNativeEvent);
    video.addEventListener("play", onNativeEvent);
    video.addEventListener("pause", onNativeEvent);
    video.addEventListener("seeked", onNativeEvent);
    video.addEventListener("seeking", onNativeEvent);
    video.addEventListener("loadedmetadata", onLoaded);
    const onError = () => {
      const code = video.error?.code;
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setPlaybackError("Video format not supported or file not found. The proxy may not exist in storage.");
      } else if (code === MediaError.MEDIA_ERR_NETWORK) {
        setPlaybackError("Network error loading video. Confirm the API is running on port 4000.");
      } else {
        setPlaybackError("Unable to load video. Confirm the API is running on port 4000.");
      }
    };
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("timeupdate", onNativeEvent);
      video.removeEventListener("play", onNativeEvent);
      video.removeEventListener("pause", onNativeEvent);
      video.removeEventListener("seeked", onNativeEvent);
      video.removeEventListener("seeking", onNativeEvent);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      video.load();
      onVideoElementRef.current?.(null);
    };
  }, [instanceKey, hideControls, isFollower, poster, proxyUrl, version.durationSeconds]);

  useEffect(() => {
    if (!syncPlayback || !isFollower) return;
    enforceFollowerSync();
  }, [syncPlayback, isFollower]);

  useEffect(() => {
    if (!isFollower || !syncPlayback?.playing) return;
    const interval = window.setInterval(() => enforceFollowerSync(), 80);
    return () => window.clearInterval(interval);
  }, [isFollower, syncPlayback?.playing, syncPlayback?.currentTime]);

  const rootClass = fillLayout
    ? "review-player-root review-player-root--fill flex h-full min-h-0 w-full flex-1 flex-col"
    : "review-player-root review-player-root--aspect relative w-full bg-black";
  const stageClass = [
    "review-player-stage",
    fillLayout ? "review-player-stage--fill" : "review-player-stage--aspect",
    isFollower ? "review-player-stage--follower" : "",
    presenterMode ? "min-h-[70vh]" : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (!canPlay) {
    return (
      <div
        className={`review-player-root flex items-center justify-center bg-black ${presenterMode ? "min-h-[70vh]" : "aspect-video"}`}
      >
        <div className="px-6 text-center">
          <p className="text-lg font-medium text-frame-text">Processing video</p>
          <p className="mt-2 text-sm text-frame-muted">
            {version.status === "FAILED"
              ? version.failureReason ?? "Transcode failed"
              : version.hlsManifestKey && !version.proxyKey
                ? "Proxy still processing — refresh shortly."
                : "Your proxy will appear here when ready."}
          </p>
        </div>
      </div>
    );
  }

  if (playbackError) {
    return (
      <div
        className={`review-player-root flex items-center justify-center bg-black ${presenterMode ? "min-h-[70vh]" : "aspect-video"}`}
      >
        <div className="px-6 text-center">
          <p className="text-lg font-medium text-rose-300">Video unavailable</p>
          <p className="mt-2 text-sm text-frame-muted">{playbackError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass} data-review-player ref={containerRef}>
      <div key={instanceKey} className={stageClass}>
        <video
          ref={videoRef}
          className="review-player-video"
          controls={!isFollower && !hideControls}
          muted={isFollower}
          playsInline
          poster={poster}
        />
        {isFollower ? <div className="review-player-follower-overlay" aria-hidden /> : null}
      </div>
    </div>
  );
});
