import React, { useState } from 'react';
import { X, ZoomIn, Zap, Cpu, Image } from 'lucide-react';
import { TimeSeriesOutputStep, SystemParameters } from '../types/microgrid';
import { InteractiveSystemFlowDiagram } from './InteractiveSystemFlowDiagram';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  title: string;
  description: string;
  currentStep?: TimeSeriesOutputStep | null;
  allSteps?: TimeSeriesOutputStep[];
  params?: SystemParameters;
  onSelectStepIndex?: (index: number) => void;
}

export const SystemDiagramModal: React.FC<Props> = ({
  isOpen,
  onClose,
  imageSrc,
  title,
  description,
  currentStep,
  allSteps,
  params,
  onSelectStepIndex,
}) => {
  const [activeMode, setActiveMode] = useState<'interactive' | 'cad'>('interactive');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#0b101c] border border-cyan-500/40 rounded-lg w-full max-w-6xl shadow-2xl flex flex-col h-[94vh] max-h-[96vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 bg-[#070b13] border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-bold font-mono text-cyan-300 uppercase tracking-wider">
                {title}
              </h3>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5 hidden sm:block">
                {description}
              </p>
            </div>

            {/* Mode switch */}
            <div className="flex items-center gap-1 bg-[#121c2e] p-0.5 rounded border border-slate-700 ml-2">
              <button
                onClick={() => setActiveMode('interactive')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition flex items-center gap-1 ${
                  activeMode === 'interactive'
                    ? 'bg-cyan-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Live Flow (V, A, W, H₂, Comms)</span>
              </button>
              <button
                onClick={() => setActiveMode('cad')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition flex items-center gap-1 ${
                  activeMode === 'cad'
                    ? 'bg-cyan-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Image className="w-3 h-3 text-cyan-400" />
                <span>Engineering CAD SLD</span>
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 hover:bg-slate-800 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Stage */}
        <div className="flex-1 p-2 sm:p-3 flex items-center justify-center bg-[#05080e] overflow-auto">
          {activeMode === 'interactive' && params && allSteps ? (
            <InteractiveSystemFlowDiagram
              currentStep={currentStep || allSteps[0] || null}
              allSteps={allSteps}
              params={params}
              onSelectStepIndex={onSelectStepIndex}
              isFullscreen={true}
              onToggleFullscreen={onClose}
            />
          ) : (
            <img
              src={imageSrc}
              alt={title}
              className="max-h-[82vh] max-w-full object-contain rounded shadow-lg border border-slate-800"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#070b13] border-t border-slate-800 flex items-center justify-between flex-shrink-0 text-xs">
          <span className="text-[11px] text-slate-400 font-mono">
            {activeMode === 'interactive'
              ? '48V DC Common Bus • Directional Power (V, A, W DC) • Material H₂/Water Flow • Data Signals'
              : 'Single-Line Diagram with 5 branches: Solar MPPT, BESS, PEM Electrolyzer, PEMFC, and DC Load.'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#141e33] hover:bg-[#1c2c4d] text-slate-200 text-xs font-mono rounded border border-slate-700 transition"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
