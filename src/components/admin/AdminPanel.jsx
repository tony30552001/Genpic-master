import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Image,
  Loader2,
  Palette,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  UserCheck,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import useAuth from "../../hooks/useAuth";
import {
  deleteAdminStyle,
  getAdminModelSettings,
  listAdminHistory,
  listAdminStyles,
  listAdminUsers,
  listAdminUserOptions,
  updateAdminModelSettings,
  updateAdminUserRole,
  updateAdminUserStatus,
} from "../../services/adminService";
import { IMAGE_MODEL_OPTIONS } from "../../config";

const SECTIONS = [
  { id: "users", label: "使用者", icon: Users },
  { id: "history", label: "生成紀錄", icon: Image },
  { id: "models", label: "模型政策", icon: Settings },
  { id: "styles", label: "風格庫", icon: Palette },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "管理員" },
  { value: "editor", label: "編輯者" },
  { value: "viewer", label: "檢視者" },
];

const formatDate = (value) => {
  if (!value?.seconds) return "—";
  return new Date(value.seconds * 1000).toLocaleString("zh-TW");
};

const modelLabel = (modelId) =>
  IMAGE_MODEL_OPTIONS.find((model) => model.id === modelId)?.label || modelId;

const emptyPolicy = {
  allowedModels: ["gemini-imagen"],
  defaultModel: "gemini-imagen",
};

