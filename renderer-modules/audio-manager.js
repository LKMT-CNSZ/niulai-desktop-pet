export class AudioManager {
  constructor(assetUrl) {
    this.bullish = new Audio(assetUrl('audio/niulai.mp3'));
    this.bearish = new Audio(assetUrl('audio/mama.mp3'));
    this.lastDirection = null;
    this.lastStatus = 'idle';
    this.lastError = '';
    this.playCount = 0;
    this.bullish.preload = 'auto';
    this.bearish.preload = 'auto';
    for (const audio of [this.bullish, this.bearish]) {
      audio.addEventListener('playing', () => {
        this.lastStatus = 'playing';
        this.lastError = '';
      });
      audio.addEventListener('ended', () => {
        this.lastStatus = 'ended';
      });
      audio.addEventListener('error', () => {
        this.lastStatus = 'error';
        this.lastError = audio.error?.message || `媒体错误 ${audio.error?.code || ''}`.trim();
      });
    }
  }

  setVolume(volume, muted = false) {
    const value = muted ? 0 : volume;
    this.bullish.volume = value;
    this.bearish.volume = value;
  }

  play(direction) {
    const audio = direction === 'BULLISH' ? this.bullish : this.bearish;
    const other = direction === 'BULLISH' ? this.bearish : this.bullish;
    if (!audio) return;
    other.pause();
    other.currentTime = 0;
    audio.pause();
    audio.currentTime = 0;
    this.lastDirection = direction;
    this.lastStatus = 'requested';
    this.lastError = '';
    this.playCount += 1;
    audio.play().catch((error) => {
      this.lastStatus = 'error';
      this.lastError = String(error?.message || error || '音频播放失败');
    });
  }

  snapshot() {
    const describe = (audio) => ({
      readyState: audio.readyState,
      networkState: audio.networkState,
      paused: audio.paused,
      currentTime: Number(audio.currentTime.toFixed(3)),
      duration: Number.isFinite(audio.duration) ? Number(audio.duration.toFixed(3)) : null
    });
    return {
      lastDirection: this.lastDirection,
      lastStatus: this.lastStatus,
      lastError: this.lastError,
      playCount: this.playCount,
      bullish: describe(this.bullish),
      bearish: describe(this.bearish)
    };
  }
}
