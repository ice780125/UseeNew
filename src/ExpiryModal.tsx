import { MEMBERSHIP_LAST_DAY_MSG } from "./auth";

type Props = {
  expiresAt: number | null;
  onDismiss: () => void;
};

export function ExpiryModal({ expiresAt, onDismiss }: Props) {
  const expiryLabel =
    expiresAt != null
      ? new Date(expiresAt).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="expiry-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="expiry-modal-title" className="modal-title">
          {MEMBERSHIP_LAST_DAY_MSG}
        </h2>
        <p className="modal-body">
          今天为会员<strong>最后一天</strong>
          {expiryLabel ? (
            <>
              ，到期时间：<strong>{expiryLabel}</strong>
            </>
          ) : null}
          。到期后将无法继续使用，请尽快续费。
        </p>
        <button type="button" className="primary modal-btn" onClick={onDismiss}>
          我知道了
        </button>
      </div>
    </div>
  );
}
