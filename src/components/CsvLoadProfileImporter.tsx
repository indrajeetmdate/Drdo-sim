import React, { useState, useMemo, useRef } from 'react';
import {
  ImportedLoadProfile,
  TimeSeriesInputStep,
} from '../types/microgrid';
import {
  CsvParseResult,
  InterpMethod,
  parseCsvFile,
  PowerUnit,
  ResampleMode,
  SAMPLE_DAILY_LOAD_TEMPLATES,
} from '../simulation/csvParser';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Layers,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

interface Props {
  variant?: 'compact' | 'full';
  systemScale: '1:1' | '1:10';
  activeProfileName?: string;
  importedProfiles?: ImportedLoadProfile[];
  onApplyProfile: (steps: TimeSeriesInputStep[], name: string, dtHours: number) => void;
  onSelectExistingProfile?: (profileId: string) => void;
}

/** Lightweight inline SVG curve preview of Active Power vs Time (hours) for Day 1 */
const LoadCurveSparkline: React.FC<{ steps: TimeSeriesInputStep[]; dtHours: number }> = ({
  steps,
  dtHours,
}) => {
  if (!steps || steps.length === 0) return null;
  // Plot up to first day (or all steps if <= 288) for clean diurnal profile inspection
  const daySteps = steps.filter((s) => s.day === 1);
  const plotSteps = daySteps.length >= 2 ? daySteps : steps.slice(0, 96);

  const w = 320;
  const h = 74;
  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxP = Math.max(0.1, ...plotSteps.map((s) => s.p_load_kw));
  const maxHourSpan = Math.max(
    1,
    plotSteps.length * dtHours >= 23 ? 24 : plotSteps[plotSteps.length - 1].hour || 24
  );

  const coords = plotSteps.map((s, idx) => {
    const tH = plotSteps.length > 1 ? idx * dtHours : s.hour;
    const x = padL + Math.min(1, tH / Math.max(1e-6, maxHourSpan)) * plotW;
    const y = padT + (1 - s.p_load_kw / maxP) * plotH;
    return { x, y };
  });

  const linePath = coords
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto bg-[#060a12] rounded border border-slate-800">
      <line x1={padL} y1={padT} x2={w - padR} y2={padT} stroke="#1e293b" strokeWidth="0.8" />
      <line x1={padL} y1={padT + plotH / 2} x2={w - padR} y2={padT + plotH / 2} stroke="#1e293b" strokeWidth="0.6" strokeDasharray="2 2" />
      <line x1={padL} y1={padT + plotH} x2={w - padR} y2={padT + plotH} stroke="#334155" strokeWidth="0.8" />
      {areaPath && <path d={areaPath} fill="#f43f5e" fillOpacity="0.18" />}
      {linePath && <path d={linePath} fill="none" stroke="#fb7185" strokeWidth="1.6" />}
      <text x={padL - 3} y={padT + 5} fill="#94a3b8" fontSize="7" fontFamily="monospace" textAnchor="end">
        {maxP >= 10 ? maxP.toFixed(1) : maxP.toFixed(2)}kW
      </text>
      <text x={padL - 3} y={padT + plotH} fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="end">
        0
      </text>
      {[0, 6, 12, 18, 24].map((hr) => {
        const x = padL + (hr / 24) * plotW;
        return (
          <text key={hr} x={x} y={h - 4} fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="middle">
            {hr}h
          </text>
        );
      })}
    </svg>
  );
};

