import React from 'react';
import { X, ZoomIn } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  title: string;
  description: string;
}

export const SystemDiagramModal: React.FC<Props> = ({
  isOpen,
  onClose,
  imageSrc,
  title,
  description,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[#0b101c] border border-cyan-500/40 rounded-lg w-full max-w-5xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-[#070b13] border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold font-mono text-cyan-300 uppercase tracking-wider">
              {title}
            </h3>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 hover:bg-slate-800 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image Viewer */}
        <div className="flex-1 p-4 flex items-center justify-center bg-[#05080e] overflow-auto">
          <img
            src={imageSrc}
            alt={title}
            className="max-h-[80vh] max-w-full object-contain rounded shadow-lg border border-slate-800"
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#070b13] border-t border-slate-800 text-right">
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
