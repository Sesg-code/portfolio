const track = document.querySelector('#sound-track');
const engine = document.querySelector('#sound-engine');
const panel = document.querySelector('#sound-panel');
const toggle = document.querySelector('#sound-toggle');
const options = document.querySelector('#sound-options');
const status = document.querySelector('#sound-status');
const picker = document.querySelector('#sound-file');

const engineStartAt = .24;
export const engineLightAt = 1.02 - engineStartAt;
export const engineFadeAt = 1.75 - engineStartAt;
export const ignitionDuration = 3.5 - engineStartAt;
const musicGain = .15;
const duckedGain = .055;
const engineGain = .34;

let context;
let channels;
let objectURL;
let pauseTimer;
let enginePauseTimer;
let duckTimer;
let enabled = false;
let muted = false;
let tuned = false;
let ducking = false;

function activate() {
  enabled = true;
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return;
  try {
    if (!context) {
      context = new AudioEngine();
      const music = context.createGain();
      const motor = context.createGain();
      music.gain.value = 0;
      motor.gain.value = engineGain;
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2650;
      lowpass.Q.value = .65;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -19;
      limiter.knee.value = 12;
      limiter.ratio.value = 4;
      limiter.attack.value = .008;
      limiter.release.value = .22;
      context.createMediaElementSource(track).connect(music).connect(limiter);
      context.createMediaElementSource(engine).connect(lowpass).connect(motor).connect(limiter);
      limiter.connect(context.destination);
      channels = { music, motor };
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  } catch {
    channels = null;
  }
}

function fade(parameter, target, time) {
  const at = context.currentTime;
  if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(at);
  else {
    const value = parameter.value;
    parameter.cancelScheduledValues(at);
    parameter.setValueAtTime(value, at);
  }
  parameter.setTargetAtTime(target, at, time);
}

function updateButton() {
  const active = enabled && !muted;
  toggle.setAttribute('aria-pressed', String(active));
  toggle.textContent = active ? '♫ Звук включён' : '♫ Включить звук';
}

function updateTrack(immediate = false, fadeTime = .19) {
  clearTimeout(pauseTimer);
  const audible = enabled && !muted && tuned && !document.hidden;
  const level = audible ? (ducking ? duckedGain : musicGain) : 0;
  if (channels) fade(channels.music.gain, level, immediate ? .04 : fadeTime);
  else track.volume = level;

  if (audible) {
    if (track.paused) track.play().catch((error) => {
      if (error.name !== 'AbortError') status.textContent = 'Трек не удалось запустить.';
    });
  } else if (!track.paused) {
    pauseTimer = setTimeout(() => track.pause(), immediate ? 165 : 820);
  }
}

function stopEngine() {
  clearTimeout(enginePauseTimer);
  if (engine.paused) return;
  if (channels) {
    fade(channels.motor.gain, 0, .035);
    enginePauseTimer = setTimeout(() => engine.pause(), 145);
  } else {
    engine.pause();
  }
}

function startEngine() {
  clearTimeout(enginePauseTimer);
  if (channels) fade(channels.motor.gain, engineGain, .014);
  else engine.volume = engineGain;
  engine.currentTime = engineStartAt;
  engine.play().catch((error) => {
    if (error.name !== 'AbortError') status.textContent = 'Запись двигателя не удалось запустить.';
  });
}

export function setTunedSound(active) {
  tuned = active;
  clearTimeout(duckTimer);
  ducking = active && !muted;
  if (ducking) {
    activate();
    startEngine();
    duckTimer = setTimeout(() => {
      ducking = false;
      updateTrack(false, (ignitionDuration - engineFadeAt) / 4.5);
    }, engineFadeAt * 1000);
  } else {
    stopEngine();
  }
  updateButton();
  updateTrack();
}

toggle.addEventListener('click', () => {
  muted = enabled && !muted;
  if (muted) stopEngine();
  else activate();
  updateButton();
  updateTrack(muted);
});
options.addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  options.setAttribute('aria-expanded', String(!panel.hidden));
});
document.querySelector('#sound-file-button').addEventListener('click', () => picker.click());
picker.addEventListener('change', () => {
  const file = picker.files[0];
  if (!file) return;
  track.pause();
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = URL.createObjectURL(file);
  track.src = objectURL;
  status.textContent = file.name;
  updateTrack();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopEngine();
  updateTrack(document.hidden);
});
addEventListener('pagehide', (event) => {
  clearTimeout(pauseTimer);
  clearTimeout(enginePauseTimer);
  clearTimeout(duckTimer);
  ducking = false;
  track.pause();
  engine.pause();
  if (event.persisted) return;
  if (objectURL) URL.revokeObjectURL(objectURL);
  context?.close().catch(() => {});
});
