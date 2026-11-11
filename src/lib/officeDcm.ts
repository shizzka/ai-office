export interface OfficeDcmSignal {
  bugCount: number | null;
  bugTitle: string | null;
  regression: { status: 'pass' | 'fail' | 'unknown'; timestamp: string | null; fresh: boolean; recordId?: string | null; green?: boolean; new?: boolean };
}

/** Only public, validated bridge fields cross this API boundary. */
export function publicDcm(value: unknown, now = Date.now()): OfficeDcmSignal {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const raw = data.regression && typeof data.regression === 'object' ? data.regression as Record<string, unknown> : {};
  const status = raw.status === 'pass' || raw.status === 'fail' ? raw.status : 'unknown';
  const timestamp = typeof raw.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(raw.timestamp) && Number.isFinite(Date.parse(raw.timestamp)) ? raw.timestamp : null;
  const age = timestamp ? now - Date.parse(timestamp) : Infinity;
  const title = typeof data.bugTitle === 'string' && /^🐞 B\d+: .+$/u.test(data.bugTitle) && data.bugTitle.length <= 260 && !/[\x00-\x1f<>`\[\]{}@/\\]|https?:|www\.|(?:\d[\s()+-]*){7,}/i.test(data.bugTitle) ? data.bugTitle : null;
  return {
    bugCount: typeof data.bugCount === 'number' && Number.isSafeInteger(data.bugCount) && data.bugCount >= 0 ? data.bugCount : null,
    bugTitle: title,
    regression: { status, timestamp, fresh: status !== 'unknown' && age >= 0 && age <= 30 * 60 * 1000,
      ...(typeof raw.recordId === 'string' && /^[a-f0-9]{24}$/.test(raw.recordId) ? {recordId:raw.recordId,green:raw.green===true,new:raw.new===true} : {}),
    },
  };
}