export const CsvLoadProfileImporter: React.FC<Props> = ({
  variant = 'full',
  systemScale,
  activeProfileName,
  importedProfiles = [],
  onApplyProfile,
  onSelectExistingProfile,
}) => {
  const dropFileInputRef = useRef<HTMLInputElement>(null);
  const buttonFileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('Custom_Load_Profile.csv');
  const [readError, setReadError] = useState<string>('');
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);

  // Interactive parser overrides
  const [timeColOverride, setTimeColOverride] = useState<string>('');
  const [loadColOverride, setLoadColOverride] = useState<string>('');
  const [powerUnit, setPowerUnit] = useState<PowerUnit>('auto');
  const [resampleMode, setResampleMode] = useState<ResampleMode>('auto');
  const [interpMethod, setInterpMethod] = useState<InterpMethod>('linear');
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1.0);
  const [justApplied, setJustApplied] = useState<boolean>(false);

  // Live re-parse whenever CSV text or mapping options change
  const parseResult: CsvParseResult | null = useMemo(() => {
    if (!rawCsvText.trim()) return null;
    return parseCsvFile(rawCsvText, {
      userMapping: {
        ...(timeColOverride ? { timestampCol: timeColOverride } : {}),
        ...(loadColOverride ? { loadCol: loadColOverride } : {}),
      },
      powerUnit,
      resampleMode,
      interpMethod,
      scaleMultiplier,
    });
  }, [rawCsvText, timeColOverride, loadColOverride, powerUnit, resampleMode, interpMethod, scaleMultiplier]);

  const loadNewCsvText = (text: string, name: string, autoApplyIfValid: boolean = false) => {
    setReadError('');
    setRawCsvText(text);
    setFileName(name);
    setTimeColOverride('');
    setLoadColOverride('');
    setPowerUnit('auto');
    setResampleMode('auto');
    setScaleMultiplier(1.0);

    if (autoApplyIfValid && text.trim()) {
      const immediate = parseCsvFile(text, {
        powerUnit: 'auto',
        resampleMode: 'auto',
        interpMethod: 'linear',
        scaleMultiplier: 1.0,
      });
      if (immediate.success && immediate.parsedSteps.length > 0) {
        onApplyProfile(immediate.parsedSteps, name, immediate.detectedDtHours);
        setJustApplied(true);
        return;
      }
    }
    setJustApplied(false);
  };

  const handleFileProcess = async (file: File) => {
    setReadError('');
    try {
      if (!file) {
        throw new Error('No file was selected.');
      }

      // Universal file text loader using FileReader for rock-solid cross-browser & mobile compatibility
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const res = (ev.target?.result as string) || '';
          resolve(res);
        };
        reader.onerror = () => {
          reject(new Error(`Could not read file "${file.name}" from disk. Please check file permissions.`));
        };
        reader.readAsText(file, 'utf-8');
      });

      if (!text || text.trim().length === 0) {
        throw new Error(`The selected file "${file.name}" is completely empty (0 bytes).`);
      }

      loadNewCsvText(text, file.name, true);
    } catch (err) {
      setReadError(
        err instanceof Error ? err.message : 'Unable to read the selected CSV file.'
      );
    }
  };

  /** Direct trigger using File System Access API if available, with button input click fallback */
  const handleOpenNativePicker = async () => {
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const handles = await (window as any).showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'CSV or Text Load Profile (*.csv, *.txt)',
              accept: {
                'text/csv': ['.csv'],
                'text/plain': ['.txt', '.csv'],
                'application/vnd.ms-excel': ['.csv'],
              },
            },
          ],
        });
        if (handles && handles[0]) {
          const file = await handles[0].getFile();
          await handleFileProcess(file);
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    // Fallback: trigger input element
    buttonFileInputRef.current?.click();
  };

  const handleDownloadSampleCsv = (templateIdx: number = 0) => {
    const tpl = SAMPLE_DAILY_LOAD_TEMPLATES[templateIdx] || SAMPLE_DAILY_LOAD_TEMPLATES[0];
    const blob = new Blob([tpl.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tpl.id}_load_profile.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleApply = () => {
    if (parseResult && parseResult.success && parseResult.parsedSteps.length > 0) {
      onApplyProfile(parseResult.parsedSteps, fileName, parseResult.detectedDtHours);
      setJustApplied(true);
    }
  };

  const isCompact = variant === 'compact';

  return (
    <div className={isCompact ? 'space-y-3' : 'grid grid-cols-1 lg:grid-cols-2 gap-4 h-full'}>
      {/* LEFT / TOP: Imported Switcher + Upload Zone + Quick Templates */}
      <div className="flex flex-col space-y-2.5">
        {/* Saved Imported Profiles Switcher */}
        {importedProfiles.length > 0 && onSelectExistingProfile && (
          <div className="bg-[#0e1626] p-2.5 rounded border border-cyan-500/30 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Imported Profiles ({importedProfiles.length})
              </span>
              {activeProfileName && (
                <span className="text-emerald-400 truncate max-w-[140px]">
                  Active: {activeProfileName}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {importedProfiles.map((prof) => {
                const isActive = activeProfileName === prof.name;
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => onSelectExistingProfile(prof.id)}
                    className={`px-2 py-1 rounded text-[10px] font-mono border transition text-left ${
                      isActive
                        ? 'bg-cyan-900/70 border-cyan-400 text-cyan-100 font-bold'
                        : 'bg-[#131d31] border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span className="block truncate max-w-[160px]">{prof.name}</span>
                    <span className="text-[9px] text-slate-400">
                      Peak {prof.peak_kw.toFixed(2)}kW • {prof.daily_kwh.toFixed(1)}kWh/d
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary Dropzone & Direct Native Tap Area (Wrapped in a native <label> with transparent full-area file input) */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              void handleFileProcess(e.dataTransfer.files[0]);
            }
          }}
          className={`relative border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center transition cursor-pointer select-none ${
            isCompact ? 'p-3.5' : 'flex-1 p-5 min-h-[140px]'
          } ${
            dragActive
              ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200 shadow-inner'
              : 'border-slate-700 bg-[#0d1424] text-slate-400 hover:border-cyan-500/80 hover:bg-[#101b30]'
          }`}
        >
          {/* Native HTML file input overlaid across entire drop box */}
          <input
            ref={dropFileInputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel,text/comma-separated-values,application/csv,*/*"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
            onChange={(e) => {
              const chosen = e.target.files && e.target.files[0];
              if (chosen) {
                void handleFileProcess(chosen);
                e.target.value = '';
              }
            }}
          />
          <div className="pointer-events-none flex flex-col items-center">
            <UploadCloud className={`${isCompact ? 'w-6 h-6 mb-1' : 'w-9 h-9 mb-2'} text-cyan-400 animate-pulse`} />
            <p className="font-bold text-slate-200 text-xs sm:text-sm">
              Tap Anywhere to Open File Explorer
            </p>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
              Active Power (<span className="text-rose-300 font-mono">kW</span> or <span className="text-rose-300 font-mono">W</span>) vs Time in Hours (<span className="text-cyan-300 font-mono">0–24h</span> or <span className="text-cyan-300 font-mono">HH:MM</span>)
            </p>
            <span className="mt-2 text-[9px] font-mono text-cyan-300/80 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
              Works on Android, Tablets, Windows, Mac, Linux
            </span>
          </div>
        </label>

        {readError && (
          <div className="p-2.5 rounded bg-rose-950/60 border border-rose-500 text-rose-200 text-[11px] flex items-start gap-1.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Import Error</strong>
              <span>{readError}</span>
            </div>
          </div>
        )}

        {/* Action Row: Explicit Native Browse Label Button, Fallback Picker, Sample Download & Paste Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="flex flex-wrap items-center gap-2">
            {/* Native Label-Wrapped Button: Never fails on mobile/Android/tablet */}
            <label className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white font-bold px-3 py-1.5 rounded cursor-pointer transition shadow-sm">
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Browse File Explorer</span>
              <input
                ref={buttonFileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel,text/comma-separated-values,application/csv,*/*"
                className="sr-only"
                onChange={(e) => {
                  const chosen = e.target.files && e.target.files[0];
                  if (chosen) {
                    void handleFileProcess(chosen);
                    e.target.value = '';
                  }
                }}
              />
            </label>

            {/* Direct File System API button (extra safeguard for Chrome/Edge) */}
            <button
              type="button"
              onClick={handleOpenNativePicker}
              className="flex items-center gap-1 bg-[#131d31] hover:bg-[#1a2844] text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded transition"
              title="Open File Picker"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
              <span>Device Files</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadSampleCsv(systemScale === '1:10' ? 2 : 0)}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 underline px-1 py-1"
              title="Download clean CSV template formatted for DRDO microgrid simulation"
            >
              <Download className="w-3 h-3" />
              <span>Sample CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPasteBox((v) => !v)}
              className="flex items-center gap-1 text-slate-300 hover:text-cyan-300 bg-[#131d31] border border-slate-700 px-2 py-1 rounded"
            >
              <ClipboardPaste className="w-3 h-3" />
              <span>{showPasteBox ? 'Hide Presets' : 'Paste CSV / Presets'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Paste & Quick Daily Load Curve Presets */}
        {showPasteBox && (
          <div className="bg-[#080e1a] border border-slate-700/80 rounded p-2.5 space-y-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase block flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Quick Daily Test Profiles (1-Click Instant Import):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SAMPLE_DAILY_LOAD_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => loadNewCsvText(tpl.csv, `${tpl.id}.csv`, true)}
                  className="p-1.5 rounded bg-[#131d31] hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/50 text-left transition"
                >
                  <div className="text-[10px] font-bold text-cyan-300">{tpl.label}</div>
                  <div className="text-[9px] text-slate-400 leading-tight">{tpl.description}</div>
                </button>
              ))}
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                Or paste CSV text directly (<code className="text-slate-300">time_h, active_power_kw</code>):
              </label>
              <textarea
                rows={4}
                value={rawCsvText}
                onChange={(e) => {
                  setRawCsvText(e.target.value);
                  setJustApplied(false);
                }}
                placeholder={'time_h,active_power_kw\n0,0.42\n6,0.85\n12,1.20\n19,3.57\n24,0.45'}
                className="w-full bg-[#060a12] border border-slate-700 rounded p-1.5 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* RIGHT / BOTTOM: Parser Diagnostics, Overrides, Sparkline Preview & Apply CTA */}
      <div className="flex flex-col border border-slate-800 rounded bg-[#070b13] p-3 overflow-y-auto space-y-2.5">
        {parseResult ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
              <span className="font-bold text-slate-200 text-[11px] truncate" title={fileName}>
                {fileName}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[9.5px] font-bold flex-shrink-0 ${
                  parseResult.success
                    ? justApplied
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                    : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                }`}
              >
                {parseResult.success ? (justApplied ? 'ACTIVE IN SIM ✓' : 'READY TO APPLY') : 'ERROR'}
              </span>
            </div>

            {!parseResult.success && parseResult.error && (
              <div className="p-2 rounded bg-rose-950/40 border border-rose-500/50 text-rose-300 text-[10px]">
                {parseResult.error}
              </div>
            )}

            {parseResult.success && (
              <>
                {/* Top Apply CTA (always visible without scrolling) */}
                {!justApplied && (
                  <button
                    type="button"
                    onClick={handleApply}
                    className="w-full flex items-center justify-center gap-1.5 font-bold px-3 py-2 rounded transition shadow text-[11px] bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 active:scale-98 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Apply & Run Profile in Microgrid Sim ({parseResult.parsedSteps.length} steps)</span>
                  </button>
                )}

                {/* Daily Load Sparkline */}
                <LoadCurveSparkline
                  steps={parseResult.parsedSteps}
                  dtHours={parseResult.detectedDtHours}
                />

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                  <div className="bg-[#0e1626] p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">Peak Power</span>
                    <strong className="text-rose-300">
                      {parseResult.stats.maxLoadKw.toFixed(2)} kW
                    </strong>
                  </div>
                  <div className="bg-[#0e1626] p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">Daily Energy</span>
                    <strong className="text-amber-300">
                      {parseResult.stats.dailyEnergyKwh.toFixed(2)} kWh/d
                    </strong>
                  </div>
                  <div className="bg-[#0e1626] p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">Time Step</span>
                    <strong className="text-cyan-300">
                      {parseResult.detectedDtHours === 1
                        ? '60 min (1h)'
                        : `${Math.round(parseResult.detectedDtHours * 60)} min`}
                    </strong>
                  </div>
                  <div className="bg-[#0e1626] p-1.5 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[9px]">Sim Steps</span>
                    <strong className="text-slate-200">
                      {parseResult.parsedSteps.length} pts ({parseResult.stats.durationHours.toFixed(1)}h)
                    </strong>
                  </div>
                </div>
              </>
            )}

            {/* Column Mapping & Unit Options (Shown whenever headers are available, even if auto-detect needs user guidance) */}
            {parseResult.headers.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-[#0b1220] p-2 rounded border border-slate-800">
                <div>
                  <label className="text-[9px] text-slate-400 block mb-0.5">Time Column (Hours):</label>
                  <select
                    value={timeColOverride || parseResult.mapping.timestampCol}
                    onChange={(e) => {
                      setTimeColOverride(e.target.value);
                      setJustApplied(false);
                    }}
                    className="w-full bg-[#131d31] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-cyan-300"
                  >
                    {parseResult.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-slate-400 block mb-0.5">Active Power Column:</label>
                  <select
                    value={loadColOverride || parseResult.mapping.loadCol}
                    onChange={(e) => {
                      setLoadColOverride(e.target.value);
                      setJustApplied(false);
                    }}
                    className="w-full bg-[#131d31] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-rose-300"
                  >
                    {parseResult.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Power Unit & Benchtop Scale */}
                <div>
                  <label className="text-[9px] text-slate-400 block mb-0.5">
                    Unit ({parseResult.detectedPowerUnit.toUpperCase()}):
                  </label>
                  <div className="flex bg-[#070b13] rounded border border-slate-700 overflow-hidden">
                    {(['auto', 'kw', 'w'] as PowerUnit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          setPowerUnit(u);
                          setJustApplied(false);
                        }}
                        className={`flex-1 py-0.5 text-[9.5px] font-bold uppercase ${
                          powerUnit === u
                            ? 'bg-cyan-700 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Grid Resampling */}
                <div>
                  <label className="text-[9px] text-slate-400 block mb-0.5">Time Grid:</label>
                  <select
                    value={resampleMode}
                    onChange={(e) => {
                      setResampleMode(e.target.value as ResampleMode);
                      setJustApplied(false);
                    }}
                    className="w-full bg-[#131d31] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                  >
                    <option value="auto">Auto ({parseResult.wasResampled ? '15m Grid' : 'Native'})</option>
                    <option value="15min">15-min Grid (96 pts/d)</option>
                    <option value="native">Native CSV Rows ({parseResult.rawRowsCount})</option>
                  </select>
                </div>

                {(parseResult.wasResampled || resampleMode === '15min') && (
                  <div className="col-span-2 flex items-center justify-between pt-0.5">
                    <span className="text-[9px] text-slate-400">Interpolation:</span>
                    <div className="flex gap-1">
                      {(['linear', 'step'] as InterpMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setInterpMethod(m);
                            setJustApplied(false);
                          }}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold capitalize ${
                            interpMethod === m
                              ? 'bg-cyan-800 text-cyan-100 border border-cyan-500'
                              : 'bg-[#131d31] text-slate-400 border border-slate-700'
                          }`}
                        >
                          {m === 'linear' ? 'Linear Slope' : 'Step / Zero-Order Hold'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Warnings Ribbon */}
            {parseResult.warnings.length > 0 && (
              <div className="space-y-1">
                {parseResult.warnings.map((w, idx) => (
                  <div key={idx} className="text-[9px] text-amber-300/90 bg-amber-950/30 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* First 5 Preview Rows */}
            {parseResult.previewRows.length > 0 && (
              <div className="border border-slate-800 rounded overflow-hidden">
                <div className="bg-[#0b1220] px-2 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>CSV Data Preview (First {parseResult.previewRows.length} Rows)</span>
                  <span className="text-cyan-400 font-mono">
                    Delimiter: [{parseResult.detectedDelimiter === '\t' ? 'TAB' : parseResult.detectedDelimiter}]
                  </span>
                </div>
                <div className="overflow-x-auto max-h-32">
                  <table className="w-full text-left text-[9px] font-mono border-collapse">
                    <thead>
                      <tr className="bg-[#0e1626] border-b border-slate-800 text-slate-300">
                        {parseResult.headers.map((h) => (
                          <th key={h} className="px-2 py-1 truncate max-w-[100px]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.previewRows.map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-slate-800/60 hover:bg-[#131d31]/50">
                          {parseResult.headers.map((h) => (
                            <td key={h} className="px-2 py-0.5 text-slate-400 truncate max-w-[100px]">
                              {row[h] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
            <FileText className="w-10 h-10 text-slate-600 stroke-[1.2]" />
            <p className="text-xs font-semibold text-slate-400">No Profile Selected Yet</p>
            <p className="text-[10px] text-slate-500 max-w-xs leading-normal">
              Tap the upload box or &ldquo;Browse File Explorer&rdquo; on the left, or pick one of the sample 1-click test profiles.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
