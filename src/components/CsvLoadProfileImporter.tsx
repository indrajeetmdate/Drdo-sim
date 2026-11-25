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
  Layers,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('Custom_Load_Profile.csv');
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

  const loadNewCsvText = (text: string, name: string) => {
    setRawCsvText(text);
    setFileName(name);
    setTimeColOverride('');
    setLoadColOverride('');
    setPowerUnit('auto');
    setResampleMode('auto');
    setScaleMultiplier(1.0);
    setJustApplied(false);
  };

  const handleFileProcess = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      loadNewCsvText(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleDownloadSampleCsv = (templateIdx: number = 0) => {
    const tpl = SAMPLE_DAILY_LOAD_TEMPLATES[templateIdx] || SAMPLE_DAILY_LOAD_TEMPLATES[0];
    const blob = new Blob([tpl.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tpl.id}_load_profile.csv`;
    a.click();
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

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileProcess(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center transition cursor-pointer ${
            isCompact ? 'p-3.5' : 'flex-1 p-5'
          } ${
            dragActive
              ? 'border-cyan-400 bg-cyan-950/20 text-cyan-300'
              : 'border-slate-700 bg-[#0d1424] text-slate-400 hover:border-cyan-500/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileProcess(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />
          <UploadCloud className={`${isCompact ? 'w-6 h-6 mb-1' : 'w-8 h-8 mb-2'} text-cyan-400`} />
          <p className="font-bold text-slate-200 text-[11px]">
            Upload / Drop Load Profile CSV
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
            Active Power (<code className="text-rose-300">kW</code> or <code className="text-rose-300">W</code>) vs Time in Hours (<code className="text-cyan-300">0–24h</code> or <code className="text-cyan-300">HH:MM</code>)
          </p>
        </div>

        {/* Action Row: Sample Download & Paste Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadSampleCsv(systemScale === '1:10' ? 2 : 0)}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 underline"
            >
              <Download className="w-3 h-3" />
              <span>Sample Hourly CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPasteBox((v) => !v)}
              className="flex items-center gap-1 text-slate-300 hover:text-cyan-300 bg-[#131d31] border border-slate-700 px-2 py-0.5 rounded"
            >
              <ClipboardPaste className="w-3 h-3" />
              <span>{showPasteBox ? 'Hide Paste/Presets' : 'Paste CSV / Presets'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Paste & Quick Daily Load Curve Presets */}
        {showPasteBox && (
          <div className="bg-[#080e1a] border border-slate-700/80 rounded p-2.5 space-y-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">
              Quick Daily Test Profiles (1-Click Load into Preview):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SAMPLE_DAILY_LOAD_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => loadNewCsvText(tpl.csv, `${tpl.id}.csv`)}
                  className="p-1.5 rounded bg-[#131d31] hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/50 text-left transition"
                >
                  <div className="text-[10px] font-bold text-cyan-300">{tpl.label}</div>
                  <div className="text-[9px] text-slate-400 leading-tight">{tpl.description}</div>
                </button>
              ))}
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                Or paste CSV rows (<code className="text-slate-300">time_h, active_power_kw</code>):
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

      {/* RIGHT / BOTTOM: Parser Diagnostics, Overrides & Sparkline Preview */}
      <div className="flex flex-col border border-slate-800 rounded bg-[#070b13] p-3 overflow-y-auto space-y-2.5">
        {parseResult ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
              <span className="font-bold text-slate-200 text-[11px] truncate">
                {fileName}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[9.5px] font-bold flex-shrink-0 ${
                  parseResult.success
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                }`}
              >
                {parseResult.success ? 'READY' : 'ERROR'}
              </span>
            </div>

            {!parseResult.success && parseResult.error && (
              <div className="p-2 rounded bg-rose-950/40 border border-rose-500/50 text-rose-300 text-[10px]">
                {parseResult.error}
              </div>
            )}

            {parseResult.success && (
              <>
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

                {/* Column Mapping & Unit / Grid Options */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-[#0b1220] p-2 rounded border border-slate-800">
                  <div>
                    <label className="text-[9px] text-slate-400 block mb-0.5">Time (h) Col:</label>
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
                    <label className="text-[9px] text-slate-400 block mb-0.5">Active Power Col:</label>
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
                            className={`px-2 py-0.5 rounded text-[9px] border ${
                              interpMethod === m
                                ? 'bg-cyan-900 text-cyan-200 border-cyan-500'
                                : 'bg-[#131d31] text-slate-400 border-slate-700'
                            }`}
                          >
                            {m === 'linear' ? 'Linear Smooth' : 'Step Hold'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {systemScale === '1:10' && (
                    <div className="col-span-2 flex items-center justify-between pt-0.5 border-t border-slate-800/80">
                      <span className="text-[9px] text-amber-300">
                        1:10 Benchtop Scale Multiplier:
                      </span>
                      <div className="flex gap-1">
                        {[1.0, 0.1].map((mult) => (
                          <button
                            key={mult}
                            type="button"
                            onClick={() => {
                              setScaleMultiplier(mult);
                              setJustApplied(false);
                            }}
                            className={`px-2 py-0.5 rounded text-[9px] border font-bold ${
                              scaleMultiplier === mult
                                ? 'bg-amber-800 text-amber-100 border-amber-400'
                                : 'bg-[#131d31] text-slate-400 border-slate-700'
                            }`}
                          >
                            {mult === 0.1 ? '0.1x (HIL)' : '1.0x (As-Is)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Warnings */}
                {parseResult.warnings.length > 0 && (
                  <div className="p-2 rounded bg-amber-950/30 border border-amber-600/30 text-amber-300 text-[9.5px] space-y-0.5">
                    {parseResult.warnings.map((w, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Full mode Preview Table */}
                {!isCompact && parseResult.previewRows.length > 0 && (
                  <div className="overflow-x-auto border border-slate-800 rounded">
                    <table className="w-full text-left text-[10px]">
                      <thead>
                        <tr className="bg-[#121929] text-slate-400">
                          {parseResult.headers.map((h, i) => (
                            <th key={i} className="p-1 border-r border-slate-800">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {parseResult.previewRows.slice(0, 6).map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-800/20">
                            {parseResult.headers.map((h, cIdx) => (
                              <td key={cIdx} className="p-1 border-r border-slate-800/60 text-slate-300">
                                {row[h]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Apply CTA */}
                <button
                  type="button"
                  onClick={handleApply}
                  className={`w-full flex items-center justify-center gap-1.5 font-bold px-3 py-2 rounded transition shadow text-[11px] ${
                    justApplied
                      ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                      : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {justApplied
                      ? `Applied "${fileName}" to Live Simulation ✓`
                      : `Run Simulation with "${fileName}" (${parseResult.parsedSteps.length} steps)`}
                  </span>
                </button>
              </>
            )}
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
            <FileText className="w-7 h-7 mb-1.5 text-slate-600" />
            <p className="text-[11px] text-slate-400">No CSV profile staged yet.</p>
            <p className="text-[9.5px] text-slate-500 mt-1">
              Upload a CSV of <span className="text-slate-300">Active Power vs Time in Hours (0–24h)</span> or click{' '}
              <button
                type="button"
                onClick={() => setShowPasteBox(true)}
                className="text-cyan-400 underline"
              >
                Paste CSV / Presets
              </button>{' '}
              to preview & run it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
