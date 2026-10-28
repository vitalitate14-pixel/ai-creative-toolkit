import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Check, Sparkles, HelpCircle } from 'lucide-react';

export interface AiSplitPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  defaultPrompt: string;
  onSave: (newPrompt: string) => void;
}

export const AiSplitPromptModal: React.FC<AiSplitPromptModalProps> = ({
  isOpen,
  onClose,
  prompt,
  defaultPrompt,
  onSave,
}) => {
  const [draftPrompt, setDraftPrompt] = useState(prompt);

  // Sync draft whenever modal opens or prompt changes
  useEffect(() => {
    if (isOpen) {
      setDraftPrompt(prompt);
    }
  }, [isOpen, prompt]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleReset = () => {
    if (window.confirm('确定要恢复为官方默认的 AI 拆分指令吗？')) {
      setDraftPrompt(defaultPrompt);
    }
  };

  const handleSave = () => {
    const trimmed = draftPrompt.trim();
    if (!trimmed) {
      alert('指令内容不能为空');
      return;
    }
    onSave(trimmed);
    onClose();
  };

  const isModifiedFromDefault = draftPrompt.trim() !== defaultPrompt.trim();

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">AI 拆分指令配置</h3>
                {isModifiedFromDefault && (
                  <span className="px-1.5 py-0.5 text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
                    已自定义
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                自定义识别提取开头标题 / Hook 的提示词规则，系统将据此精准截取为【标题】与【正文】两列
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Tip Box */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-950/30 border border-emerald-700/30 text-emerald-200/90 text-xs leading-relaxed">
            <HelpCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong>工作机制与规范：</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-300">
                <li>AI 只需从文本开头提取出<strong>最精简的标题/Hook</strong>，系统会自动用它在原文中进行截取，确保<strong>100% 原文零修改</strong>。</li>
                <li>您可以在下方按需要定制指令规则（例如：针对不同文案题材的 Hook 特征、祈祷称呼、全大写抓眼词等）。</li>
                <li>底层数据组装与 JSON 数组格式校验由系统自动兜底，无需担心格式解析失败。</li>
              </ul>
            </div>
          </div>

          {/* Prompt Editor */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                提示词指令 (System Instructions & Examples)
              </label>
              <span className="text-[11px] text-slate-500">
                支持快捷键 <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-400">Ctrl</kbd> + <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-400">Enter</kbd> 快速保存
              </span>
            </div>
            <textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              rows={14}
              placeholder="输入 AI 提取标题的指令与规则..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/90 rounded-lg text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-colors resize-y"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 bg-slate-900/90">
          <button
            type="button"
            onClick={handleReset}
            disabled={!isModifiedFromDefault}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
              isModifiedFromDefault
                ? 'text-amber-300 bg-amber-950/30 border-amber-700/50 hover:bg-amber-900/40'
                : 'text-slate-500 bg-slate-800/40 border-slate-800 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>恢复默认指令</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-lg shadow-sm transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>保存并生效</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
