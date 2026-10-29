function parseMinutes(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return hour * 60 + minute;
}

export function normalizeQuietOffice(value = {}) {
  return {
    enabled: value.enabled === true,
    start: /^\d{2}:\d{2}$/.test(String(value.start || '')) ? value.start : '09:30',
    end: /^\d{2}:\d{2}$/.test(String(value.end || '')) ? value.end : '11:30'
  };
}

export function isQuietOfficeActive(config, date = new Date()) {
  const normalized = normalizeQuietOffice(config);
  if (!normalized.enabled) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value) || 0;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value) || 0;
  const nowMinutes = hour * 60 + minute;
  const start = parseMinutes(normalized.start, 570);
  const end = parseMinutes(normalized.end, 690);
  if (start === end) return true;
  return start < end
    ? nowMinutes >= start && nowMinutes < end
    : nowMinutes >= start || nowMinutes < end;
}

export function quietRuntimeSettings(settings, active) {
  if (!active) return {
    muted: settings.muted,
    effects: settings.effects,
    powerSave: settings.powerSave,
    roamingSpeed: settings.roamingSpeed,
    quietMode: false
  };
  return {
    muted: true,
    effects: Math.min(Number(settings.effects) || 0, 0.18),
    powerSave: true,
    roamingSpeed: Math.max(0.3, (Number(settings.roamingSpeed) || 1) * 0.55),
    quietMode: true
  };
}