const USER_PAGE_SIZE = 25;
const EMPTY_USER_PAGINATION = {
  page: 1,
  pageSize: USER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

const normalizeUserPage = (data) => {
  if (Array.isArray(data)) {
    return {
      items: data,
      pagination: {
        ...EMPTY_USER_PAGINATION,
        pageSize: data.length || USER_PAGE_SIZE,
        total: data.length,
      },
    };
  }

  return {
    items: data?.items || [],
    pagination: {
      ...EMPTY_USER_PAGINATION,
      ...(data?.pagination || {}),
    },
  };
};

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user, profile, handleLogout } = useAuth();
  const [activeSection, setActiveSection] = useState("users");
  const [users, setUsers] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [styles, setStyles] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [userPagination, setUserPagination] = useState(EMPTY_USER_PAGINATION);
  const [modelPolicy, setModelPolicy] = useState(emptyPolicy);
  const [supportedModels, setSupportedModels] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingUserOptions, setIsLoadingUserOptions] = useState(false);
  const [hasLoadedUserOptions, setHasLoadedUserOptions] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      const [userData, historyData, styleData, settingsData] = await Promise.all([
        listAdminUsers({ page: 1, pageSize: USER_PAGE_SIZE }),
        listAdminHistory(),
        listAdminStyles(),
        getAdminModelSettings(),
      ]);
      const userPage = normalizeUserPage(userData);
      setUsers(userPage.items);
      setUserPagination(userPage.pagination);
      setHistoryItems(historyData || []);
      setStyles(styleData || []);
      setModelPolicy(settingsData?.modelPolicy || emptyPolicy);
      setSupportedModels(settingsData?.supportedModels || []);
    } catch (error) {
      setErrorMessage(error.message || "管理資料載入失敗");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);

  const loadUserOptions = useCallback(async () => {
    setIsLoadingUserOptions(true);
    setErrorMessage("");
    try {
      const data = await listAdminUserOptions();
      setUserOptions(data || []);
    } catch (error) {
      setErrorMessage(error.message || "使用者篩選清單載入失敗");
    } finally {
      setHasLoadedUserOptions(true);
      setIsLoadingUserOptions(false);
    }
  }, []);

  useEffect(() => {
    if (
      (activeSection === "history" || activeSection === "styles") &&
      !hasLoadedUserOptions
    ) {
      void Promise.resolve().then(loadUserOptions);
    }
  }, [activeSection, hasLoadedUserOptions, loadUserOptions]);

  const handleUserPageChange = async (page) => {
    if (page < 1 || page > userPagination.totalPages || page === userPagination.page) return;
    setIsRefreshing(true);
    setErrorMessage("");
    try {
      const data = normalizeUserPage(
        await listAdminUsers({ page, pageSize: USER_PAGE_SIZE })
      );
      setUsers(data.items);
      setUserPagination(data.pagination);
    } catch (error) {
      setErrorMessage(error.message || "使用者清單載入失敗");
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshFilteredData = useCallback(async (userId) => {
    setIsRefreshing(true);
    setErrorMessage("");
    try {
      const [historyData, styleData] = await Promise.all([
        listAdminHistory(userId),
        listAdminStyles(userId),
      ]);
      setHistoryItems(historyData || []);
      setStyles(styleData || []);
    } catch (error) {
      setErrorMessage(error.message || "篩選資料載入失敗");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleUserFilterChange = (event) => {
    const userId = event.target.value;
    setSelectedUserId(userId);
    refreshFilteredData(userId);
  };

  const handleRoleChange = async (userId, role) => {
    setErrorMessage("");
    try {
      const updated = await updateAdminUserRole(userId, role);
      setUsers((previous) =>
        previous.map((item) => (item.id === userId ? { ...item, ...updated } : item))
      );
      setUserOptions((previous) =>
        previous.map((item) => (item.id === userId ? { ...item, ...updated } : item))
      );
    } catch (error) {
      setErrorMessage(error.message || "使用者角色更新失敗");
    }
  };

  const handleUserStatusChange = async (item) => {
    const nextIsActive = !item.isActive;
    if (
      !nextIsActive &&
      !window.confirm(`確定要停用 ${item.displayName} 嗎？停用後該使用者將無法使用系統。`)
    ) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    try {
      const updated = await updateAdminUserStatus(item.id, nextIsActive);
      setUsers((previous) =>
        previous.map((userItem) => (userItem.id === item.id ? { ...userItem, ...updated } : userItem))
      );
      setUserOptions((previous) =>
        previous.map((userItem) => (userItem.id === item.id ? { ...userItem, ...updated } : userItem))
      );
      setSuccessMessage(`${item.displayName} 已${nextIsActive ? "啟用" : "停用"}。`);
    } catch (error) {
      setErrorMessage(error.message || "使用者狀態更新失敗");
    }
  };

  const handleAllowedModelToggle = (modelId) => {
    setModelPolicy((previous) => {
      const allowedModels = previous.allowedModels || [];
      if (allowedModels.includes(modelId)) {
        if (allowedModels.length === 1) return previous;
        const nextAllowedModels = allowedModels.filter((id) => id !== modelId);
        return {
          ...previous,
          allowedModels: nextAllowedModels,
          defaultModel: nextAllowedModels.includes(previous.defaultModel)
            ? previous.defaultModel
            : nextAllowedModels[0],
        };
      }
      return {
        ...previous,
        allowedModels: [...allowedModels, modelId],
      };
    });
  };

  const handleSavePolicy = async () => {
    setIsSavingPolicy(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await updateAdminModelSettings({
        allowedModels: modelPolicy.allowedModels,
        defaultModel: modelPolicy.defaultModel,
      });
      setModelPolicy(result?.modelPolicy || modelPolicy);
      setSuccessMessage("模型政策已更新，下一次生成將套用新設定。");
    } catch (error) {
      setErrorMessage(error.message || "模型政策更新失敗");
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handleDeleteStyle = async (styleId) => {
    if (!window.confirm("確定要刪除這個風格嗎？相關歷史紀錄仍會保留。")) return;
    setErrorMessage("");
    try {
      await deleteAdminStyle(styleId);
      setStyles((previous) => previous.filter((style) => style.id !== styleId));
    } catch (error) {
      setErrorMessage(error.message || "風格刪除失敗");
    }
  };

  const selectedUser = useMemo(
    () => [...userOptions, ...users].find((item) => item.id === selectedUserId),
    [selectedUserId, userOptions, users]
  );
  const filterUsers = userOptions.length > 0 ? userOptions : users;

  const activeSectionInfo = SECTIONS.find((section) => section.id === activeSection);

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b border-border bg-primary text-primary-foreground shadow-sm">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="h-10 w-10 shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              aria-label="返回創作平台"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">Administrator 管理中心</p>
              <p className="truncate text-xs text-primary-foreground/70">
                {profile?.displayName || user?.displayName || "系統管理員"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={handleLogout}
            className="shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            登出
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-2">
          <Badge variant="outline" className="w-fit border-primary/30 bg-primary/5 text-primary">
            Administrator
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">平台管理</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            查看租戶內的使用者、生成紀錄與風格資產，並由管理員統一決定圖片生成模型。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-border bg-card p-2 shadow-sm">
            <nav className="space-y-1" aria-label="管理功能">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    type="button"
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      activeSection === section.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    aria-current={activeSection === section.id ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{activeSectionInfo?.label}</h2>
                {selectedUser && (
                  <p className="text-xs text-muted-foreground">
                    目前篩選：{selectedUser.displayName}（{selectedUser.email}）
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(activeSection === "history" || activeSection === "styles") && (
                  <select
                    value={selectedUserId}
                    onChange={handleUserFilterChange}
                    disabled={isLoadingUserOptions}
                    className="h-9 max-w-[240px] rounded-lg border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="依使用者篩選"
                  >
                    <option value="">全部使用者</option>
                    {filterUsers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName} · {item.email}{item.isActive ? "" : "（已停用）"}
                      </option>
                    ))}
                  </select>
                )}
                {(isRefreshing || isLoading) && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="載入中" />
                )}
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300" role="status">
                <Check className="h-4 w-4" aria-hidden="true" />
                {successMessage}
              </div>
            )}

            {isLoading ? (
              <Card>
                <CardContent className="flex min-h-56 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-label="載入管理資料" />
                </CardContent>
              </Card>
            ) : (
              <>
                {activeSection === "users" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                        使用者清單
                        <Badge variant="secondary" className="ml-auto">{userPagination.total}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <table className="w-full min-w-[880px] text-sm">
                        <thead className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 font-medium">使用者</th>
                            <th className="px-5 py-3 font-medium">角色</th>
                            <th className="px-5 py-3 font-medium">狀態</th>
                            <th className="px-5 py-3 font-medium">生成圖片</th>
                            <th className="px-5 py-3 font-medium">儲存風格</th>
                            <th className="px-5 py-3 font-medium">加入時間</th>
                            <th className="px-5 py-3 font-medium">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {users.map((item) => (
                            <tr
                              key={item.id}
                              className={cn("hover:bg-muted/30", !item.isActive && "bg-muted/20")}
                            >
                              <td className="px-5 py-3">
                                <p className="font-medium">{item.displayName}</p>
                                <p className="text-xs text-muted-foreground">{item.email}</p>
                              </td>
                              <td className="px-5 py-3">
                                <select
                                  value={item.role}
                                  onChange={(event) => handleRoleChange(item.id, event.target.value)}
                                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={`${item.displayName} 的角色`}
                                >
                                  {ROLE_OPTIONS.map((role) => (
                                    <option key={role.value} value={role.value}>{role.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-5 py-3">
                                <Badge variant={item.isActive ? "secondary" : "destructive"}>
                                  {item.isActive ? "啟用" : "已停用"}
                                </Badge>
                              </td>
                              <td className="px-5 py-3 tabular-nums">{item.generationCount}</td>
                              <td className="px-5 py-3 tabular-nums">{item.styleCount}</td>
                              <td className="px-5 py-3 text-xs text-muted-foreground">{formatDate(item.createdAt)}</td>
                              <td className="px-5 py-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUserStatusChange(item)}
                                  disabled={item.id === profile?.id && item.isActive}
                                  title={item.id === profile?.id && item.isActive ? "不能停用目前登入的管理員帳號" : undefined}
                                  aria-label={`${item.isActive ? "停用" : "啟用"} ${item.displayName}`}
                                  className={cn(
                                    "gap-1.5",
                                    item.isActive
                                      ? "text-destructive hover:bg-destructive/5 hover:text-destructive"
                                      : "text-success hover:bg-success/5 hover:text-success"
                                  )}
                                >
                                  {item.isActive ? (
                                    <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                                  ) : (
                                    <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  {item.isActive ? "停用" : "啟用"}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {users.length === 0 && (
                        <p className="px-5 py-10 text-center text-sm text-muted-foreground">目前沒有使用者資料。</p>
                      )}
                      {userPagination.total > 0 && (
                        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                          <p>
                            顯示 {(userPagination.page - 1) * userPagination.pageSize + 1}–
                            {Math.min(userPagination.page * userPagination.pageSize, userPagination.total)}
                            位，共 {userPagination.total} 位使用者
                          </p>
                          <div className="flex items-center justify-between gap-2 sm:justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => handleUserPageChange(userPagination.page - 1)}
                              disabled={isRefreshing || userPagination.page <= 1}
                              aria-label="上一頁使用者"
                              className="h-9 w-9"
                            >
                              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <span className="min-w-20 text-center tabular-nums">
                              第 {userPagination.page} / {userPagination.totalPages} 頁
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => handleUserPageChange(userPagination.page + 1)}
                              disabled={isRefreshing || userPagination.page >= userPagination.totalPages}
                              aria-label="下一頁使用者"
                              className="h-9 w-9"
                            >
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {activeSection === "history" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="h-4 w-4 text-primary" aria-hidden="true" />
                        使用者生成圖片紀錄
                        <Badge variant="secondary" className="ml-auto">{historyItems.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <table className="w-full min-w-[860px] text-sm">
                        <thead className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 font-medium">圖片</th>
                            <th className="px-5 py-3 font-medium">使用者</th>
                            <th className="px-5 py-3 font-medium">模型</th>
                            <th className="px-5 py-3 font-medium">Prompt</th>
                            <th className="px-5 py-3 font-medium">時間</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {historyItems.map((item) => (
                            <tr key={item.id} className="align-top hover:bg-muted/30">
                              <td className="px-5 py-3">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt=""
                                    width={80}
                                    height={54}
                                    loading="lazy"
                                    className="h-14 w-20 rounded-lg border border-border object-cover"
                                  />
                                ) : (
                                  <span className="flex h-14 w-20 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">無預覽</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <p className="font-medium">{item.userDisplayName}</p>
                                <p className="text-xs text-muted-foreground">{item.userEmail}</p>
                              </td>
                              <td className="px-5 py-3">
                                <Badge variant="outline">{modelLabel(item.model || "gemini-imagen")}</Badge>
                              </td>
                              <td className="max-w-[360px] px-5 py-3">
                                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground" title={item.fullPrompt || item.userScript || ""}>
                                  {item.fullPrompt || item.userScript || "—"}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground">{formatDate(item.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {historyItems.length === 0 && (
                        <p className="px-5 py-10 text-center text-sm text-muted-foreground">目前沒有生成紀錄。</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {activeSection === "models" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
                        圖片生成模型政策
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                        使用者不會看到模型選擇器，所有一般創作、文件批次生成與圖片轉換都會使用下方的預設模型。
                      </div>
                      <div className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold">開放模型</h3>
                          <p className="text-xs text-muted-foreground">至少保留一個模型；開放清單供未來政策擴充使用。</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {supportedModels.map((modelId) => {
                            const model = IMAGE_MODEL_OPTIONS.find((item) => item.id === modelId);
                            const isAllowed = modelPolicy.allowedModels?.includes(modelId);
                            return (
                              <button
                                type="button"
                                key={modelId}
                                onClick={() => handleAllowedModelToggle(modelId)}
                                aria-pressed={isAllowed}
                                className={cn(
                                  "rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  isAllowed
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold">{model?.label || modelId}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{model?.description || modelId}</p>
                                  </div>
                                  <span className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                                    isAllowed ? "border-primary bg-primary text-primary-foreground" : "border-border"
                                  )}>
                                    {isAllowed && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="max-w-md space-y-2">
                        <label htmlFor="admin-default-model" className="text-sm font-semibold">預設生成模型</label>
                        <select
                          id="admin-default-model"
                          value={modelPolicy.defaultModel}
                          onChange={(event) => setModelPolicy((previous) => ({ ...previous, defaultModel: event.target.value }))}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {(modelPolicy.allowedModels || []).map((modelId) => (
                            <option key={modelId} value={modelId}>{modelLabel(modelId)}</option>
                          ))}
                        </select>
                      </div>
                      <Button type="button" onClick={handleSavePolicy} disabled={isSavingPolicy} className="gap-2">
                        {isSavingPolicy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                        儲存模型政策
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {activeSection === "styles" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
                        使用者儲存風格庫
                        <Badge variant="secondary" className="ml-auto">{styles.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <table className="w-full min-w-[780px] text-sm">
                        <thead className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 font-medium">風格</th>
                            <th className="px-5 py-3 font-medium">擁有者</th>
                            <th className="px-5 py-3 font-medium">分類 / 狀態</th>
                            <th className="px-5 py-3 font-medium">使用次數</th>
                            <th className="px-5 py-3 font-medium">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {styles.map((style) => (
                            <tr key={style.id} className="align-top hover:bg-muted/30">
                              <td className="px-5 py-3">
                                <div className="flex items-start gap-3">
                                  {style.previewUrl ? (
                                    <img src={style.previewUrl} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 rounded-lg border border-border object-cover" />
                                  ) : (
                                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted"><Palette className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></span>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-medium">{style.name}</p>
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{style.description || style.prompt}</p>
                                    {style.tags?.length > 0 && <p className="mt-1 truncate text-[11px] text-muted-foreground">#{style.tags.join(" #")}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <p className="font-medium">{style.authorName}</p>
                                <p className="text-xs text-muted-foreground">{style.authorEmail}</p>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  <Badge variant="secondary">{style.category}</Badge>
                                  <Badge variant="outline">{style.visibility === "shared" ? "共享" : "私人"}</Badge>
                                </div>
                              </td>
                              <td className="px-5 py-3 tabular-nums">
                                {style.usageCount}
                                <span className="ml-1 text-xs text-muted-foreground">次</span>
                              </td>
                              <td className="px-5 py-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteStyle(style.id)}
                                  className="gap-1.5 text-destructive hover:bg-destructive/5 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  刪除
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {styles.length === 0 && (
                        <p className="px-5 py-10 text-center text-sm text-muted-foreground">目前沒有風格資料。</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
