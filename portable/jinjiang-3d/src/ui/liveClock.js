// 实时时钟：左上角显示成都当地时间（UTC+8，无夏令时），并提供大气系统使用的“当前小时”。
// 不依赖访问者所在时区，海外或时区不同的设备看到的也是成都此刻的天色。

const CN_OFFSET_MS = 8 * 3600 * 1000;
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n) => String(n).padStart(2, '0');

export function chengduNow(ms = Date.now()) {
  const d = new Date(ms + CN_OFFSET_MS);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    wd: WEEK[d.getUTCDay()],
    h,
    m,
    s,
    hour: h + m / 60 + s / 3600,
  };
}

export function phaseName(hour) {
  if (hour < 5) return '深夜';
  if (hour < 7) return '清晨';
  if (hour < 11) return '上午';
  if (hour < 14) return '正午';
  if (hour < 17.5) return '午后';
  if (hour < 19.5) return '黄昏';
  return '夜晚';
}

export class LiveClock {
  constructor({ onResume } = {}) {
    this.root = document.getElementById('live-clock');
    this.timeEl = document.getElementById('lc-time');
    this.dateEl = document.getElementById('lc-date');
    this.stateEl = document.getElementById('lc-state');
    this.btn = document.getElementById('lc-resume');
    this.live = false;
    this._sec = -1;
    this.btn.onclick = () => onResume?.();
  }
  setLive(on) {
    this.live = on;
    this.root.classList.toggle('is-live', on);
    this.stateEl.textContent = on ? '实时' : '预设时间';
    this.btn.hidden = on;
    this._sec = -1;
  }
  // 每帧调用；仅在秒数变化时写入 DOM。
  // 实时状态下显示成都此刻；离开实时后显示当前画面采用的预设小时，避免时钟与天色矛盾。
  tick(sceneHour) {
    const n = chengduNow();
    if (this.live) {
      if (n.s === this._sec) return;
      this._sec = n.s;
      this.timeEl.textContent = `${pad(n.h)}:${pad(n.m)}:${pad(n.s)}`;
      this.dateEl.textContent = `${n.y}.${pad(n.mo)}.${pad(n.day)} 周${n.wd} · ${phaseName(n.hour)}`;
      return;
    }
    const h = Math.floor(sceneHour);
    const m = Math.floor((sceneHour - h) * 60);
    const text = `${pad(h)}:${pad(m)}`;
    if (this.timeEl.textContent !== text) {
      this.timeEl.textContent = text;
      this.dateEl.textContent = `成都此刻 ${pad(n.h)}:${pad(n.m)} · 预设画面 ${phaseName(sceneHour)}`;
    }
  }
}
