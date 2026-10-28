import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, FileText, Copy, Edit3, Image as ImageIcon, Layers } from 'lucide-react';
import { SplitWorkspaceTab } from '../types';

interface WorkspaceTabBarProps {
  tabs: SplitWorkspaceTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCreateTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, newTitle: string) => void;
  onDuplicateTab: (tabId: string) => void;
}

export const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCreateTab,
  onCloseTab,
  onRenameTab,
  onDuplicateTab
}) => {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const handleStartRename = (tab: SplitWorkspaceTab, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTabId(tab.id);
    setEditingTitle(tab.title);
  };

  const handleCommitRename = () => {
    if (editingTabId && editingTitle.trim()) {
      onRenameTab(editingTabId, editingTitle.trim());
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommitRename();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  };

  return (
    <div className="w-full bg-[#0c152a] border-b border-slate-800 px-4 py-2 flex items-center gap-1.5 overflow-x-auto select-none shrink-0">
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto py-0.5">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const segmentCount = tab.templateSegments.length;
          const imageCount = tab.attachedImages.length;
          const isEditing = editingTabId === tab.id;

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={(e) => handleStartRename(tab, e)}
              className={`group shrink-0 relative flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition shadow-xs ${
                isActive
                  ? 'bg-gradient-to-r from-[#172b53] to-[#1c3566] text-white border-blue-500/80 shadow-md shadow-blue-950/40 ring-1 ring-blue-500/30'
                  : 'bg-[#101b33] hover:bg-[#142342] text-slate-300 hover:text-slate-100 border-slate-700/70'
              }`}
              title="单击切换，双击重命名标签页"
            >
              <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />

              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={e => setEditingTitle(e.target.value)}
                  onBlur={handleCommitRename}
                  onKeyDown={handleKeyDown}
                  onClick={e => e.stopPropagation()}
                  className="bg-[#0b1329] text-white text-xs px-1.5 py-0.5 rounded border border-blue-400 outline-none w-28"
                />
              ) : (
                <span className="truncate max-w-[140px] font-semibold">
                  {tab.title}
                </span>
              )}

              {/* 统计徽章 */}
              {(segmentCount > 0 || imageCount > 0) && !isEditing && (
                <div className="flex items-center gap-1 shrink-0">
                  {segmentCount > 0 && (
                    <span
                      className={`text-[10px] px-1 py-0.2 rounded border font-mono ${
                        isActive
                          ? 'bg-blue-950/90 text-blue-200 border-blue-600/50'
                          : 'bg-slate-900/80 text-slate-400 border-slate-700'
                      }`}
                      title={`${segmentCount} 个拆分分镜`}
                    >
                      {segmentCount}段
                    </span>
                  )}
                  {imageCount > 0 && (
                    <span
                      className={`text-[10px] px-1 py-0.2 rounded border font-mono flex items-center gap-0.5 ${
                        isActive
                          ? 'bg-emerald-950/90 text-emerald-200 border-emerald-600/50'
                          : 'bg-slate-900/80 text-emerald-400/80 border-slate-700'
                      }`}
                      title={`${imageCount} 张关联配图`}
                    >
                      <ImageIcon className="w-2.5 h-2.5 text-emerald-400" />
                      {imageCount}
                    </span>
                  )}
                </div>
              )}

              {/* 快捷操作按键：重命名、复制、关闭 */}
              {!isEditing && (
                <div className="flex items-center gap-0.5 ml-1 shrink-0">
                  <button
                    type="button"
                    onClick={e => handleStartRename(tab, e)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/60 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="重命名标签"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onDuplicateTab(tab.id);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="复制当前标签页副本"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className={`p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer ${
                      tabs.length > 1 ? 'opacity-60 group-hover:opacity-100' : 'opacity-20 hover:opacity-100'
                    }`}
                    title={tabs.length > 1 ? '关闭标签页' : '重置此标签页'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* 新建标签页按钮 */}
        <button
          type="button"
          onClick={onCreateTab}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition border border-blue-400/40 shrink-0 cursor-pointer"
          title="新建一个完全独立的拆分标签页"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建标签</span>
        </button>
      </div>

      <div className="shrink-0 text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-700/70">
        <Layers className="w-3.5 h-3.5 text-blue-400" />
        <span>共 {tabs.length} 个独立工作区</span>
      </div>
    </div>
  );
};
