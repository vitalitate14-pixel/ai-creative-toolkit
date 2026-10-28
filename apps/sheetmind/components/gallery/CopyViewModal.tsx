import React, { memo } from 'react';
import { createPortal } from 'react-dom';
import { X, Image, AlertCircle, ClipboardList } from 'lucide-react';
import type { DualSortRowsConfig } from '../galleryViewData';

export interface CopyRowColors {
    columnColors: Record<string, string>;
}

export interface CopyViewModalState {
    open: boolean;
    layoutMode: 'horizontal' | 'vertical' | 'columns';
    columnsPerRow: number;
    selectedColumns: string[];
    applyClassificationOverrides: boolean;
    emptyRowsBetweenGroups: number;
    includeExtraData: boolean;
    dualSortRows: DualSortRowsConfig;
    rowColors: CopyRowColors;
    splitGroupColumns: boolean;
}

export interface CopyViewModalProps {
    modal: CopyViewModalState;
    onModalChange: (updater: CopyViewModalState | ((prev: CopyViewModalState) => CopyViewModalState)) => void;
    groupColumnName: string | undefined;
    allColumns: string[];
    imageColumn: string;
    classificationOverridesCount: number;
    filterValuesByColumn: Record<string, string[]>;
    onCopy: (columnsPerRow: number, includeExtraData: boolean, selectedColumns: string[], applyOverrides: boolean, layoutMode: string, emptyRowsBetweenGroups: number, dualSortRows: DualSortRowsConfig, rowColors: CopyRowColors, splitGroupColumns: boolean) => void;
}

