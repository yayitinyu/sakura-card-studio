"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
type Request = {
  title: string;
  initial?: string;
  danger?: boolean;
  resolve: (v: string | null) => void;
};
const Context = createContext<{
  ask: (title: string, initial?: string) => Promise<string | null>;
  confirm: (title: string) => Promise<boolean>;
} | null>(null);
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request>();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (request) {
      setValue(request.initial ?? "");
      ref.current?.showModal();
    } else ref.current?.close();
  }, [request]);
  function finish(value: string | null) {
    request?.resolve(value);
    setRequest(undefined);
  }
  const ask = (title: string, initial?: string) =>
    new Promise<string | null>((resolve) =>
      setRequest({ title, initial, resolve }),
    );
  return (
    <Context.Provider
      value={{
        ask,
        confirm: async (title) =>
          Boolean(
            await new Promise<string | null>((resolve) =>
              setRequest({ title, danger: true, resolve }),
            ),
          ),
      }}
    >
      {children}
      <dialog
        className="native-dialog"
        ref={ref}
        onCancel={(e) => {
          e.preventDefault();
          finish(null);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            finish(request?.danger ? "yes" : value);
          }}
        >
          <h2>{request?.title}</h2>
          {!request?.danger && (
            <label>
              项目名称
              <input
                autoFocus
                aria-label="项目名称"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={200}
              />
            </label>
          )}
          <div className="button-row">
            <button type="button" onClick={() => finish(null)}>
              取消
            </button>
            <button
              className={request?.danger ? "danger" : "primary"}
              type="submit"
            >
              {request?.danger ? "确认删除" : "确定"}
            </button>
          </div>
        </form>
      </dialog>
    </Context.Provider>
  );
}
export function useDialog() {
  const context = useContext(Context);
  if (!context) throw new Error("DialogProvider is required");
  return context;
}
