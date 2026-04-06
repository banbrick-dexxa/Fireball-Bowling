type RollingNodes = {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  rumble: OscillatorNode;
  rumbleGain: GainNode;
};

export class FireballAudio {
  muted = false;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private rolling: RollingNodes | null = null;

  setMuted(nextMuted: boolean) {
    this.muted = nextMuted;

    const context = this.ensureContext();
    if (!context || !this.master) {
      return;
    }

    const now = context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.linearRampToValueAtTime(nextMuted ? 0.0001 : 0.88, now + 0.04);

    if (nextMuted) {
      this.stopRoll();
    }
  }

  playUiTap() {
    const context = this.ensureContext();
    if (!context || this.muted || !this.master) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(760, now);
    oscillator.frequency.exponentialRampToValueAtTime(460, now + 0.09);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
  }

  startRoll(power: number) {
    const context = this.ensureContext();
    if (!context || this.muted || !this.master) {
      return;
    }

    this.stopRoll();

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const rumble = context.createOscillator();
    const rumbleGain = context.createGain();
    const now = context.currentTime;

    source.buffer = this.createNoiseBuffer(1.4);
    source.loop = true;

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(210 + power * 190, now);
    filter.Q.value = 0.45;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08 + power * 0.04, now + 0.12);

    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(46 + power * 18, now);
    rumbleGain.gain.setValueAtTime(0.0001, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.012 + power * 0.008, now + 0.14);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    rumble.connect(rumbleGain);
    rumbleGain.connect(this.master);

    source.start(now);
    rumble.start(now);

    this.rolling = {
      source,
      filter,
      gain,
      rumble,
      rumbleGain,
    };
  }

  stopRoll() {
    const context = this.ensureContext();
    if (!context || !this.rolling) {
      return;
    }

    const now = context.currentTime;
    this.rolling.gain.gain.cancelScheduledValues(now);
    this.rolling.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    this.rolling.rumbleGain.gain.cancelScheduledValues(now);
    this.rolling.rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    this.rolling.source.stop(now + 0.1);
    this.rolling.rumble.stop(now + 0.08);
    this.rolling = null;
  }

  playPins(intensity: number) {
    const context = this.ensureContext();
    if (!context || this.muted || !this.master) {
      return;
    }

    const now = context.currentTime;
    const burst = context.createBufferSource();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    const clack = context.createOscillator();
    const clackGain = context.createGain();

    burst.buffer = this.createNoiseBuffer(0.32);
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(720 + intensity * 900, now);
    bandpass.Q.value = 0.8;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1 + intensity * 0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    clack.type = 'square';
    clack.frequency.setValueAtTime(380 + intensity * 240, now);
    clackGain.gain.setValueAtTime(0.0001, now);
    clackGain.gain.exponentialRampToValueAtTime(0.06 + intensity * 0.05, now + 0.005);
    clackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    burst.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(this.master);

    clack.connect(clackGain);
    clackGain.connect(this.master);

    burst.start(now);
    burst.stop(now + 0.3);
    clack.start(now);
    clack.stop(now + 0.14);
  }

  playCheer(intensity: number) {
    const context = this.ensureContext();
    if (!context || this.muted || !this.master) {
      return;
    }

    const now = context.currentTime;
    const crowd = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const horn = context.createOscillator();
    const hornGain = context.createGain();

    crowd.buffer = this.createNoiseBuffer(1.8);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(480 + intensity * 240, now);
    filter.Q.value = 0.6;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08 + intensity * 0.08, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    horn.type = 'triangle';
    horn.frequency.setValueAtTime(520, now);
    horn.frequency.linearRampToValueAtTime(700, now + 0.2);
    horn.frequency.linearRampToValueAtTime(620, now + 0.5);

    hornGain.gain.setValueAtTime(0.0001, now);
    hornGain.gain.exponentialRampToValueAtTime(0.03 + intensity * 0.04, now + 0.05);
    hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    crowd.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    horn.connect(hornGain);
    hornGain.connect(this.master);

    crowd.start(now);
    crowd.stop(now + 1.25);
    horn.start(now);
    horn.stop(now + 0.7);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (!this.context) {
      const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return null;
      }

      this.context = new AudioContextCtor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0.0001 : 0.88;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    return this.context;
  }

  private createNoiseBuffer(durationSeconds: number) {
    if (!this.context) {
      throw new Error('Audio context not ready');
    }

    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * durationSeconds));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      const fade = 1 - index / frameCount;
      channel[index] = (Math.random() * 2 - 1) * fade;
    }

    return buffer;
  }
}
