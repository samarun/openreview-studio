/** Thresholds for smooth dual-video compare sync (seconds). */
export const COMPARE_SYNC = {
  /** When paused, snap if drift exceeds this. */
  pauseSeekThreshold: 0.02,
  /** During playback, hard-seek only above this. */
  playSeekThreshold: 0.35,
  /** Start nudging playbackRate above this drift while playing. */
  rateAdjustThreshold: 0.06,
  /** Max playbackRate adjustment magnitude. */
  maxRateDelta: 0.08,
} as const;

export function clampCompareTime(seconds: number, maxDuration: number) {
  if (maxDuration <= 0) return Math.max(0, seconds);
  return Math.min(Math.max(0, seconds), maxDuration);
}

/**
 * Keep follower aligned with master without jittery per-frame seeks.
 * Uses playbackRate for small drift and hard seek only when far off.
 */
export function syncFollowerVideo(
  master: HTMLVideoElement,
  follower: HTMLVideoElement,
  followerMaxTime: number
) {
  const masterTime = master.currentTime;
  const target = clampCompareTime(masterTime, followerMaxTime);
  const playing = !master.paused && !master.ended;
  const drift = follower.currentTime - target;

  follower.muted = true;

  if (!playing) {
    follower.playbackRate = 1;
    if (Math.abs(drift) > COMPARE_SYNC.pauseSeekThreshold) {
      try {
        follower.currentTime = target;
      } catch {
        // Ignore seek errors while loading.
      }
    }
    if (!follower.paused) follower.pause();
    return { currentTime: masterTime, playing: false };
  }

  if (Math.abs(drift) > COMPARE_SYNC.playSeekThreshold) {
    follower.playbackRate = 1;
    try {
      follower.currentTime = target;
    } catch {
      // Ignore seek errors while loading.
    }
  } else if (Math.abs(drift) > COMPARE_SYNC.rateAdjustThreshold) {
    const direction = drift > 0 ? -1 : 1;
    const magnitude = Math.min(
      COMPARE_SYNC.maxRateDelta,
      Math.abs(drift) * 0.15
    );
    follower.playbackRate = 1 + direction * magnitude;
  } else {
    follower.playbackRate = 1;
  }

  if (follower.paused && follower.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    void follower.play().catch(() => undefined);
  }

  return { currentTime: masterTime, playing: true };
}
