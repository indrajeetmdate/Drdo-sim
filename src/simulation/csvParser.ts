/**
 * Custom CSV Ingestion, Parsing, and Validation Engine
 * Flexible delimiter handling, smart column auto-detection, and live preview
 */

import { TimeSeriesInputStep } from '../types/microgrid';

export interface CsvColumnMapping {
  timestampCol: string;
  loadCol: string;
  irradianceCol: string;
  tempCol: string;
  windCol: string;
}

export interface CsvParseResult {
  success: boolean;
  error?: string;
  headers: string[];
  rawRowsCount: number;
  detectedDelimiter: string;
  detectedDtHours: number;
  previewRows: Record<string, string>[];
  parsedSteps: TimeSeriesInputStep[];
  warnings: string[];
}

export function parseCsvFile(
  csvText: string,
  userMapping?: Partial<CsvColumnMapping>
): CsvParseResult {
  const warnings: string[] = [];

  if (!csvText || csvText.trim().length === 0) {
    return {
      success: false,
      error: 'CSV file is completely empty.',
      headers: [],
      rawRowsCount: 0,
      detectedDelimiter: ',',
      detectedDtHours: 0.25,
      previewRows: [],
      parsedSteps: [],
      warnings: [],
    };
  }

  // Detect delimiter: check first 5 lines for commas, semicolons, or tabs
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      success: false,
      error: 'CSV must contain at least a header row and one data row.',
      headers: [],
      rawRowsCount: 0,
      detectedDelimiter: ',',
      detectedDtHours: 0.25,
      previewRows: [],
      parsedSteps: [],
      warnings: [],
    };
  }

  const sampleLine = lines[0];
  let delimiter = ',';
  if ((sampleLine.match(/;/g) || []).length > (sampleLine.match(/,/g) || []).length) {
    delimiter = ';';
  } else if ((sampleLine.match(/\t/g) || []).length > (sampleLine.match(/,/g) || []).length) {
    delimiter = '\t';
  }

  // Parse header
  const headers = sampleLine
    .split(delimiter)
    .map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  // Auto-detect column mapping
  const findCol = (patterns: string[]): string => {
    for (const pat of patterns) {
      const match = headers.find((h) => h.includes(pat));
      if (match) return match;
    }
    return '';
  };

  const mapping: CsvColumnMapping = {
    timestampCol: userMapping?.timestampCol || findCol(['time', 'date', 'datetime', 'ts']),
    loadCol: userMapping?.loadCol || findCol(['load', 'power', 'demand', 'p_load', 'kw']),
    irradianceCol: userMapping?.irradianceCol || findCol(['irr', 'ghi', 'solar', 'rad', 'w/m', 'wm2', 'g_']),
    tempCol: userMapping?.tempCol || findCol(['temp', 't_amb', 'tamb', 'celsius', 'deg_c', 't_']),
    windCol: userMapping?.windCol || findCol(['wind', 'v_wind', 'speed', 'm/s']),
  };

  if (!mapping.loadCol) {
    // If no explicit load column, check if there's any column that contains numbers
    if (headers.length > 1) {
      mapping.loadCol = headers[1];
      warnings.push(`Load column not explicitly recognized, defaulted to: "${headers[1]}"`);
    } else {
      return {
        success: false,
        error: `Could not identify a DC Load [kW] column. Available columns: [${headers.join(', ')}]`,
        headers,
        rawRowsCount: lines.length - 1,
        detectedDelimiter: delimiter,
        detectedDtHours: 0.25,
        previewRows: [],
        parsedSteps: [],
        warnings,
      };
    }
  }

  const loadIdx = headers.indexOf(mapping.loadCol);
  const timeIdx = mapping.timestampCol ? headers.indexOf(mapping.timestampCol) : -1;
  const irrIdx = mapping.irradianceCol ? headers.indexOf(mapping.irradianceCol) : -1;
  const tempIdx = mapping.tempCol ? headers.indexOf(mapping.tempCol) : -1;
  const windIdx = mapping.windCol ? headers.indexOf(mapping.windCol) : -1;

  const parsedSteps: TimeSeriesInputStep[] = [];
  const previewRows: Record<string, string>[] = [];

  let prevDate: Date | null = null;
  const deltaMinutesList: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (rawCols.length < 2) continue;

    // Build preview row object
    if (previewRows.length < 10) {
      const pRow: Record<string, string> = {};
      headers.forEach((h, idx) => {
        pRow[h] = rawCols[idx] ?? '';
      });
      previewRows.push(pRow);
    }

    const stepIndex = parsedSteps.length + 1;
    let timestampStr = `Step ${stepIndex}`;
    let day = Math.floor((stepIndex - 1) / 96) + 1;
    let hour = ((stepIndex - 1) % 96) * 0.25;

    if (timeIdx !== -1 && rawCols[timeIdx]) {
      timestampStr = rawCols[timeIdx];
      const parsedDate = new Date(timestampStr);
      if (!isNaN(parsedDate.getTime())) {
        hour = parsedDate.getHours() + parsedDate.getMinutes() / 60.0;
        day = parsedDate.getDate();
        if (prevDate) {
          const diffMin = Math.round((parsedDate.getTime() - prevDate.getTime()) / (60 * 1000));
          if (diffMin > 0 && diffMin <= 120) {
            deltaMinutesList.push(diffMin);
          }
        }
        prevDate = parsedDate;
      }
    }

    const loadVal = parseFloat(rawCols[loadIdx]);
    const p_load_kw = isNaN(loadVal) ? 0.0 : Math.max(0.0, loadVal);

    let g_irr_wm2 = 0.0;
    if (irrIdx !== -1 && rawCols[irrIdx]) {
      const irrVal = parseFloat(rawCols[irrIdx]);
      g_irr_wm2 = isNaN(irrVal) ? 0.0 : Math.max(0.0, irrVal);
    } else {
      // Synthesize diurnal clear-sky irradiance if omitted from load-only CSV
      const sunrise = 6.25;
      const sunset = 18.75;
      if (hour >= sunrise && hour <= sunset) {
        const dayFrac = (hour - sunrise) / (sunset - sunrise);
        g_irr_wm2 = Math.max(0.0, 920.0 * Math.pow(Math.sin(Math.PI * dayFrac), 1.3));
      }
    }

    let t_amb_c = 22.0;
    if (tempIdx !== -1 && rawCols[tempIdx]) {
      const tVal = parseFloat(rawCols[tempIdx]);
      if (!isNaN(tVal)) t_amb_c = tVal;
    } else {
      t_amb_c = 20.0 + 5.0 * Math.sin(((hour - 8.5) * Math.PI) / 12.0);
    }

    let v_wind_ms = 2.5;
    if (windIdx !== -1 && rawCols[windIdx]) {
      const wVal = parseFloat(rawCols[windIdx]);
      if (!isNaN(wVal)) v_wind_ms = Math.max(0.0, wVal);
    }

    parsedSteps.push({
      step: stepIndex,
      timestamp: timestampStr,
      day,
      hour,
      g_irr_wm2,
      t_amb_c,
      v_wind_ms,
      p_load_kw,
    });
  }

  // Detect time step interval
  let detectedDtHours = 0.25; // default 15 min
  if (deltaMinutesList.length > 5) {
    // Mode of intervals
    const freqMap: Record<number, number> = {};
    deltaMinutesList.forEach((m) => {
      freqMap[m] = (freqMap[m] || 0) + 1;
    });
    let maxFreq = 0;
    let modeMin = 15;
    for (const m in freqMap) {
      if (freqMap[m] > maxFreq) {
        maxFreq = freqMap[m];
        modeMin = Number(m);
      }
    }
    detectedDtHours = modeMin / 60.0;
  }

  if (irrIdx === -1) {
    warnings.push(
      'Solar Irradiance column was not found. Synthetic clear-sky solar profiles were generated for simulation.'
    );
  }

  return {
    success: true,
    headers,
    rawRowsCount: lines.length - 1,
    detectedDelimiter: delimiter,
    detectedDtHours,
    previewRows,
    parsedSteps,
    warnings,
  };
}
