import React, { createContext, useCallback, useContext, useState } from "react";

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {toasts.map((item, index) => (
        <div key={item.id} className="toast" style={{ top: 70 + index * 70 }}>
          <span>✓</span>
          <div>{item.message}</div>
        </div>
      ))}
    </ToastCtx.Provider>
  );
}
