import type { MapStatus } from '../../api/types';

const CHOICES: { value: MapStatus; label: string }[] = [
  { value: 'accepted', label: '채택' },
  { value: 'held', label: '보류' },
  { value: 'rejected', label: '반려' },
];

interface StatusControlProps {
  value: MapStatus;
  disabled?: boolean;
  // Clicking the active choice again resets to 'pending' (미검토).
  onChange: (status: MapStatus) => void;
}

export default function StatusControl({ value, disabled, onChange }: StatusControlProps) {
  return (
    <div className="status-control">
      {CHOICES.map((c) => (
        <button
          key={c.value}
          className={`status-btn status-${c.value}${value === c.value ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(value === c.value ? 'pending' : c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
