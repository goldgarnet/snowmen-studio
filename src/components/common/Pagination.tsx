import './Pagination.css';

interface PaginationProps {
  page: number;          // current page (1-based)
  pageCount: number;     // total number of pages
  onChange: (page: number) => void;
}

// Builds a compact list of page tokens with ellipses, e.g. 1 … 4 5 [6] 7 8 … 12.
function pageTokens(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const tokens: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) tokens.push('…');
  for (let p = start; p <= end; p++) tokens.push(p);
  if (end < pageCount - 1) tokens.push('…');
  tokens.push(pageCount);
  return tokens;
}

export default function Pagination({ page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;
  const tokens = pageTokens(page, pageCount);

  return (
    <nav className="pagination" aria-label="페이지">
      <button
        className="page-btn page-nav"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        ← 이전
      </button>
      {tokens.map((t, i) =>
        t === '…' ? (
          <span key={`e${i}`} className="page-ellipsis">…</span>
        ) : (
          <button
            key={t}
            className={`page-btn${t === page ? ' active' : ''}`}
            onClick={() => onChange(t)}
            aria-current={t === page ? 'page' : undefined}
          >
            {t}
          </button>
        )
      )}
      <button
        className="page-btn page-nav"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
      >
        다음 →
      </button>
    </nav>
  );
}
