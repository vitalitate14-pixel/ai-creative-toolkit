import React, { useState } from 'react';

interface Props {
  onInsert: (segmentsPerArticle: number, articleCount: number) => void;
}

export function createZeroTemplateSource(segmentsPerArticle: number, splitMarker: string): string {
  // 单段也保留拆分点，让已有拆分流程跳过最小字数限制。
  const source = Array.from({ length: segmentsPerArticle }, () => '0').join(`\n${splitMarker}\n`);
  return segmentsPerArticle === 1 ? `${source}\n${splitMarker}\n` : source;
}

export function CustomTemplateCopyGenerator({ onInsert }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [segmentsPerArticle, setSegmentsPerArticle] = useState('3');
  const [articleCount, setArticleCount] = useState('1');
  const segments = Number(segmentsPerArticle);
  const articles = Number(articleCount);
  const valid = Number.isSafeInteger(segments) && segments >= 1 && segments <= 1000
    && Number.isSafeInteger(articles) && articles >= 1 && articles <= 1000;

  return (
    <div className="mb-3 rounded border border-slate-600 bg-[#17253b] p-3">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="text-xs font-semibold text-blue-200">
        {expanded ? '▾' : '▸'} 自定义模板文案
      </button>
      {expanded && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-200">每篇片段数
            <input type="number" min="1" max="1000" step="1" value={segmentsPerArticle} onChange={event => setSegmentsPerArticle(event.target.value)} className="mt-1 block w-28 rounded border border-slate-500 bg-[#0b1628] px-2 py-1.5 text-sm text-slate-100" />
          </label>
          <label className="text-xs text-slate-200">插入篇数
            <input type="number" min="1" max="1000" step="1" value={articleCount} onChange={event => setArticleCount(event.target.value)} className="mt-1 block w-28 rounded border border-slate-500 bg-[#0b1628] px-2 py-1.5 text-sm text-slate-100" />
          </label>
          <button type="button" disabled={!valid} onClick={() => onInsert(segments, articles)} className="rounded border border-blue-400 bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">生成并插入片段</button>
          <div className="w-full text-[11px] text-slate-400" aria-live="polite">
            {valid ? `每段内容为 0；将插入 ${articles} 篇，每篇 ${segments} 段，共 ${segments * articles} 段。插入后下方表格会直接显示对应片段，无需再次拆分。` : '每篇片段数和插入篇数均需填写 1–1000 的整数。'}
          </div>
          {valid && <div className="max-h-24 w-full overflow-auto whitespace-pre-line rounded border border-slate-700 bg-[#0b1628] p-2 text-xs text-slate-200" aria-label="单篇文案预览">{Array.from({ length: Math.min(segments, 20) }, () => '0').join('\n')}{segments > 20 ? `\n… 共 ${segments} 段` : ''}</div>}
        </div>
      )}
    </div>
  );
}
