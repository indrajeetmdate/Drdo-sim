/**
 * Custom CSV Ingestion, Parsing, and Validation Engine
 * Supports active power vs. time-in-hours (0–24h), HH:MM clock times, and full timestamps,
 * with W/kW unit auto-detection, column overrides, and optional diurnal 15-min resampling.
 */

import { TimeSeriesInputStep } from '../types/microgrid';

export type PowerUnit = 'auto' | 'kw' | 'w';
export type ResampleMode = 'auto' | 'native' | '15min';
export type InterpMethod = 'linear' | 'step';

export interface CsvColumnMapping {
  timestampCol: string;
  loadCol: string;
  irradianceCol: string;
  tempCol: string;
  windCol: string;
}

export interface CsvParseOptions {
  userMapping?: Partial<CsvColumnMapping>;
  powerUnit?: PowerUnit;
  resampleMode?: ResampleMode;
  interpMethod?: InterpMethod;
  scaleMultiplier?: number;
}

export interface CsvProfileStats {
  minLoadKw: number;
  maxLoadKw: number;
  avgLoadKw: number;
  dailyEnergyKwh: number;
  durationHours: number;
}

export interface CsvParseResult {
  success: boolean;
  error?: string;
  headers: string[];
  rawRowsCount: number;
  detectedDelimiter: string;
  detectedDtHours: number;
  detectedPowerUnit: 'kw' | 'w';
  detectedTimeFormat: 'hours' | 'clock' | 'datetime' | 'index';
  isRegularGrid: boolean;
  wasResampled: boolean;
  mapping: CsvColumnMapping;
  stats: CsvProfileStats;
  previewRows: Record<string, string>[];
  parsedSteps: TimeSeriesInputStep[];
  warnings: string[];
}

interface RawParsedPoint {
  rawRowIdx: number;
  rawTimeStr: string;
  continuousHour: number;
  hourOfDay: number;
  day: number;
  p_load_kw: number;
  g_irr_wm2?: number;
  t_amb_c?: number;
  v_wind_ms?: number;
}

/** Synthesize clear-sky diurnal irradiance & weather when load-only CSV is imported */
export function synthesizeDiurnalWeather(hourOfDay: number): {
  g_irr_wm2: number;
  t_amb_c: number;
  v_wind_ms: number;
} {
  const h = ((hourOfDay % 24) + 24) % 24;
  const sunrise = 6.25;
  const sunset = 18.75;
  let g_irr_wm2 = 0.0;
  if (h >= sunrise && h <= sunset) {
    const dayFrac = (h - sunrise) / (sunset - sunrise);
    g_irr_wm2 = Math.max(0.0, 920.0 * Math.pow(Math.sin(Math.PI * dayFrac), 1.3));
  }
  const t_amb_c = 20.0 + 5.0 * Math.sin(((h - 8.5) * Math.PI) / 12.0);
  const v_wind_ms = Math.max(0.5, 2.5 + 1.2 * Math.sin((Math.PI * h) / 12.0));
  return { g_irr_wm2, t_amb_c, v_wind_ms };
}

