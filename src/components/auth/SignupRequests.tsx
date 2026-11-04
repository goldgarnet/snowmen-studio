import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../../api/signups';
import type { Profile } from '../../api/types';
import { useEscapeKey } from '../../lib/useEscapeKey';
import ConfirmModal from '../common/ConfirmModal';
import './SignupRequests.css';

// 가입 신청 목록. 상단 바에 있어 어느 화면에서든 볼 수 있고, 신청이 있을 때만 나타난다.
export default function SignupRequests() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listPendingSignups().then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener('focus', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  useEscapeKey(() => { if (!busyId && !rejecting) setOpen(false); }, open);

  const run = async (row: Profile, work: (id: string) => Promise<void>) => {
    setBusyId(row.id);
    setError(null);
    try {
      await work(row.id);
      setRows((cur) => cur.filter((r) => r.id !== row.id));
    } catch (e) {
      setError(`처리하지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
      setRejecting(null);
    }
  };

  if (rows.length === 0 && !open) return null;

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>가입 신청 {rows.length}</button>
      {open && createPortal(
        <div className="modal-backdrop" onClick={() => !busyId && setOpen(false)}>
          <div className="modal signup-requests" role="dialog" aria-label="가입 신청" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">가입 신청</h3>
            {error && <p className="signup-error" role="alert">{error}</p>}
            {rows.length === 0 ? (
              <p className="signup-none">대기 중인 신청이 없습니다.</p>
            ) : (
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>
                    <div>
                      <b>{row.name}</b>
                      <span>{row.username} · {new Date(row.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" disabled={busyId !== null} onClick={() => setRejecting(row)}>거절</button>
                    <button className="btn btn-primary btn-sm" disabled={busyId !== null} onClick={() => void run(row, api.approveSignup)}>
                      {busyId === row.id ? '처리 중…' : '승인'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" disabled={busyId !== null} onClick={() => setOpen(false)}>닫기</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {rejecting && createPortal(
        <ConfirmModal
          title="가입 거절"
          message={`${rejecting.name} (${rejecting.username}) 계정을 지웁니다. 같은 아이디로 다시 신청할 수 있습니다.`}
          confirmLabel="거절"
          danger
          busy={busyId !== null}
          onConfirm={() => void run(rejecting, api.rejectSignup)}
          onCancel={() => setRejecting(null)}
        />,
        document.body,
      )}
    </>
  );
}
