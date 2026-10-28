import React, { useState, useMemo } from 'react';
import {
  X,
  Undo2,
  Check,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  GitCompare,
  Layers,
  Sparkles
} from 'lucide-react';
import { TemplateSegment } from '../types';
import { computeSegmentDiff } from '../utils/segmentDiff';

interface SegmentDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRevert: () => void;
  actionName?: string;
  beforeSegments: TemplateSegment[];
  afterSegments: TemplateSegment[];
}

export const SegmentDiffModal: React.FC<SegmentDiffModalProps> = ({
  isOpen,
  onClose,
  onRevert,
  actionName = '分镜修改',
  beforeSegments,
  afterSegments
}) => {
  const [viewMode, setViewMode] = useState<'changed' | 'all'>('changed');

  const diffResult = useMemo(() => {
    return computeSegmentDiff(beforeSegments, afterSegments);
  }, [beforeSegments, afterSegments]);

  if (!isOpen) return null;

  const { metrics, changedGroups } = diffResult;

  return (
    <div
      className="prefix-modal-overlay"
      style={{
        alignItems: 'flex-start',
        paddingTop: '4vh',
        backgroundColor: 'rgba(5, 10, 20, 0.9)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        className="bg-[#0e172a] text-slate-100 rounded-xl shadow-2xl border border-slate-700/80 p-5 flex flex-col gap-3.5"
        style={{ width: 'min(94vw, 840px)', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部标题与关闭 */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-500/40">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">修改前与修改后对比</h3>
                <span className="px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 text-[11px] font-medium">
                  {actionName}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                可直观查看受影响的段落切分、段数及字数变化，随时一键还原
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 指标卡片与安全检查 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {/* 段落数变化 */}
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-1">
            <span className="text-slate-400 text-[11px]">段落数量变化</span>
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-slate-300 font-bold text-sm">{metrics.beforeCount} 段</span>
              <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="text-indigo-300 font-bold text-sm">{metrics.afterCount} 段</span>
              <span className={`text-[11px] font-semibold ml-1 ${metrics.countDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ({metrics.countDiff >= 0 ? `+${metrics.countDiff}` : metrics.countDiff})
              </span>
            </div>
          </div>

          {/* 字符总数变化 */}
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-1">
            <span className="text-slate-400 text-[11px]">总字数对比</span>
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-slate-300 font-bold text-sm">{metrics.beforeTotalChars} 字</span>
              <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="text-indigo-300 font-bold text-sm">{metrics.afterTotalChars} 字</span>
              <span className={`text-[11px] font-semibold ml-1 ${metrics.charDiff === 0 ? 'text-slate-400' : metrics.charDiff > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                ({metrics.charDiff >= 0 ? `+${metrics.charDiff}` : metrics.charDiff})
              </span>
            </div>
          </div>

          {/* 完整度安全提示 */}
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-center">
            {metrics.isExactTextEqual || metrics.isSameCharCount ? (
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>文案内容无损，未丢失任何文字</span>
              </div>
            ) : metrics.charDiff < 0 ? (
              <div className="flex items-center gap-1.5 text-amber-400 font-medium text-[11px]">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>总字数减少了 {Math.abs(metrics.charDiff)} 字，请确认是否删除</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-sky-400 font-medium text-[11px]">
                <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                <span>文本字数新增了 {metrics.charDiff} 字</span>
              </div>
            )}
          </div>
        </div>

        {/* 视图切换按钮 */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('changed')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                viewMode === 'changed'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              仅看变更段落 ({changedGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                viewMode === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              全局并排对比
            </button>
          </div>

          <span className="text-[11px] text-slate-500">
            {viewMode === 'changed' ? '聚焦展示受本次修改影响的具体段落' : '左侧修改前 · 右侧修改后'}
          </span>
        </div>

        {/* 对比主体内容展示 */}
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-800 bg-[#091122] p-3 space-y-3">
          {viewMode === 'changed' ? (
            // 模式 1：仅看受影响的段落群组
            changedGroups.length > 0 ? (
              changedGroups.map((group, gIdx) => (
                <div key={gIdx} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] border-b border-slate-800/80 pb-1.5">
                    <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-700/50 text-[10px]">
                        变更 #{gIdx + 1}
                      </span>
                      <span>
                        {group.changeType === 'split' && '✂️ 拆分段落'}
                        {group.changeType === 'merge' && '🔗 合并段落'}
                        {group.changeType === 'delete' && '🗑️ 删除段落'}
                        {group.changeType === 'insert' && '➕ 新增段落'}
                        {group.changeType === 'edit' && '✏️ 编辑文案'}
                        {group.changeType === 'complex' && '🔀 重新拆分'}
                      </span>
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      原第 {group.beforeStartIndex + 1}
                      {group.beforeSegments.length > 1 ? ` ~ ${group.beforeStartIndex + group.beforeSegments.length}` : ''} 段 ➔
                      现第 {group.afterStartIndex + 1}
                      {group.afterSegments.length > 1 ? ` ~ ${group.afterStartIndex + group.afterSegments.length}` : ''} 段
                    </span>
                  </div>

                  {/* 左右并排比对 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* 左侧：修改前 */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold text-rose-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <span>修改前 ({group.beforeSegments.length} 段)</span>
                      </div>
                      {group.beforeSegments.map((seg, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-2 rounded bg-rose-950/20 border border-rose-900/40 text-rose-200 text-xs font-mono leading-relaxed"
                        >
                          <div className="text-[10px] text-rose-400/80 font-bold mb-0.5">
                            #{group.beforeStartIndex + sIdx + 1} ({seg.text.length} 字)
                          </div>
                          <div>{seg.text}</div>
                        </div>
                      ))}
                      {group.beforeSegments.length === 0 && (
                        <div className="p-2 text-center text-slate-500 text-xs italic">无原段落（新插入）</div>
                      )}
                    </div>

                    {/* 右侧：修改后 */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>修改后 ({group.afterSegments.length} 段)</span>
                      </div>
                      {group.afterSegments.map((seg, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-2 rounded bg-emerald-950/25 border border-emerald-800/40 text-emerald-100 text-xs font-mono leading-relaxed"
                        >
                          <div className="text-[10px] text-emerald-400/80 font-bold mb-0.5">
                            #{group.afterStartIndex + sIdx + 1} ({seg.text.length} 字)
                          </div>
                          <div>{seg.text}</div>
                        </div>
                      ))}
                      {group.afterSegments.length === 0 && (
                        <div className="p-2 text-center text-slate-500 text-xs italic">已删除该段</div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs">
                当前分镜未检测到任何内容或结构变化
              </div>
            )
          ) : (
            // 模式 2：全局并排对比
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* 左侧全部修改前 */}
              <div className="space-y-2">
                <div className="font-semibold text-rose-400 pb-1 border-b border-slate-800 flex items-center justify-between">
                  <span>修改前全文 ({beforeSegments.length} 段)</span>
                  <span className="font-mono text-[11px] text-slate-500">{metrics.beforeTotalChars} 字符</span>
                </div>
                {beforeSegments.map((seg, idx) => (
                  <div key={idx} className="p-2 rounded bg-slate-900/60 border border-slate-800/80 text-slate-300 font-mono">
                    <span className="text-[10px] text-indigo-400 font-bold mr-1.5">#{idx + 1}</span>
                    <span>{seg.text}</span>
                  </div>
                ))}
              </div>

              {/* 右侧全部修改后 */}
              <div className="space-y-2">
                <div className="font-semibold text-emerald-400 pb-1 border-b border-slate-800 flex items-center justify-between">
                  <span>修改后全文 ({afterSegments.length} 段)</span>
                  <span className="font-mono text-[11px] text-slate-500">{metrics.afterTotalChars} 字符</span>
                </div>
                {afterSegments.map((seg, idx) => (
                  <div key={idx} className="p-2 rounded bg-slate-900/60 border border-slate-800/80 text-slate-200 font-mono">
                    <span className="text-[10px] text-emerald-400 font-bold mr-1.5">#{idx + 1}</span>
                    <span>{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <span className="text-[11px] text-slate-400">
            若不慎误触点错，随时点击左侧「取消本次修改」瞬间还原。
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                onRevert();
                onClose();
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-950/40"
            >
              <Undo2 className="w-3.5 h-3.5" />
              取消本次修改 (一键还原)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              保留当前修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