function formatDayHourTimestamp(continuousHour: number, explicit24End: boolean = false): string {
  if (explicit24End && Math.abs(continuousHour - 24.0) < 1e-6) {
    return 'Day1 24:00';
  }
  const d = Math.floor(Math.max(0, continuousHour) / 24.0 + 1e-9) + 1;
  const hMod = ((continuousHour % 24) + 24) % 24;
  let hh = Math.floor(hMod);
  let mm = Math.round((hMod - hh) * 60);
  if (mm === 60) {
    hh = (hh + 1) % 24;
    mm = 0;
  }
  return `Day${d} ${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

function detectPowerUnitFromHeader(header: string): 'kw' | 'w' {
  const h = header.toLowerCase().trim();
  if (h.includes('kw') || h.includes('mw')) return 'kw';
  if (/(?:^|[\s_([/])w(?:att(?:s)?)?(?:[\])]|$)/i.test(h) || h.includes('watt')) {
    return 'w';
  }
  return 'kw';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

function parseTimeValue(
  raw: string,
  baseTimestampMs: number | null
): {
  kind: 'hours' | 'clock' | 'datetime' | 'invalid';
  hoursValue: number;
  dateMs?: number;
  hourOfDay?: number;
  dayNum?: number;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'invalid', hoursValue: NaN };

  // 1. Numeric hours in a day (supports "0", "0.25", "1", "13.5", "24", "12h", "6.5 hr")
  const numericMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)?$/i);
  if (numericMatch) {
    const val = parseFloat(numericMatch[1]);
    if (!isNaN(val) && isFinite(val)) {
      return { kind: 'hours', hoursValue: val };
    }
  }

  // 2. Clock string HH:MM or HH:MM:SS (e.g., "00:00", "14:30", "24:00")
  const clockMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clockMatch) {
    const hh = parseInt(clockMatch[1], 10);
    const mm = parseInt(clockMatch[2], 10);
    const ss = clockMatch[3] ? parseInt(clockMatch[3], 10) : 0;
    if (hh >= 0 && hh <= 24 && mm >= 0 && mm < 60 && ss >= 0 && ss < 60) {
      const hVal = hh + mm / 60.0 + ss / 3600.0;
      return { kind: 'clock', hoursValue: hVal };
    }
  }

  // 3. Full Date/DateTime timestamp (must contain separator like -, /, T, space, or month name)
  if (/[-\/T\s]/.test(trimmed) || /[a-zA-Z]{3}/.test(trimmed)) {
    const parsedDate = new Date(trimmed);
    if (!isNaN(parsedDate.getTime())) {
      const ms = parsedDate.getTime();
      const base = baseTimestampMs ?? ms;
      const elapsedHours = (ms - base) / (3600 * 1000);
      const hourOfDay =
        parsedDate.getHours() + parsedDate.getMinutes() / 60.0 + parsedDate.getSeconds() / 3600.0;
      const dayNum = Math.floor(Math.max(0, elapsedHours) / 24.0 + 1e-9) + 1;
      return {
        kind: 'datetime',
        hoursValue: elapsedHours,
        dateMs: ms,
        hourOfDay,
        dayNum,
      };
    }
  }

  return { kind: 'invalid', hoursValue: NaN };
}

function emptyFailure(error: string, headers: string[] = [], rawRowsCount = 0, delimiter = ','): CsvParseResult {
  return {
    success: false,
    error,
    headers,
    rawRowsCount,
    detectedDelimiter: delimiter,
    detectedDtHours: 0.25,
    detectedPowerUnit: 'kw',
    detectedTimeFormat: 'hours',
    isRegularGrid: false,
    wasResampled: false,
    mapping: { timestampCol: '', loadCol: '', irradianceCol: '', tempCol: '', windCol: '' },
    stats: { minLoadKw: 0, maxLoadKw: 0, avgLoadKw: 0, dailyEnergyKwh: 0, durationHours: 0 },
    previewRows: [],
    parsedSteps: [],
    warnings: [],
  };
}

function normalizeOptions(
  arg?: Partial<CsvColumnMapping> | CsvParseOptions
): CsvParseOptions {
  if (!arg) return {};
  if (
    'userMapping' in arg ||
    'powerUnit' in arg ||
    'resampleMode' in arg ||
    'interpMethod' in arg ||
    'scaleMultiplier' in arg
  ) {
    return arg as CsvParseOptions;
  }
  return { userMapping: arg as Partial<CsvColumnMapping> };
}

export function parseCsvFile(
  csvText: string,
  mappingOrOptions?: Partial<CsvColumnMapping> | CsvParseOptions
): CsvParseResult {
  const opts = normalizeOptions(mappingOrOptions);
  const userMapping = opts.userMapping;
  const warnings: string[] = [];

  if (!csvText || csvText.trim().length === 0) {
    return emptyFailure('CSV file is completely empty.');
  }

  const normalizedText = csvText.replace(/^\uFEFF/, '');
  if (/[\x00-\x08\x0E-\x1F]/.test(normalizedText.slice(0, 512)) || normalizedText.startsWith('PK\x03\x04')) {
    return emptyFailure('Selected file appears to be binary (e.g. Excel .xlsx/.xls). Please export or save as plain UTF-8 .csv.');
  }

  const lines = normalizedText.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#');
  });

  if (lines.length < 2) {
    return emptyFailure('CSV must contain at least a header (or 2 data rows for time vs. power).');
  }

  const sampleLine = lines[0];
  let delimiter = ',';
  const semiCount = (sampleLine.match(/;/g) || []).length;
  const commaCount = (sampleLine.match(/,/g) || []).length;
  const tabCount = (sampleLine.match(/\t/g) || []).length;
  const hasEuroSemiDecimals = semiCount > 0 && /(?:^|;)\s*-?\d+,\d+(?:\s*;|\s*$)/.test(sampleLine);
  if (tabCount > commaCount && tabCount >= semiCount) {
    delimiter = '\t';
  } else if (semiCount > 0 && (semiCount > commaCount || hasEuroSemiDecimals)) {
    delimiter = ';';
  }

  const rawFirstRowCells = splitCsvLine(lines[0], delimiter);
  // Drop trailing empty cell caused by trailing commas like "0,0.42,"
  const firstRowCells = [...rawFirstRowCells];
  while (firstRowCells.length > 2 && firstRowCells[firstRowCells.length - 1] === '') {
    firstRowCells.pop();
  }
  const normalizeNumStr = (s: string) =>
    delimiter === ';' && !s.includes('.') ? s.replace(',', '.') : s;
  const isHeaderlessNumeric =
    firstRowCells.length >= 2 &&
    firstRowCells.every((c) => /^-?\d+(?:\.\d+)?$/.test(normalizeNumStr(c.trim())));

  let headers: string[];
  let dataStartLine = 1;
  if (isHeaderlessNumeric) {
    headers = firstRowCells.map((_, idx) =>
      idx === 0 ? 'time_h' : idx === 1 ? 'active_power_kw' : `col_${idx + 1}`
    );
    dataStartLine = 0;
    warnings.push('No header row detected — assumed columns [time_h, active_power_kw].');
  } else {
    headers = firstRowCells.map((h, idx) => h.toLowerCase() || `col_${idx + 1}`);
  }

  const findCol = (patterns: string[], exactFallback: string[] = []): string => {
    for (const pat of patterns) {
      const match = headers.find((h) => h.includes(pat));
      if (match) return match;
    }
    for (const ex of exactFallback) {
      const match = headers.find((h) => h === ex);
      if (match) return match;
    }
    return '';
  };

  const detectedTimeCol =
    userMapping?.timestampCol ||
    findCol(
      ['time_h', 'time_hr', 'time(h)', 'time [h]', 'hour', 'hr', 'timestamp', 'datetime', 'time', 'date', 'ts'],
      ['t', 'h']
    );

  const detectedLoadCol =
    userMapping?.loadCol ||
    findCol(
      ['active_power', 'active power', 'activepower', 'p_active', 'p_load', 'load_kw', 'load_w', 'power_kw', 'power_w', 'p_kw', 'p_w', 'load', 'power', 'demand', 'kw', 'watt'],
      ['p']
    );

  const mapping: CsvColumnMapping = {
    timestampCol: detectedTimeCol,
    loadCol: detectedLoadCol,
    irradianceCol:
      userMapping?.irradianceCol ||
      findCol(['irr', 'ghi', 'solar', 'rad', 'w/m', 'wm2', 'g_']),
    tempCol:
      userMapping?.tempCol ||
      findCol(['t_amb', 'tamb', 'temp', 'celsius', 'deg_c']),
    windCol:
      userMapping?.windCol ||
      findCol(['wind', 'v_wind', 'speed', 'm/s']),
  };

  if (!mapping.timestampCol && headers.length >= 2) {
    const candidateIdx = headers[0] === mapping.loadCol ? 1 : 0;
    mapping.timestampCol = headers[candidateIdx];
    warnings.push(`Time column not explicitly named — using "${headers[candidateIdx]}".`);
  }

  if (!mapping.loadCol) {
    if (headers.length >= 2) {
      const fallbackIdx = headers[0] === mapping.timestampCol ? 1 : 0;
      mapping.loadCol = headers[fallbackIdx];
      warnings.push(`Power column auto-selected as "${headers[fallbackIdx]}".`);
    } else {
      return emptyFailure(
        `Could not identify an Active Power column. Available columns: [${headers.join(', ')}]`,
        headers,
        lines.length - dataStartLine,
        delimiter
      );
    }
  }

  const headerInferredUnit = detectPowerUnitFromHeader(mapping.loadCol);
  const activeUnit: 'kw' | 'w' =
    opts.powerUnit && opts.powerUnit !== 'auto' ? opts.powerUnit : headerInferredUnit;
  const unitDivisor = activeUnit === 'w' ? 1000.0 : 1.0;
  const scaleMult = opts.scaleMultiplier && opts.scaleMultiplier > 0 ? opts.scaleMultiplier : 1.0;

  const loadIdx = headers.indexOf(mapping.loadCol);
  const timeIdx = mapping.timestampCol ? headers.indexOf(mapping.timestampCol) : -1;
  const irrIdx = mapping.irradianceCol ? headers.indexOf(mapping.irradianceCol) : -1;
  const tempIdx = mapping.tempCol ? headers.indexOf(mapping.tempCol) : -1;
  const windIdx = mapping.windCol ? headers.indexOf(mapping.windCol) : -1;

  const rawPoints: RawParsedPoint[] = [];
  const previewRows: Record<string, string>[] = [];

  let baseDateMs: number | null = null;
  let detectedTimeFormat: 'hours' | 'clock' | 'datetime' | 'index' = 'index';
  const formatCounts: Record<string, number> = { hours: 0, clock: 0, datetime: 0, index: 0 };

  for (let i = dataStartLine; i < lines.length; i++) {
    const rawCols = splitCsvLine(lines[i], delimiter);
    if (rawCols.length === 0 || (rawCols.length === 1 && !rawCols[0])) continue;

    if (previewRows.length < 10) {
      const pRow: Record<string, string> = {};
      headers.forEach((h, idx) => {
        pRow[h] = rawCols[idx] ?? '';
      });
      previewRows.push(pRow);
    }

    const rowIdx = rawPoints.length;
    const rawLoadVal = parseFloat(normalizeNumStr(rawCols[loadIdx] ?? ''));
    if (isNaN(rawLoadVal)) {
      continue;
    }
    const p_load_kw = Math.max(0.0, (rawLoadVal / unitDivisor) * scaleMult);

    let continuousHour = rowIdx * 0.25;
    let hourOfDay = continuousHour % 24;
    let day = Math.floor(continuousHour / 24) + 1;
    let rawTimeStr = `${continuousHour.toFixed(2)}h`;

    if (timeIdx !== -1 && rawCols[timeIdx] !== undefined && rawCols[timeIdx] !== '') {
      rawTimeStr = rawCols[timeIdx];
      const parsedTime = parseTimeValue(normalizeNumStr(rawTimeStr), baseDateMs);
      if (parsedTime.kind === 'hours') {
        continuousHour = parsedTime.hoursValue;
        hourOfDay = ((continuousHour % 24) + 24) % 24;
        day = Math.floor(Math.max(0, continuousHour) / 24.0 + 1e-9) + 1;
        formatCounts.hours++;
      } else if (parsedTime.kind === 'clock') {
        continuousHour = parsedTime.hoursValue;
        if (rawPoints.length > 0) {
          const prevC = rawPoints[rawPoints.length - 1].continuousHour;
          while (continuousHour < prevC - 12.0) {
            continuousHour += 24.0;
          }
        }
        hourOfDay = ((continuousHour % 24) + 24) % 24;
        day = Math.floor(Math.max(0, continuousHour) / 24.0 + 1e-9) + 1;
        formatCounts.clock++;
      } else if (parsedTime.kind === 'datetime' && parsedTime.dateMs !== undefined) {
        if (baseDateMs === null) {
          baseDateMs = parsedTime.dateMs;
          continuousHour = 0;
        } else {
          continuousHour = (parsedTime.dateMs - baseDateMs) / (3600 * 1000);
        }
        hourOfDay = parsedTime.hourOfDay ?? 0;
        day = parsedTime.dayNum ?? 1;
        formatCounts.datetime++;
      } else {
        formatCounts.index++;
      }
    } else {
      formatCounts.index++;
    }

    const pt: RawParsedPoint = {
      rawRowIdx: rowIdx,
      rawTimeStr,
      continuousHour,
      hourOfDay,
      day,
      p_load_kw,
    };

    if (irrIdx !== -1 && rawCols[irrIdx] !== undefined && rawCols[irrIdx] !== '') {
      const irrVal = parseFloat(rawCols[irrIdx]);
      if (!isNaN(irrVal)) pt.g_irr_wm2 = Math.max(0.0, irrVal);
    }
    if (tempIdx !== -1 && rawCols[tempIdx] !== undefined && rawCols[tempIdx] !== '') {
      const tVal = parseFloat(rawCols[tempIdx]);
      if (!isNaN(tVal)) pt.t_amb_c = tVal;
    }
    if (windIdx !== -1 && rawCols[windIdx] !== undefined && rawCols[windIdx] !== '') {
      const wVal = parseFloat(rawCols[windIdx]);
      if (!isNaN(wVal)) pt.v_wind_ms = Math.max(0.0, wVal);
    }

    rawPoints.push(pt);
  }

  if (rawPoints.length === 0) {
    return emptyFailure(
      'No valid numeric data rows could be parsed from the CSV file.',
      headers,
      lines.length - dataStartLine,
      delimiter
    );
  }

  const fmtEntries = Object.entries(formatCounts) as Array<['hours' | 'clock' | 'datetime' | 'index', number]>;
  fmtEntries.sort((a, b) => b[1] - a[1]);
  detectedTimeFormat = fmtEntries[0][0];

  let sortedNeeded = false;
  for (let i = 1; i < rawPoints.length; i++) {
    if (rawPoints[i].continuousHour < rawPoints[i - 1].continuousHour - 1e-6) {
      sortedNeeded = true;
      break;
    }
  }
  if (sortedNeeded) {
    rawPoints.sort((a, b) => a.continuousHour - b.continuousHour);
    warnings.push('Rows were sorted in chronological order by time.');
  }

  const deltas: number[] = [];
  for (let i = 1; i < rawPoints.length; i++) {
    const dh = rawPoints[i].continuousHour - rawPoints[i - 1].continuousHour;
    if (dh > 1e-6) deltas.push(Math.round(dh * 10000) / 10000);
  }

  let medianDt = 0.25;
  let isRegularGrid = true;
  if (deltas.length > 0) {
    const sortedD = [...deltas].sort((a, b) => a - b);
    medianDt = sortedD[Math.floor(sortedD.length / 2)];
    const minDt = sortedD[0];
    const maxDt = sortedD[sortedD.length - 1];
    isRegularGrid = maxDt - minDt < 1e-3;
  } else if (rawPoints.length === 1) {
    medianDt = 24.0;
    isRegularGrid = false;
  }

  const firstH = rawPoints[0].continuousHour;
  const lastH = rawPoints[rawPoints.length - 1].continuousHour;
  const hasClosing24Boundary =
    (detectedTimeFormat === 'hours' || detectedTimeFormat === 'clock') &&
    Math.abs(firstH) < 1e-6 &&
    Math.abs(lastH - 24.0) < 1e-6 &&
    rawPoints.length >= 2;

  const resampleMode = opts.resampleMode || 'auto';
  const interpMethod = opts.interpMethod || 'linear';

  const shouldResample =
    resampleMode === '15min' ||
    (resampleMode === 'auto' &&
      (!isRegularGrid || medianDt > 1.0 + 1e-6 || rawPoints.length < 12 || hasClosing24Boundary));

  let parsedSteps: TimeSeriesInputStep[] = [];
  let finalDtHours = medianDt;
  let wasResampled = false;

  if (shouldResample) {
    wasResampled = true;
    finalDtHours = 0.25;
    const spanHours = lastH - firstH;
    const totalDays =
      detectedTimeFormat === 'hours' || detectedTimeFormat === 'clock'
        ? Math.max(1, Math.round(Math.max(24, spanHours) / 24.0))
        : Math.max(1, Math.round(Math.max(24, rawPoints.length * medianDt) / 24.0));
    const totalTargetSteps = totalDays * 96;
    const startBaseH =
      detectedTimeFormat === 'hours' || detectedTimeFormat === 'clock'
        ? firstH >= 1.0 - 1e-6 && firstH <= 1.0 + 1e-6 && lastH >= 23.0
          ? 0.0
          : Math.floor(firstH / 24.0) * 24.0
        : firstH;

    const sampleAtHour = (qH: number): {
      p_load_kw: number;
      g_irr_wm2: number;
      t_amb_c: number;
      v_wind_ms: number;
    } => {
      const synth = synthesizeDiurnalWeather(qH);
      if (rawPoints.length === 1) {
        return {
          p_load_kw: rawPoints[0].p_load_kw,
          g_irr_wm2: rawPoints[0].g_irr_wm2 ?? synth.g_irr_wm2,
          t_amb_c: rawPoints[0].t_amb_c ?? synth.t_amb_c,
          v_wind_ms: rawPoints[0].v_wind_ms ?? synth.v_wind_ms,
        };
      }

      if (qH <= rawPoints[0].continuousHour) {
        const p = rawPoints[0];
        return {
          p_load_kw: p.p_load_kw,
          g_irr_wm2: p.g_irr_wm2 ?? synth.g_irr_wm2,
          t_amb_c: p.t_amb_c ?? synth.t_amb_c,
          v_wind_ms: p.v_wind_ms ?? synth.v_wind_ms,
        };
      }

      const lastPt = rawPoints[rawPoints.length - 1];
      if (qH >= lastPt.continuousHour) {
        const periodEnd = startBaseH + 24.0 * totalDays;
        if (
          interpMethod === 'linear' &&
          rawPoints[0].continuousHour <= startBaseH + 1.0 &&
          periodEnd - lastPt.continuousHour <= Math.max(medianDt * 1.5, 1.5) &&
          periodEnd > lastPt.continuousHour + 1e-6
        ) {
          const alpha = (qH - lastPt.continuousHour) / (periodEnd - lastPt.continuousHour);
          const pNext = rawPoints[0];
          return {
            p_load_kw: lastPt.p_load_kw + alpha * (pNext.p_load_kw - lastPt.p_load_kw),
            g_irr_wm2:
              lastPt.g_irr_wm2 !== undefined && pNext.g_irr_wm2 !== undefined
                ? lastPt.g_irr_wm2 + alpha * (pNext.g_irr_wm2 - lastPt.g_irr_wm2)
                : synth.g_irr_wm2,
            t_amb_c:
              lastPt.t_amb_c !== undefined && pNext.t_amb_c !== undefined
                ? lastPt.t_amb_c + alpha * (pNext.t_amb_c - lastPt.t_amb_c)
                : synth.t_amb_c,
            v_wind_ms:
              lastPt.v_wind_ms !== undefined && pNext.v_wind_ms !== undefined
                ? lastPt.v_wind_ms + alpha * (pNext.v_wind_ms - lastPt.v_wind_ms)
                : synth.v_wind_ms,
          };
        }
        return {
          p_load_kw: lastPt.p_load_kw,
          g_irr_wm2: lastPt.g_irr_wm2 ?? synth.g_irr_wm2,
          t_amb_c: lastPt.t_amb_c ?? synth.t_amb_c,
          v_wind_ms: lastPt.v_wind_ms ?? synth.v_wind_ms,
        };
      }

      let lo = rawPoints.length - 2;
      for (let k = 0; k < rawPoints.length - 1; k++) {
        if (qH >= rawPoints[k].continuousHour - 1e-9 && qH < rawPoints[k + 1].continuousHour - 1e-9) {
          lo = k;
          break;
        }
      }
      const p0 = rawPoints[lo];
      const p1 = rawPoints[lo + 1];
      if (interpMethod === 'step' || p1.continuousHour <= p0.continuousHour + 1e-9) {
        return {
          p_load_kw: p0.p_load_kw,
          g_irr_wm2: p0.g_irr_wm2 ?? synth.g_irr_wm2,
          t_amb_c: p0.t_amb_c ?? synth.t_amb_c,
          v_wind_ms: p0.v_wind_ms ?? synth.v_wind_ms,
        };
      }
      const alpha = (qH - p0.continuousHour) / (p1.continuousHour - p0.continuousHour);
      return {
        p_load_kw: p0.p_load_kw + alpha * (p1.p_load_kw - p0.p_load_kw),
        g_irr_wm2:
          p0.g_irr_wm2 !== undefined && p1.g_irr_wm2 !== undefined
            ? p0.g_irr_wm2 + alpha * (p1.g_irr_wm2 - p0.g_irr_wm2)
            : synth.g_irr_wm2,
        t_amb_c:
          p0.t_amb_c !== undefined && p1.t_amb_c !== undefined
            ? p0.t_amb_c + alpha * (p1.t_amb_c - p0.t_amb_c)
            : synth.t_amb_c,
        v_wind_ms:
          p0.v_wind_ms !== undefined && p1.v_wind_ms !== undefined
            ? p0.v_wind_ms + alpha * (p1.v_wind_ms - p0.v_wind_ms)
            : synth.v_wind_ms,
      };
    };

    const startMod24 =
      detectedTimeFormat === 'datetime' ? rawPoints[0].hourOfDay : ((startBaseH % 24) + 24) % 24;

    for (let s = 0; s < totalTargetSteps; s++) {
      const qH = startBaseH + s * 0.25;
      const sample = sampleAtHour(qH);
      const hourMod24 = ((startMod24 + s * 0.25) % 24 + 24) % 24;
      const day = Math.floor((s * 0.25) / 24.0) + 1;
      const ts = formatDayHourTimestamp(day * 24 - 24 + hourMod24, false);

      parsedSteps.push({
        step: s + 1,
        timestamp: ts,
        day,
        hour: hourMod24,
        g_irr_wm2: sample.g_irr_wm2,
        t_amb_c: sample.t_amb_c,
        v_wind_ms: sample.v_wind_ms,
        p_load_kw: Math.max(0.0, sample.p_load_kw),
      });
    }

    warnings.push(
      `Resampled ${rawPoints.length} input rows (${interpMethod}) onto a uniform 15-min diurnal grid (${parsedSteps.length} steps, 24h/day).`
    );
  } else {
    const isSingleDay24End =
      rawPoints.length === 24 && Math.abs(firstH - 1.0) < 1e-6 && Math.abs(lastH - 24.0) < 1e-6;

    parsedSteps = rawPoints.map((pt, idx) => {
      const synth = synthesizeDiurnalWeather(pt.hourOfDay);
      const ts =
        detectedTimeFormat === 'datetime'
          ? pt.rawTimeStr
          : formatDayHourTimestamp(pt.continuousHour, isSingleDay24End);
      const dayVal = isSingleDay24End && Math.abs(pt.continuousHour - 24.0) < 1e-6 ? 1 : pt.day;
      return {
        step: idx + 1,
        timestamp: ts,
        day: dayVal,
        hour: pt.hourOfDay,
        g_irr_wm2: pt.g_irr_wm2 ?? synth.g_irr_wm2,
        t_amb_c: pt.t_amb_c ?? synth.t_amb_c,
        v_wind_ms: pt.v_wind_ms ?? synth.v_wind_ms,
        p_load_kw: pt.p_load_kw,
      };
    });
  }

  if (irrIdx === -1) {
    warnings.push(
      'No Solar Irradiance column detected — synthesized clear-sky diurnal irradiance G(t) for PV simulation.'
    );
  }

  let minLoadKw = Infinity;
  let maxLoadKw = 0;
  let sumLoadKw = 0;
  for (const s of parsedSteps) {
    if (s.p_load_kw < minLoadKw) minLoadKw = s.p_load_kw;
    if (s.p_load_kw > maxLoadKw) maxLoadKw = s.p_load_kw;
    sumLoadKw += s.p_load_kw;
  }
  if (!isFinite(minLoadKw)) minLoadKw = 0;
  const durationHours = parsedSteps.length * finalDtHours;
  const totalKwh = sumLoadKw * finalDtHours;
  const dailyEnergyKwh = totalKwh / (durationHours >= 23.5 ? durationHours / 24.0 : 1.0);
  const avgLoadKw = sumLoadKw / parsedSteps.length;

  if (activeUnit === 'kw' && opts.powerUnit !== 'kw' && maxLoadKw > 25.0) {
    warnings.push(
      `Peak load is ${maxLoadKw.toFixed(1)} kW (interpreted as kW). If CSV values are in Watts, switch Power Unit to [W].`
    );
  }

  return {
    success: true,
    headers,
    rawRowsCount: rawPoints.length,
    detectedDelimiter: delimiter,
    detectedDtHours: finalDtHours,
    detectedPowerUnit: activeUnit,
    detectedTimeFormat,
    isRegularGrid,
    wasResampled,
    mapping,
    stats: {
      minLoadKw,
      maxLoadKw,
      avgLoadKw,
      dailyEnergyKwh,
      durationHours,
    },
    previewRows,
    parsedSteps,
    warnings,
  };
}

/** Built-in Sample Daily Load Profile Templates (Active Power [kW/W] vs Time [hours 0..24]) */
export interface SampleCsvTemplate {
  id: string;
  label: string;
  description: string;
  csv: string;
}

export const SAMPLE_DAILY_LOAD_TEMPLATES: SampleCsvTemplate[] = [
  {
    id: 'residential-hourly',
    label: 'Residential Day (Hourly kW)',
    description: '0–23h household curve peaking at 3.57 kW around 19:00 (~22 kWh/day)',
    csv: [
      'time_h,active_power_kw',
      '0,0.42', '1,0.38', '2,0.36', '3,0.35', '4,0.37', '5,0.44',
      '6,0.68', '7,0.85', '8,0.62', '9,0.51', '10,0.48', '11,0.52',
      '12,0.55', '13,0.50', '14,0.48', '15,0.53', '16,0.92', '17,1.85',
      '18,2.95', '19,3.57', '20,3.15', '21,2.10', '22,1.15', '23,0.58',
    ].join('\n'),
  },
  {
    id: 'daytime-lab-shift',
    label: 'Daytime Industrial / Lab Shift (kW)',
    description: '08:00–17:00 heavy solar-aligned operation (~3.8 kW peak, light night)',
    csv: [
      'time_h,active_power_kw',
      '0,0.30', '1,0.28', '2,0.28', '3,0.28', '4,0.30', '5,0.35',
      '6,0.60', '7,1.25', '8,2.60', '9,3.45', '10,3.80', '11,3.75',
      '12,3.10', '13,3.65', '14,3.70', '15,3.40', '16,2.80', '17,1.45',
      '18,0.75', '19,0.55', '20,0.45', '21,0.40', '22,0.35', '23,0.32',
    ].join('\n'),
  },
  {
    id: 'benchtop-watts',
    label: '1:10 Benchtop Load (Watts vs Hours)',
    description: 'Active power in Watts (W) over 0–23h for lab benchtop HIL testing',
    csv: [
      'time_h,active_power_w',
      '0,42', '1,38', '2,36', '3,35', '4,38', '5,45',
      '6,70', '7,95', '8,110', '9,120', '10,125', '11,130',
      '12,115', '13,110', '14,105', '15,120', '16,160', '17,240',
      '18,340', '19,410', '20,360', '21,230', '22,120', '23,60',
    ].join('\n'),
  },
  {
    id: 'double-peak-ev',
    label: 'Morning + Evening EV Peak (0–24h)',
    description: 'Sparse breakpoints (0..24h) auto-interpolated onto a 15-min day grid',
    csv: [
      'hour,active_power_kw',
      '0,0.45', '5,0.40', '7,2.40', '9,1.20', '12,0.85',
      '15,0.95', '18,3.90', '20,4.20', '22,1.60', '24,0.45',
    ].join('\n'),
  },
];
