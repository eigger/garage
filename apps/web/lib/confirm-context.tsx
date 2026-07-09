"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useSettings } from "./i18n/settings-context";

interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PendingConfirm extends ConfirmOptions {
  message: string;
  resolve: (result: boolean) => void;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

interface ConfirmContextValue {
  confirm: ConfirmFn;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useSettings();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ message, resolve, ...options });
    });
  }, []);

  function settle(result: boolean) {
    pending?.resolve(result);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="modal-backdrop" onClick={() => settle(false)}>
          <div
            className="modal-card"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{pending.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" className="btn-secondary" onClick={() => settle(false)}>
                {pending.cancelLabel ?? t("cancel")}
              </button>
              <button type="button" className="btn-danger" onClick={() => settle(true)}>
                {pending.confirmLabel ?? t("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
