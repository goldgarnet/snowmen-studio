import { colorOf, type DesignColor, type TagOption } from '../../api/design';

// 분류 · 우선 순위 · 담당자 · 상태 같은 값을 노션처럼 색 태그로 보여 준다.

export function Tag({ color, children, title }: { color: DesignColor; children: React.ReactNode; title?: string }) {
  return <span className={`dw-tag c-${color}`} title={title}>{children}</span>;
}

/** 색 태그처럼 보이는 선택 칸. 목록에 없는 값도 지우지 않고 그대로 보여 준다. */
export function TagSelect({ value, options, label, emptyLabel, onChange }: {
  value: string;
  options: TagOption[];
  label: string;
  emptyLabel?: string;
  onChange: (value: string) => void;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <select
      className={`dw-tag dw-tag-select c-${value ? colorOf(options, value) : 'gray'}${value ? '' : ' is-empty'}`}
      aria-label={label}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {!known && value && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label ?? o.value}</option>)}
    </select>
  );
}