export const CopyViewModal = memo(function CopyViewModal({
    modal,
    onModalChange,
    groupColumnName,
    allColumns,
    imageColumn,
    classificationOverridesCount,
    filterValuesByColumn,
    onCopy,
}: CopyViewModalProps) {
    if (!modal.open) return null;

    const update = (patch: Partial<CopyViewModalState>) => {
        onModalChange({ ...modal, ...patch });
    };
    const detectedLikeColumn = allColumns.find(col => /点赞|like/i.test(col)) || '';
    const detectedTimeColumn = allColumns.find(col => /发布时间|发帖时间|日期|时间|date|time/i.test(col)) || '';

    return createPortal(
        <div className="sheetmind-light-form fixed inset-0 z-[200000] flex items-center justify-center bg-black/40 backdrop-blur-sm" onKeyDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-[400px] max-h-[calc(100vh-2rem)] p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4 shrink-0">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Image size={20} className="text-purple-500" />
                        复制视图布局
                    </h3>
                    <button
                        onClick={() => update({ open: false })}
                        className="p-1 hover:bg-slate-100 rounded"
                    >
                        <X size={18} className="text-slate-500" />
                    </button>
                </div>

                <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
                    <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm text-slate-600 mb-3">
                            将当前分组视图复制为表格格式：
                        </p>
                        <ul className="text-xs text-slate-500 space-y-1 ml-4 list-disc">
                            <li>可选横向网格或竖向分组明细布局</li>
                            <li>竖向布局: 先分组标题，再该分组明细行</li>
                            <li>粘贴到 Google Sheets 后可自动识别</li>
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">布局方向:</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['horizontal', 'vertical', 'columns'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => update({ layoutMode: mode })}
                                    className={`px-2 py-2 text-[11px] font-medium rounded-lg transition-colors ${modal.layoutMode === mode
                                        ? 'bg-purple-500 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    {mode === 'horizontal' ? '横向（网格）' : mode === 'vertical' ? '竖向（分组明细）' : '转置（按列分组）'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {modal.layoutMode === 'horizontal' && (
                        <>
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-slate-700">每行缩略图数量:</label>
                            <div className="flex items-center gap-2 flex-wrap">
                                {[10, 15, 20, 25, 30, 40].map(n => (
                                    <button
                                        key={n}
                                        onClick={() => update({ columnsPerRow: n })}
                                        className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${modal.columnsPerRow === n
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => update({ columnsPerRow: 0 })}
                                    className={`h-8 px-2 text-sm font-medium rounded-lg transition-colors ${modal.columnsPerRow === 0
                                        ? 'bg-purple-500 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    title="每个分组的所有缩略图放在同一行"
                                >
                                    全部
                                </button>
                                <input
                                    type="number"
                                    min="1"
                                    max="200"
                                    value={modal.columnsPerRow || ''}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 10;
                                        update({ columnsPerRow: Math.min(200, Math.max(1, val)) });
                                    }}
                                    className="w-14 h-8 px-2 text-sm text-center border border-slate-300 rounded-lg focus:border-purple-500 focus:outline-none tooltip-bottom"
                                    data-tip="自定义数量；选择“全部”可让每个分组只占一行"
                                />
                            </div>
                        </div>
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 space-y-3">
                            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                                <input type="checkbox" checked={modal.dualSortRows.enabled} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, enabled: e.target.checked, likeColumn: modal.dualSortRows.likeColumn || detectedLikeColumn, timeColumn: modal.dualSortRows.timeColumn || detectedTimeColumn } })} className="w-4 h-4 text-indigo-600 rounded" />
                                同组输出两行：点赞排序 + 时间排序
                            </label>
                            {modal.dualSortRows.enabled && <div className="space-y-3 text-xs">
                                <p className="text-slate-500">两个排序各自独立筛选；没有匹配项时不会输出空行。</p>
                                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                                    <input type="text" placeholder="输出行名称" value={modal.dualSortRows.likeLabel} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, likeLabel: e.target.value } })} className="h-8 px-2 border border-slate-300 rounded text-slate-800 placeholder:text-slate-500 bg-white" />
                                    <select value={modal.dualSortRows.likeColumn} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, likeColumn: e.target.value } })} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white">
                                        <option value="">选择点赞列</option>{allColumns.map(col => <option key={col} value={col}>{col}</option>)}
                                    </select>
                                    <button type="button" onClick={() => update({ dualSortRows: { ...modal.dualSortRows, likeDescending: !modal.dualSortRows.likeDescending } })} className="h-8 px-2 rounded bg-white border border-slate-300 text-slate-800 font-medium">{modal.dualSortRows.likeDescending ? '高→低' : '低→高'}</button>
                                    <input type="number" placeholder="最低点赞" value={modal.dualSortRows.likeMin} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, likeMin: e.target.value } })} className="h-8 px-2 border border-slate-300 rounded text-slate-800 placeholder:text-slate-500 bg-white" />
                                    <input type="number" placeholder="最高点赞" value={modal.dualSortRows.likeMax} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, likeMax: e.target.value } })} className="h-8 px-2 border border-slate-300 rounded text-slate-800 placeholder:text-slate-500 bg-white" />
                                </div>
                                <select value={modal.dualSortRows.likeValueFilter} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, likeValueFilter: e.target.value } })} className="h-8 w-full px-2 border border-slate-300 rounded text-slate-800 bg-white"><option value="">不按具体值筛选</option>{(filterValuesByColumn[modal.dualSortRows.likeColumn] || []).map(value => <option key={value} value={value}>{value}</option>)}</select>
                                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                                    <input type="text" placeholder="输出行名称" value={modal.dualSortRows.timeLabel} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, timeLabel: e.target.value } })} className="h-8 px-2 border border-slate-300 rounded text-slate-800 placeholder:text-slate-500 bg-white" />
                                    <select value={modal.dualSortRows.timeColumn} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, timeColumn: e.target.value } })} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white">
                                        <option value="">选择时间列</option>{allColumns.map(col => <option key={col} value={col}>{col}</option>)}
                                    </select>
                                    <button type="button" onClick={() => update({ dualSortRows: { ...modal.dualSortRows, timeDescending: !modal.dualSortRows.timeDescending } })} className="h-8 px-2 rounded bg-white border border-slate-300 text-slate-800 font-medium">{modal.dualSortRows.timeDescending ? '新→旧' : '旧→新'}</button>
                                    <input type="date" value={modal.dualSortRows.timeStart} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, timeStart: e.target.value } })} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white" />
                                    <input type="date" value={modal.dualSortRows.timeEnd} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, timeEnd: e.target.value } })} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white" />
                                </div>
                                <select value={modal.dualSortRows.timeValueFilter} onChange={e => update({ dualSortRows: { ...modal.dualSortRows, timeValueFilter: e.target.value } })} className="h-8 w-full px-2 border border-slate-300 rounded text-slate-800 bg-white"><option value="">不按具体值筛选</option>{(filterValuesByColumn[modal.dualSortRows.timeColumn] || []).map(value => <option key={value} value={value}>{value}</option>)}</select>
                                {modal.dualSortRows.extraRows.map((rule, index) => <div key={rule.id} className="border-t border-indigo-200 pt-3 space-y-2">
                                    <div className="flex gap-2">
                                        <input type="text" placeholder="自定义输出行名称" value={rule.label} onChange={e => { const extraRows = [...modal.dualSortRows.extraRows]; extraRows[index] = { ...rule, label: e.target.value }; update({ dualSortRows: { ...modal.dualSortRows, extraRows } }); }} className="h-8 min-w-0 flex-1 px-2 border border-slate-300 rounded text-slate-800 placeholder:text-slate-500 bg-white" />
                                        <button type="button" onClick={() => update({ dualSortRows: { ...modal.dualSortRows, extraRows: modal.dualSortRows.extraRows.filter(item => item.id !== rule.id) } })} className="h-8 px-2 text-red-600 border border-red-200 rounded">删除</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2"><select value={rule.column} onChange={e => { const extraRows = [...modal.dualSortRows.extraRows]; extraRows[index] = { ...rule, column: e.target.value }; update({ dualSortRows: { ...modal.dualSortRows, extraRows } }); }} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white"><option value="">选择排序列</option>{allColumns.map(col => <option key={col} value={col}>{col}</option>)}</select><select value={rule.kind} onChange={e => { const extraRows = [...modal.dualSortRows.extraRows]; extraRows[index] = { ...rule, kind: e.target.value as 'number' | 'date' }; update({ dualSortRows: { ...modal.dualSortRows, extraRows } }); }} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white"><option value="number">数字排序</option><option value="date">时间排序</option></select></div>
                                    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { const extraRows = [...modal.dualSortRows.extraRows]; extraRows[index] = { ...rule, descending: !rule.descending }; update({ dualSortRows: { ...modal.dualSortRows, extraRows } }); }} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white">{rule.descending ? (rule.kind === 'date' ? '新→旧' : '高→低') : (rule.kind === 'date' ? '旧→新' : '低→高')}</button><select value={rule.valueFilter} onChange={e => { const extraRows = [...modal.dualSortRows.extraRows]; extraRows[index] = { ...rule, valueFilter: e.target.value }; update({ dualSortRows: { ...modal.dualSortRows, extraRows } }); }} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white"><option value="">不按具体值筛选</option>{(filterValuesByColumn[rule.column] || []).map(value => <option key={value} value={value}>{value}</option>)}</select><input type={rule.kind === 'date' ? 'date' : 'number'} placeholder="最小值" value={rule.min} onChange={e => { const extraRows = [...modal.dualSortRows.extraRows]; extraRows[index] = { ...rule, min: e.target.value }; update({ dualSortRows: { ...modal.dualSortRows, extraRows } }); }} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white" /><input type={rule.kind === 'date' ? 'date' : 'number'} placeholder="最大值" value={rule.max} onChange={e => { const extraRows = [...modal.dualSortRows.extraRows]; extraRows[index] = { ...rule, max: e.target.value }; update({ dualSortRows: { ...modal.dualSortRows, extraRows } }); }} className="h-8 px-2 border border-slate-300 rounded text-slate-800 bg-white" /></div>
                                </div>)}
                                <button type="button" onClick={() => update({ dualSortRows: { ...modal.dualSortRows, extraRows: [...modal.dualSortRows.extraRows, { id: `${Date.now()}-${modal.dualSortRows.extraRows.length}`, label: '自定义排序', column: '', kind: 'number', descending: true, min: '', max: '', valueFilter: '' }] } })} className="w-full h-8 border border-dashed border-indigo-300 rounded text-indigo-700 hover:bg-indigo-100">+ 新增输出行</button>
                            </div>}
                        </div>
                        </>
                    )}

                    <div className={`text-xs ${groupColumnName ? 'text-slate-500' : 'text-red-500 font-medium'}`}>
                        {groupColumnName
                            ? `当前: 按 "${groupColumnName}" 分组`
                            : <><AlertCircle size={12} className="inline mr-1" /> 未设置分组列 - 将把所有图片作为一个组导出</>
                        }
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={modal.splitGroupColumns} onChange={e => update({ splitGroupColumns: e.target.checked })} className="w-4 h-4 text-purple-600 rounded" />
                        <span className="text-sm text-slate-700">多级分组拆分为多个列</span>
                        <span className="text-[10px] text-slate-400">关闭时合并为一个单元格</span>
                    </label>

                    {/* Classification overrides toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={modal.applyClassificationOverrides}
                            onChange={(e) => update({ applyClassificationOverrides: e.target.checked })}
                            className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm text-slate-700">应用分类调整</span>
                        {classificationOverridesCount > 0 && (
                            <span className="text-[10px] text-purple-500">({classificationOverridesCount} 项)</span>
                        )}
                    </label>

                    {/* Extra data columns toggle */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={modal.includeExtraData}
                                onChange={(e) => update({ includeExtraData: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">包含额外数据列</span>
                        </label>

                        {modal.includeExtraData && (
                            <div className="ml-6 p-3 bg-slate-50 rounded-lg space-y-2 max-h-52 overflow-auto">
                                <p className="text-xs text-slate-500 mb-2">选择要导出的列 <span className="text-slate-400">(可拖拽调整顺序)</span>:</p>
                                {/* 未选中的列 */}
                                {[...allColumns.filter(col => col !== imageColumn && !modal.selectedColumns.includes(col)), ...(!modal.selectedColumns.includes('__THUMBNAIL__') ? ['__THUMBNAIL__'] : [])].map(col => (
                                    <label key={col} className="flex items-center gap-2 cursor-pointer py-0.5">
                                        <input
                                            type="checkbox"
                                            checked={false}
                                            onChange={() => {
                                                update({ selectedColumns: [...modal.selectedColumns, col] });
                                            }}
                                            className="w-3.5 h-3.5 text-blue-500 rounded focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-slate-400">
                                            {col === '__THUMBNAIL__' ? '缩略图 (公式)' : col}
                                        </span>
                                    </label>
                                ))}
                                {/* 已选中的列 - 可拖拽排序 */}
                                {modal.selectedColumns.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                        <p className="text-[10px] text-blue-500 font-medium mb-1.5">已选列（导出顺序从上到下）:</p>
                                        {modal.selectedColumns.map((col, idx) => (
                                            <div
                                                key={col}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', String(idx));
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    (e.currentTarget as HTMLElement).style.opacity = '0.5';
                                                }}
                                                onDragEnd={(e) => {
                                                    (e.currentTarget as HTMLElement).style.opacity = '1';
                                                }}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.dataTransfer.dropEffect = 'move';
                                                    (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.08)';
                                                }}
                                                onDragLeave={(e) => {
                                                    (e.currentTarget as HTMLElement).style.background = '';
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    (e.currentTarget as HTMLElement).style.background = '';
                                                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                                    if (isNaN(fromIdx) || fromIdx === idx) return;
                                                    const cols = [...modal.selectedColumns];
                                                    const [moved] = cols.splice(fromIdx, 1);
                                                    cols.splice(idx, 0, moved);
                                                    update({ selectedColumns: cols });
                                                }}
                                                className="flex items-center gap-2 py-1 px-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-blue-50 transition-colors group"
                                            >
                                                <span className="text-slate-300 group-hover:text-slate-500 text-xs select-none" style={{ cursor: 'grab' }}>⠿</span>
                                                <input
                                                    type="checkbox"
                                                    checked={true}
                                                    onChange={() => {
                                                        update({ selectedColumns: modal.selectedColumns.filter(c => c !== col) });
                                                    }}
                                                    className="w-3.5 h-3.5 text-blue-500 rounded focus:ring-blue-500"
                                                />
                                                <span className={`text-xs font-medium flex-1 ${col === '__THUMBNAIL__' ? 'text-purple-600' : 'text-slate-700'}`}>
                                                    {col === '__THUMBNAIL__' ? '缩略图 (公式)' : col}
                                                </span>
                                                <input
                                                    type="color"
                                                    value={modal.rowColors.columnColors[col] || (col === '__THUMBNAIL__' ? '#F3E8FF' : '#FFFFFF')}
                                                    onChange={(e) => update({ rowColors: { columnColors: { ...modal.rowColors.columnColors, [col]: e.target.value } } })}
                                                    className="w-7 h-6 p-0.5 bg-white border border-slate-300 rounded cursor-pointer"
                                                    title={`设置「${col === '__THUMBNAIL__' ? '缩略图' : col}」输出行颜色`}
                                                />
                                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {idx > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const cols = [...modal.selectedColumns];
                                                                [cols[idx - 1], cols[idx]] = [cols[idx], cols[idx - 1]];
                                                                update({ selectedColumns: cols });
                                                            }}
                                                            className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-100"
                                                            title="上移"
                                                        >
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
                                                        </button>
                                                    )}
                                                    {idx < modal.selectedColumns.length - 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const cols = [...modal.selectedColumns];
                                                                [cols[idx], cols[idx + 1]] = [cols[idx + 1], cols[idx]];
                                                                update({ selectedColumns: cols });
                                                            }}
                                                            className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-100"
                                                            title="下移"
                                                        >
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {modal.selectedColumns.length > 0 && (
                                    <p className="text-xs text-blue-600 mt-2">
                                        {modal.layoutMode === 'columns'
                                            ? '布局: 每组为一列，顶部为标题，下方为图片与数据列 (按选中列顺序)'
                                            : modal.layoutMode === 'vertical'
                                            ? '布局: 分组标题行 → 明细行（按选中列顺序展示）'
                                            : '布局: 对于每一个项，按照选中列顺序分别作为横排展示'}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Empty rows configuration */}
                    {modal.layoutMode !== 'columns' && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">组间空行 (留白间距):</label>
                            <div className="flex items-center gap-2 flex-wrap">
                                {[0, 1, 2, 3, 5].map(n => (
                                    <button
                                        key={n}
                                        onClick={() => update({ emptyRowsBetweenGroups: n })}
                                        className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${modal.emptyRowsBetweenGroups === n
                                            ? 'bg-purple-500 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                                <input
                                    type="number"
                                    min="0"
                                    max="20"
                                    value={modal.emptyRowsBetweenGroups}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        update({ emptyRowsBetweenGroups: Math.min(20, Math.max(0, val)) });
                                    }}
                                    className="w-14 h-8 px-2 text-sm text-center border border-slate-300 rounded-lg focus:border-purple-500 focus:outline-none tooltip-bottom"
                                    data-tip="自定义空行"
                                />
                            </div>
                        </div>
                    )}

                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100 shrink-0">
                    <button
                        onClick={() => update({ open: false })}
                        className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => onCopy(
                            modal.columnsPerRow,
                            modal.includeExtraData,
                            modal.selectedColumns,
                            modal.applyClassificationOverrides,
                            modal.layoutMode,
                            modal.emptyRowsBetweenGroups
                            , modal.dualSortRows, modal.rowColors, modal.splitGroupColumns
                        )}
                        className="px-4 py-2 text-sm font-medium text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                    >
                        <ClipboardList size={12} className="inline mr-1" /> 复制视图布局
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
});
