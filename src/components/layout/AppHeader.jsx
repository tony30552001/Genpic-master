import React from "react";
import { Layout, LogIn, LogOut } from "lucide-react";

export default function AppHeader({ user, onLogin, onLogout }) {
  return (
    <div className="p-6 border-b border-border bg-gradient-to-r from-blue-700 to-sky-500 text-white">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Layout className="w-6 h-6" />
            企業風格圖產生器
          </h1>
          <p className="text-xs text-blue-100 mt-1 opacity-80">
            Powered by Gemini & Imagen
          </p>
        </div>
        <div className="ml-4">
          {user && !user.isAnonymous ? (
            <div className="flex items-center gap-3 bg-white/10 px-3 py-1.5 rounded-full border border-white/20 backdrop-blur-sm">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold leading-none mb-0.5">
                  {user.displayName || "User"}
                </span>
                <button
                  onClick={onLogout}
                  className="text-[10px] opacity-80 hover:opacity-100 hover:text-red-200 transition-colors flex items-center gap-1"
                >
                  <LogOut className="w-2.5 h-2.5" /> 登出
                </button>
              </div>
              <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-700 border-2 border-white/30 overflow-hidden shadow-inner">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="User"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  user.displayName?.[0] || "U"
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="bg-white text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              title="使用公司帳號登入以同步紀錄"
            >
              <LogIn className="w-4 h-4" /> 登入
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
