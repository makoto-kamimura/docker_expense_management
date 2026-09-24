'use client';
import { useRef } from 'react';

/**
 * 確認ダイアログを挟むボタン (memo.md §15 / §16 の Approve・Merge 確認)。
 * onConfirm が false を返したらダイアログを閉じない。
 */
export default function ConfirmButton({
  label,
  className,
  title,
  children,
  confirmLabel,
  confirmClassName,
  disabled,
  onConfirm,
}: {
  label: React.ReactNode;
  className?: string;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  confirmClassName?: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog ref={ref} aria-labelledby={`dlg-${title}`}>
        <div className="dialog-body">
          <h2 id={`dlg-${title}`}>{title}</h2>
          {children}
        </div>
        <div className="dialog-foot">
          <button type="button" onClick={() => ref.current?.close()}>キャンセル</button>
          <button
            type="button"
            className={confirmClassName}
            disabled={disabled}
            onClick={async () => {
              ref.current?.close();
              await onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
