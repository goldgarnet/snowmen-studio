interface ConfirmModalProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Reusable confirmation dialog styled like the app's other modals (replaces
// browser confirm()/alert()). Uses the shared .modal-backdrop/.modal classes.
export default function ConfirmModal({
  title, message, confirmLabel = '확인', cancelLabel = '취소',
  danger, busy, onConfirm, onCancel,
}: ConfirmModalProps) {
  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="modal unsaved-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <p className="unsaved-text">{message}</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
