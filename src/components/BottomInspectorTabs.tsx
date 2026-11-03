import React, { useState, useMemo } from 'react';
import {
  TimeSeriesOutputStep,
  SystemParameters,
  SimulationSummary,
  TimeSeriesInputStep,
} from '../types/microgrid';
import { generateSwitchgearAndBom } from '../simulation/switchgearSizer';
import { parseCsvFile, CsvParseResult } from '../simulation/csvParser';
import { InteractiveSystemFlowDiagram } from './InteractiveSystemFlowDiagram';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  LineChart,
  Search,
  ShieldCheck,
  Table,
  UploadCloud,
  Zap,
} from 'lucide-react';

interface Props {
  data: TimeSeriesOutputStep[];
  params: SystemParameters;
  summary: SimulationSummary | null;
  onLoadCustomDataset: (steps: TimeSeriesInputStep[], name: string) => void;
  onOpenDiagramModal: () => void;
  activeStep?: TimeSeriesOutputStep | null;
  onSelectStepIndex?: (index: number) => void;
}

export const BottomInspectorTabs: React.FC<Props> = ({
  data,
  params,
  summary,
  onLoadCustomDataset,
  onOpenDiagramModal,
  activeStep,
  onSelectStepIndex,
}) => {
  const [activeTab, setActiveTab] = useState<'table' | 'csv' | 'bom' | 'diagram' | 'benchmark'>('diagram');
  const [diagramSubView, setDiagramSubView] = useState<'interactive' | 'schematic'>('interactive');

  // Tab A: Table search & pagination state
  const [tableSearch, setTableSearch] = useState('');
  const [tableStateFilter, setTableStateFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Tab B: CSV upload state
  const [dragActive, setDragActive] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null);
  const [customDatasetName, setCustomDatasetName] = useState('Custom_Load_Profile.csv');

  // Filtered table rows
  const filteredRows = useMemo(() => {
    return data.filter((row) => {
      if (tableStateFilter !== 'all' && row.state.toString() !== tableStateFilter) {
        return false;
      }
      if (tableSearch.trim()) {
        const query = tableSearch.toLowerCase();
        return (
          row.timestamp.toLowerCase().includes(query) ||
          `step ${row.step}`.includes(query) ||
          `day ${row.day}`.includes(query)
        );
      }
      return true;
    });
  }, [data, tableSearch, tableStateFilter]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  // Tab C: Switchgear & BoM
  const switchgearAndBom = useMemo(() => {
    if (!summary) return null;
    return generateSwitchgearAndBom(params, summary);
  }, [params, summary]);

  // CSV Export Generator
  const handleExportCsv = () => {
    if (data.length === 0) return;

    const headers = [
      'step',
      'timestamp',
      'day',
      'hour',
      'irradiance_wm2',
      't_amb_c',
      'v_wind_ms',
      't_cell_c',
      'p_pv_bus_kw',
      'p_load_kw',
      'p_net_kw',
      'dispatch_state',
      'fc_active',
      'p_bess_chg_kw',
      'p_bess_dis_kw',
      'soc_fraction',
      'e_bess_kwh',
      'v_bus_v',
      'i_bess_a',
      'p_elec_bus_kw',
      'm_h2_prod_kg',
      'v_di_water_l',
      'v_o2_nm3',
      'p_fc_bus_kw',
      'm_h2_cons_kg',
      'm_h2_tank_kg',
      'p_tank_bar',
      'p_curtailed_kw',
      'p_unserved_kw',
      'i_pv_a',
      'i_load_a',
      'i_elec_a',
      'i_fc_a',
      'kcl_residual_a',
    ];

    const rows = data.map((d) => [
      d.step,
      `"${d.timestamp}"`,
      d.day,
      d.hour.toFixed(2),
      d.g_irr_wm2.toFixed(1),
      d.t_amb_c.toFixed(1),
      d.v_wind_ms.toFixed(1),
      d.t_cell_c.toFixed(1),
      d.p_pv_bus_kw.toFixed(4),
      d.p_load_kw.toFixed(4),
      d.p_net_kw.toFixed(4),
      d.state,
      d.fc_active ? 1 : 0,
      d.p_bess_chg_kw.toFixed(4),
      d.p_bess_dis_kw.toFixed(4),
      d.soc.toFixed(4),
      d.e_bess_kwh.toFixed(4),
      d.v_bus_v.toFixed(2),
      d.i_bess_a.toFixed(2),
      d.p_elec_bus_kw.toFixed(4),
      d.m_h2_prod_kg.toFixed(5),
      d.v_di_water_l.toFixed(4),
      d.v_o2_nm3.toFixed(4),
      d.p_fc_bus_kw.toFixed(4),
      d.m_h2_cons_kg.toFixed(5),
      d.m_h2_tank_kg.toFixed(5),
      d.p_tank_bar.toFixed(2),
      d.p_curtailed_kw.toFixed(4),
      d.p_unserved_kw.toFixed(4),
      d.i_pv_a.toFixed(2),
      d.i_load_a.toFixed(2),
      d.i_elec_a.toFixed(2),
      d.i_fc_a.toFixed(2),
      d.kcl_residual_a.toFixed(4),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Microgrid_P2H2P_SimLog_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV File Handler
  const handleFileProcess = (file: File) => {
    setCustomDatasetName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const res = parseCsvFile(text);
      setCsvResult(res);
    };
    reader.readAsText(file);
  };

  const handleApplyCustomCsv = () => {
    if (csvResult && csvResult.success && csvResult.parsedSteps.length > 0) {
      onLoadCustomDataset(csvResult.parsedSteps, customDatasetName);
      setActiveTab('table');
    }
  };

  // Sample CSV Template Download
  const handleDownloadSampleCsv = () => {
    const sample = `timestamp,load_kw,irradiance_wm2,temp_c,wind_speed\n2017-01-01 00:00,0.42,0,18.5,2.1\n2017-01-01 00:15,0.40,0,18.4,2.2\n2017-01-01 06:30,0.56,85,19.2,2.4\n2017-01-01 12:00,0.48,910,28.4,3.5\n2017-01-01 19:15,3.57,0,24.1,2.8`;
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Microgrid_Load_Template.csv';
    a.click();
  };

  return (
    <div className="min-h-[360px] lg:h-80 flex flex-col bg-[#0a0f1b] border-t border-slate-800 text-slate-300 font-mono text-xs">
      {/* Tab Navigation Header */}
      <div className="flex items-center justify-between bg-[#0e1626] border-b border-slate-800 px-3 sm:px-4 py-1.5 overflow-x-auto whitespace-nowrap">
        <div className="flex items-center gap-1.5 flex-nowrap">
          <button
            onClick={() => setActiveTab('diagram')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition flex-shrink-0 ${
              activeTab === 'diagram'
                ? 'bg-cyan-600/30 text-cyan-300 font-bold border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Visual Flow Diagram & SLD</span>
          </button>

          <button
            onClick={() => setActiveTab('table')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition flex-shrink-0 ${
              activeTab === 'table'
                ? 'bg-cyan-600/30 text-cyan-300 font-bold border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Data Table ({data.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('csv')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition flex-shrink-0 ${
              activeTab === 'csv'
                ? 'bg-cyan-600/30 text-cyan-300 font-bold border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Ingest Custom CSV</span>
          </button>

          <button
            onClick={() => setActiveTab('bom')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition flex-shrink-0 ${
              activeTab === 'bom'
                ? 'bg-cyan-600/30 text-cyan-300 font-bold border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Master BoM & Switchgear Sizing</span>
          </button>

          <button
            onClick={() => setActiveTab('benchmark')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition flex-shrink-0 ${
              activeTab === 'benchmark'
                ? 'bg-cyan-600/30 text-cyan-300 font-bold border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <LineChart className="w-3.5 h-3.5 text-sky-400" />
            <span>Load Profile Benchmark</span>
          </button>
        </div>

        {/* Global Tab Actions */}
        <div className="flex items-center gap-2">
          {activeTab === 'table' && (
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 bg-[#142035] hover:bg-[#1a2d4d] text-cyan-300 px-2.5 py-1 rounded border border-cyan-500/40 transition text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Simulation Log CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Content Panes */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* TAB A: TIME-STEP DATA TABLE */}
        {activeTab === 'table' && (
          <div className="flex flex-col h-full space-y-2">
            {/* Table Filter Controls */}
            <div className="flex items-center justify-between text-[11px] gap-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5" />
                  <input
                    type="text"
                    placeholder="Filter date or step..."
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setPage(1);
                    }}
                    className="bg-[#121929] border border-slate-700 rounded pl-7 pr-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-48"
                  />
                </div>

                <select
                  value={tableStateFilter}
                  onChange={(e) => {
                    setTableStateFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-[#121929] border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="all">All States (1, 2, 3, 4)</option>
                  <option value="1">State 1: BESS Charging</option>
                  <option value="2">State 2: H₂ Electrolyzer</option>
                  <option value="3">State 3: BESS Discharging</option>
                  <option value="4">State 4: Fuel Cell Extender</option>
                </select>
              </div>

              {/* Pagination */}
              <div className="flex items-center gap-2 text-slate-400">
                <span>
                  Showing {Math.min(filteredRows.length, (page - 1) * pageSize + 1)}–
                  {Math.min(filteredRows.length, page * pageSize)} of {filteredRows.length} rows
                </span>
                <div className="flex gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-2 py-0.5 rounded bg-[#162136] disabled:opacity-30 border border-slate-700 text-slate-200"
                  >
                    Prev
                  </button>
                  <span className="px-1 text-slate-300">
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2 py-0.5 rounded bg-[#162136] disabled:opacity-30 border border-slate-700 text-slate-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            {/* Dense Data Table */}
            <div className="flex-1 overflow-x-auto border border-slate-800 rounded bg-[#070b13]">
              <table className="w-full text-left border-collapse text-[11px] whitespace-nowrap">
                <thead>
                  <tr className="bg-[#101726] text-slate-400 border-b border-slate-800 sticky top-0 z-10">
                    <th className="p-1.5 border-r border-slate-800">#</th>
                    <th className="p-1.5 border-r border-slate-800">Timestamp</th>
                    <th className="p-1.5 border-r border-slate-800 text-amber-400">G [W/m²]</th>
                    <th className="p-1.5 border-r border-slate-800 text-amber-300">P_pv [kW]</th>
                    <th className="p-1.5 border-r border-slate-800 text-rose-400">P_load [kW]</th>
                    <th className="p-1.5 border-r border-slate-800">P_net [kW]</th>
                    <th className="p-1.5 border-r border-slate-800 text-center">State</th>
                    <th className="p-1.5 border-r border-slate-800 text-emerald-400">BESS Chg [kW]</th>
                    <th className="p-1.5 border-r border-slate-800 text-blue-400">BESS Dis [kW]</th>
                    <th className="p-1.5 border-r border-slate-800 text-emerald-300">SoC %</th>
                    <th className="p-1.5 border-r border-slate-800 text-yellow-400">V_bus [V]</th>
                    <th className="p-1.5 border-r border-slate-800 text-cyan-400">P_elec [kW]</th>
                    <th className="p-1.5 border-r border-slate-800 text-cyan-300">m_H₂ [kg]</th>
                    <th className="p-1.5 border-r border-slate-800 text-purple-400">P_fc [kW]</th>
                    <th className="p-1.5 border-r border-slate-800 text-sky-400">P_tank [bar]</th>
                    <th className="p-1.5 border-r border-slate-800 text-cyan-300">m_tank [kg]</th>
                    <th className="p-1.5 border-r border-slate-800 text-slate-400">Curt [kW]</th>
                    <th className="p-1.5 border-r border-slate-800 text-rose-400">Unserved [kW]</th>
                    <th className="p-1.5">KCL Residual [A]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                  {paginatedRows.map((r) => (
                    <tr key={r.step} className="hover:bg-slate-800/30">
                      <td className="p-1.5 border-r border-slate-800/60 text-slate-500">{r.step}</td>
                      <td className="p-1.5 border-r border-slate-800/60 text-slate-300">{r.timestamp}</td>
                      <td className="p-1.5 border-r border-slate-800/60 text-amber-400 text-right">{r.g_irr_wm2.toFixed(0)}</td>
                      <td className="p-1.5 border-r border-slate-800/60 text-amber-300 text-right font-semibold">{r.p_pv_bus_kw.toFixed(2)}</td>
                      <td className="p-1.5 border-r border-slate-800/60 text-rose-400 text-right">{r.p_load_kw.toFixed(2)}</td>
                      <td className={`p-1.5 border-r border-slate-800/60 text-right ${r.p_net_kw >= 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {r.p_net_kw >= 0 ? `+${r.p_net_kw.toFixed(2)}` : r.p_net_kw.toFixed(2)}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-center">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            r.state === 1
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                              : r.state === 2
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                              : r.state === 3
                              ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                              : 'bg-purple-950 text-purple-300 border border-purple-500/40'
                          }`}
                        >
                          S{r.state}
                        </span>
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-emerald-400 text-right">
                        {r.p_bess_chg_kw > 0 ? r.p_bess_chg_kw.toFixed(2) : '-'}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-blue-400 text-right">
                        {r.p_bess_dis_kw > 0 ? r.p_bess_dis_kw.toFixed(2) : '-'}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-emerald-300 text-right font-semibold">
                        {(r.soc * 100).toFixed(1)}%
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-yellow-400 text-right font-semibold">
                        {r.v_bus_v.toFixed(1)}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-cyan-400 text-right">
                        {r.p_elec_bus_kw > 0 ? r.p_elec_bus_kw.toFixed(2) : '-'}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-cyan-300 text-right">
                        {r.m_h2_prod_kg > 0 ? r.m_h2_prod_kg.toFixed(3) : '-'}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-purple-400 text-right">
                        {r.p_fc_bus_kw > 0 ? r.p_fc_bus_kw.toFixed(2) : '-'}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-sky-400 text-right font-semibold">
                        {r.p_tank_bar.toFixed(1)}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-cyan-300 text-right">
                        {r.m_h2_tank_kg.toFixed(3)}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-slate-400 text-right">
                        {r.p_curtailed_kw > 0 ? r.p_curtailed_kw.toFixed(2) : '-'}
                      </td>
                      <td className="p-1.5 border-r border-slate-800/60 text-rose-400 text-right">
                        {r.p_unserved_kw > 0 ? r.p_unserved_kw.toFixed(2) : '-'}
                      </td>
                      <td className="p-1.5 text-slate-500 text-right">
                        {r.kcl_residual_a.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB B: UPLOAD CUSTOM CSV */}
        {activeTab === 'csv' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            {/* Upload Drop Zone & Config */}
            <div className="flex flex-col space-y-3">
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
                className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-center transition cursor-pointer ${
                  dragActive
                    ? 'border-cyan-400 bg-cyan-950/20 text-cyan-300'
                    : 'border-slate-700 bg-[#0d1424] text-slate-400 hover:border-slate-500'
                }`}
                onClick={() => {
                  document.getElementById('csv-file-input')?.click();
                }}
              >
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileProcess(e.target.files[0]);
                    }
                  }}
                />
                <UploadCloud className="w-8 h-8 text-cyan-400 mb-2" />
                <p className="font-bold text-slate-200">
                  Drag & Drop Custom Load / Irradiance CSV here
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Supports columns: <code className="text-cyan-300">timestamp</code>,{' '}
                  <code className="text-rose-300">load_kw</code>,{' '}
                  <code className="text-amber-300">irradiance_wm2</code>,{' '}
                  <code className="text-slate-300">temp_c</code>
                </p>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleDownloadSampleCsv}
                  className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 underline"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Download Sample CSV Template</span>
                </button>

                {csvResult?.success && (
                  <button
                    onClick={handleApplyCustomCsv}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold px-4 py-1.5 rounded transition shadow"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Run Simulation on Loaded CSV ({csvResult.parsedSteps.length} rows)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Parser Results & Live Preview */}
            <div className="flex flex-col border border-slate-800 rounded bg-[#070b13] p-3 overflow-y-auto">
              {csvResult ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-slate-200">
                      Parser Diagnostics: {customDatasetName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        csvResult.success
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {csvResult.success ? 'READY' : 'PARSE ERROR'}
                    </span>
                  </div>

                  {csvResult.warnings.length > 0 && (
                    <div className="p-2 rounded bg-amber-950/40 border border-amber-600/40 text-amber-300 text-[10px] space-y-1">
                      {csvResult.warnings.map((w, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <AlertCircle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                    <div>
                      Delimiter: <strong className="text-slate-200">"{csvResult.detectedDelimiter}"</strong>
                    </div>
                    <div>
                      Time Step: <strong className="text-cyan-300">{csvResult.detectedDtHours * 60} min</strong>
                    </div>
                    <div>
                      Total Rows: <strong className="text-slate-200">{csvResult.rawRowsCount}</strong>
                    </div>
                  </div>

                  {/* Preview Table */}
                  {csvResult.previewRows.length > 0 && (
                    <div className="overflow-x-auto border border-slate-800 rounded">
                      <table className="w-full text-left text-[10px]">
                        <thead>
                          <tr className="bg-[#121929] text-slate-400">
                            {csvResult.headers.map((h, i) => (
                              <th key={i} className="p-1 border-r border-slate-800">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {csvResult.previewRows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-800/20">
                              {csvResult.headers.map((h, cIdx) => (
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
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-6">
                  <FileText className="w-8 h-8 mb-2 text-slate-600" />
                  <p>No CSV file uploaded yet.</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Upload your measured smart meter or microgrid log file to inspect headers and simulation results.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB C: MASTER BOM & SWITCHGEAR SIZING */}
        {activeTab === 'bom' && switchgearAndBom && (
          <div className="space-y-4">
            {/* Switchgear Sizing Table */}
            <div className="border border-slate-800 rounded overflow-hidden">
              <div className="bg-[#101726] px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-slate-200">
                    Microgrid DC Switchgear, Circuit Breaker & Conductor Sizing (1.25x Continuous NEC Factor)
                  </span>
                </div>
                <span className="text-[10px] text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/60">
                  NEC 690 / IEC 60364-7-712 Compliant
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#141d2f] text-slate-400 border-b border-slate-800">
                      <th className="p-2 border-r border-slate-800">Branch Name</th>
                      <th className="p-2 border-r border-slate-800">Role & Subsystem</th>
                      <th className="p-2 border-r border-slate-800 text-right">Sim Peak Current</th>
                      <th className="p-2 border-r border-slate-800 text-right text-amber-400">Design I (1.25x)</th>
                      <th className="p-2 border-r border-slate-800 text-right text-emerald-400">Rec. DC MCB</th>
                      <th className="p-2 border-r border-slate-800">Protection Spec</th>
                      <th className="p-2 border-r border-slate-800">Copper Conductor</th>
                      <th className="p-2 border-r border-slate-800 text-right">Max V_drop %</th>
                      <th className="p-2 text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                    {switchgearAndBom.switchgear.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="p-2 border-r border-slate-800 font-bold text-slate-200">
                          {item.branchName}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-slate-400">{item.role}</td>
                        <td className="p-2 border-r border-slate-800 text-right font-semibold">
                          {item.peakCurrentSim_A.toFixed(1)} A
                        </td>
                        <td className="p-2 border-r border-slate-800 text-right font-bold text-amber-400">
                          {item.continuousDesignCurrent_A} A
                        </td>
                        <td className="p-2 border-r border-slate-800 text-right font-bold text-emerald-400">
                          {item.recommendedMcbRating_A} A DC
                        </td>
                        <td className="p-2 border-r border-slate-800 text-slate-400 text-[10px]">
                          {item.recommendedFuseType}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-cyan-300 font-semibold">
                          {item.recommendedCableSize_mm2} mm² ({item.recommendedAwg})
                        </td>
                        <td className="p-2 border-r border-slate-800 text-right text-slate-300">
                          {item.voltageDrop_percent.toFixed(2)}%
                        </td>
                        <td className="p-2 text-right text-slate-300">${item.estimatedCostUsd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Equipment Bill of Materials */}
            <div className="border border-slate-800 rounded overflow-hidden">
              <div className="bg-[#101726] px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-200">
                  Master Equipment Bill of Materials (BoM) & Estimated Capital Expenditure (CapEx)
                </span>
                <span className="text-cyan-300 font-bold text-xs">
                  Total CapEx: ${switchgearAndBom.totalCapExUsd.toLocaleString()} USD
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#141d2f] text-slate-400 border-b border-slate-800">
                      <th className="p-2 border-r border-slate-800">Equipment Item</th>
                      <th className="p-2 border-r border-slate-800">Subsystem</th>
                      <th className="p-2 border-r border-slate-800">Engineering Specifications</th>
                      <th className="p-2 border-r border-slate-800 text-right">Qty</th>
                      <th className="p-2 border-r border-slate-800 text-right">Unit Price</th>
                      <th className="p-2 text-right text-cyan-400">Total Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {switchgearAndBom.equipmentBom.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="p-2 border-r border-slate-800 font-bold text-slate-200">
                          {item.item}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-slate-400 text-[10px]">
                          {item.subsystem}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-slate-400 text-[10px]">
                          {item.specs}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-right font-mono">
                          {item.qty} {item.unit}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-right font-mono">
                          ${item.unitCostUsd.toLocaleString()}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-cyan-300">
                          ${item.totalCostUsd.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB D: SYSTEM SINGLE-LINE DIAGRAM & INTERACTIVE FLOW */}
        {activeTab === 'diagram' && (
          <div className="flex flex-col gap-2 h-full">
            <div className="flex flex-wrap items-center justify-between px-2 py-1.5 bg-[#101726] border border-slate-800 rounded gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-200 text-xs">View Mode:</span>
                <button
                  onClick={() => setDiagramSubView('interactive')}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                    diagramSubView === 'interactive'
                      ? 'bg-cyan-600 text-white font-bold shadow'
                      : 'bg-[#141e33] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚡ Dynamic Flow Schematic (V, A, W, H₂, Signals)
                </button>
                <button
                  onClick={() => setDiagramSubView('schematic')}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                    diagramSubView === 'schematic'
                      ? 'bg-cyan-600 text-white font-bold shadow'
                      : 'bg-[#141e33] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📐 CAD Engineering Single-Line
                </button>
              </div>

              <button
                onClick={onOpenDiagramModal}
                className="px-2.5 py-1 bg-[#172338] hover:bg-[#1f304e] text-cyan-300 font-bold rounded border border-cyan-500/40 text-[11px] transition"
              >
                Expand Fullscreen
              </button>
            </div>

            {diagramSubView === 'interactive' ? (
              <div className="flex-1 w-full min-h-[480px]">
                <InteractiveSystemFlowDiagram
                  currentStep={activeStep || data[0] || null}
                  allSteps={data}
                  params={params}
                  onSelectStepIndex={onSelectStepIndex}
                  onToggleFullscreen={onOpenDiagramModal}
                />
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row gap-4 h-full">
                <div className="flex-1 bg-[#070b13] border border-slate-800 rounded p-2 flex items-center justify-center overflow-hidden min-h-[300px]">
                  <img
                    src="/diagrams/media_1793685530871_13054513.jpg"
                    alt="Hybrid DC Microgrid Single Line Diagram"
                    className="max-h-full max-w-full object-contain rounded"
                  />
                </div>
                <div className="w-full lg:w-80 flex flex-col justify-between bg-[#0e1626] border border-slate-800 rounded p-3 space-y-3">
                  <div>
                    <h4 className="font-bold text-cyan-300 text-xs uppercase mb-1">
                      Architecture Branch Map
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                      Common 48 V DC Bus topology with 5 primary branches governed by central DAQ supervisory logic.
                    </p>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="p-1.5 rounded bg-[#131d31] border border-amber-500/30">
                        <strong className="text-amber-400">Branch 1: Solar PV & MPPT</strong>
                        <div className="text-slate-400 text-[10px]">
                          {params.pv_peak_kw} kWp array → 2P DC Isolator → DC MCB → MPPT
                        </div>
                      </div>
                      <div className="p-1.5 rounded bg-[#131d31] border border-rose-500/30">
                        <strong className="text-rose-400">Branch 2: Programmable DC Load</strong>
                        <div className="text-slate-400 text-[10px]">
                          48V DC Bus → DC MCB → Electronic Load & Community Feed
                        </div>
                      </div>
                      <div className="p-1.5 rounded bg-[#131d31] border border-emerald-500/30">
                        <strong className="text-emerald-400">Branch 3: 16S LiFePO4 BESS</strong>
                        <div className="text-slate-400 text-[10px]">
                          {params.bess_cap_kwh} kWh Battery + BMS ↔ BiDir DC-DC ↔ 48V Bus
                        </div>
                      </div>
                      <div className="p-1.5 rounded bg-[#131d31] border border-cyan-500/30">
                        <strong className="text-cyan-400">Branch 4: PEM Electrolyzer (H₂)</strong>
                        <div className="text-slate-400 text-[10px]">
                          {params.elec_rated_kw} kW Stack ← CC/CV Step-Down DC-DC ← 48V Bus
                        </div>
                      </div>
                      <div className="p-1.5 rounded bg-[#131d31] border border-purple-500/30">
                        <strong className="text-purple-400">Branch 5: PEM Fuel Cell (Re-Elec)</strong>
                        <div className="text-slate-400 text-[10px]">
                          {params.fc_rated_kw} kW Stack → Boost Step-Up DC-DC → 48V Bus
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onOpenDiagramModal}
                    className="w-full py-1.5 bg-[#1b263b] hover:bg-[#233350] text-cyan-300 font-bold rounded border border-cyan-500/40 text-xs transition"
                  >
                    Expand Diagram Fullscreen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB E: BENCHMARK LOAD PROFILE ANALYSIS */}
        {activeTab === 'benchmark' && (
          <div className="flex flex-col lg:flex-row gap-4 h-full">
            <div className="flex-1 bg-[#070b13] border border-slate-800 rounded p-2 flex items-center justify-center overflow-hidden">
              <img
                src="/diagrams/media_1793685530765_f2ad8021.jpg"
                alt="Empirical 31-Day January Load Profile Benchmark"
                className="max-h-full max-w-full object-contain rounded"
              />
            </div>
            <div className="w-full lg:w-80 bg-[#0e1626] border border-slate-800 rounded p-3 space-y-2.5">
              <h4 className="font-bold text-sky-400 text-xs uppercase">
                Empirical Load Benchmark
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Matches the 31-day January 2017 high-resolution time-series data with monthly peak at 4.43 kW (Jan 2, 20:15).
              </p>

              <div className="space-y-1.5 text-[11px] pt-1">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Monthly Absolute Peak:</span>
                  <span className="text-rose-400 font-bold">4.43 kW (02-01 20:15)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Baseline Daytime Load:</span>
                  <span className="text-slate-200 font-mono">0.40 – 0.56 kW</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Overnight Baseload:</span>
                  <span className="text-slate-200 font-mono">0.35 – 0.45 kW</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Average Daily Consumption:</span>
                  <span className="text-cyan-300 font-mono">~25.2 kWh / day</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Load Factor:</span>
                  <span className="text-amber-400 font-mono">23.7%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
