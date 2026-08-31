import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  Search,
  Trash2,
  ZoomIn,
} from "@/components/icons/lucideControls";
import {
  Check,
  Loader2,
  UserCheck,
  UserX,
} from "@/components/icons/lucideStatus";
import {
  Brain,
  Database,
  Image,
  Palette,
  Settings,
  ShieldCheck,
  Users,
} from "@/components/icons/lucideContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ImageLightbox from "../common/ImageLightbox";
import LlmModelSettings from "./LlmModelSettings";
import UserFilterSelect from "./UserFilterSelect";
import useAuth from "../../hooks/useAuth";
import {
  deleteAdminStyle,
  getAdminHistoryImage,
  getAdminModelSettings,
  getAdminStylePreview,
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
  { id: "llm", label: "分析模型", icon: Brain },
  { id: "styles", label: "風格庫", icon: Palette },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "管理員" },
  { value: "editor", label: "編輯者" },
  { value: "viewer", label: "檢視者" },
];

const USER_SEARCH_DEBOUNCE_MS = 300;

/** Entra ID and Google accounts get their own filter; unknown providers only surface when present. */
const PROVIDER_FILTERS = [
  { id: "entra", label: "Entra ID" },
  { id: "google", label: "Google" },
  { id: "unknown", label: "未記錄" },
];

const providerLabel = (authProvider) =>
  PROVIDER_FILTERS.find((group) => group.id === authProvider)?.label || "—";

/** Creation workflows that write into the history, mirroring api/_shared/historySource.js. */
const HISTORY_SOURCE_FILTERS = [
  { id: "general", label: "一般創作" },
  { id: "document", label: "文件分鏡" },
  { id: "image-transform", label: "圖片轉換" },
  { id: "unknown", label: "未記錄" },
];

const historySourceLabel = (source) =>
  HISTORY_SOURCE_FILTERS.find((item) => item.id === (source || "unknown"))?.label || "—";

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

const DEFAULT_USER_PAGE_SIZE = 10;
const USER_PAGE_SIZE_OPTIONS = [10, 25, 50];
const EMPTY_PAGINATION = {
  page: 1,
  pageSize: DEFAULT_USER_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

const normalizePaginatedData = (data, fallbackPageSize = DEFAULT_USER_PAGE_SIZE) => {
  if (Array.isArray(data)) {
    return {
      items: data,
      pagination: {
        ...EMPTY_PAGINATION,
        pageSize: data.length || fallbackPageSize,
        total: data.length,
      },
    };
  }

  return {
    items: data?.items || [],
    pagination: {
      ...EMPTY_PAGINATION,
      pageSize: fallbackPageSize,
      ...(data?.pagination || {}),
    },
  };
};

const PageSizeSelect = ({ value, onChange, disabled, ariaLabel }) => (
  <label className="flex items-center gap-2 self-end text-xs text-muted-foreground sm:self-auto">
    <span>每頁顯示</span>
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={ariaLabel}
    >
      {USER_PAGE_SIZE_OPTIONS.map((pageSize) => (
        <option key={pageSize} value={pageSize}>
          {pageSize} 項
        </option>
      ))}
    </select>
  </label>
);

const adminImageCache = new Map();

const loadAdminImage = async (id, fetcher) => {
  if (adminImageCache.has(id)) return adminImageCache.get(id);
  const data = await fetcher(id);
  const imageUrl = data?.imageUrl || "";
  adminImageCache.set(id, imageUrl);
  return imageUrl;
};

const AdminRemoteImage = ({ id, fetcher, alt, width, height, className, placeholderClassName }) => {
  const [source, setSource] = useState(() => adminImageCache.get(id) || "");
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAdminImage(id, fetcher)
      .then((imageUrl) => {
        if (cancelled) return;
        setSource(imageUrl);
        setHasFailed(false);
      })
      .catch(() => {
        if (!cancelled) setHasFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, fetcher]);

  if (hasFailed) {
    return (
      <span className={cn(placeholderClassName, "flex items-center justify-center bg-muted text-[10px] text-muted-foreground")}>
        載入失敗
      </span>
    );
  }

  if (!source) {
    return (
      <span
        className={cn(placeholderClassName, "block animate-pulse bg-muted motion-reduce:animate-none")}
        aria-hidden="true"
      />
    );
  }

  return <img src={source} alt={alt} width={width} height={height} className={className} />;
};

const AdminTablePagination = ({ pagination, itemLabel, isRefreshing, onPageChange }) => {
  if (pagination.total <= 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        顯示 {(pagination.page - 1) * pagination.pageSize + 1}–
        {Math.min(pagination.page * pagination.pageSize, pagination.total)}
        {itemLabel}，共 {pagination.total}{itemLabel}
      </p>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={isRefreshing || pagination.page <= 1}
          aria-label={`上一頁${itemLabel}`}
          className="h-9 w-9"
        >
          <ChevronLeft className="icon-sm" aria-hidden="true" />
        </Button>
        <span className="min-w-20 text-center tabular-nums">
          第 {pagination.page} / {pagination.totalPages} 頁
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={isRefreshing || pagination.page >= pagination.totalPages}
          aria-label={`下一頁${itemLabel}`}
          className="h-9 w-9"
        >
          <ChevronRight className="icon-sm" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user, profile, handleLogout } = useAuth();
  const [activeSection, setActiveSection] = useState("users");
  const [users, setUsers] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyPagination, setHistoryPagination] = useState(EMPTY_PAGINATION);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_USER_PAGE_SIZE);
  const [previewHistoryId, setPreviewHistoryId] = useState(null);
  const [styles, setStyles] = useState([]);
  const [stylesPagination, setStylesPagination] = useState(EMPTY_PAGINATION);
  const [stylesPageSize, setStylesPageSize] = useState(DEFAULT_USER_PAGE_SIZE);
  const [userOptions, setUserOptions] = useState([]);
  const [userPagination, setUserPagination] = useState(EMPTY_PAGINATION);
  const [userPageSize, setUserPageSize] = useState(DEFAULT_USER_PAGE_SIZE);
  const [modelPolicy, setModelPolicy] = useState(emptyPolicy);
  const [supportedModels, setSupportedModels] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [historySource, setHistorySource] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [previewSource, setPreviewSource] = useState("");
  const [loadingSection, setLoadingSection] = useState("users");
  const [isLoadingUserOptions, setIsLoadingUserOptions] = useState(false);
  const [hasLoadedUserOptions, setHasLoadedUserOptions] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const requestedSectionsRef = useRef(new Set());
  const appliedUserSearchRef = useRef("");

  const loadUsersSection = useCallback(
    async ({ page = 1, pageSize = DEFAULT_USER_PAGE_SIZE, search = "" } = {}) => {
      const data = normalizePaginatedData(
        await listAdminUsers({ page, pageSize, search }),
        pageSize
      );
      appliedUserSearchRef.current = search;
      setUsers(data.items);
      setUserPagination(data.pagination);
      setUserPageSize(data.pagination.pageSize);
    },
    []
  );

  const loadHistorySection = useCallback(
    async ({ userId = "", source = "", page = 1, pageSize = DEFAULT_USER_PAGE_SIZE } = {}) => {
      const data = normalizePaginatedData(
        await listAdminHistory({ userId, source, page, pageSize }),
        pageSize
      );
      setHistoryItems(data.items);
      setHistoryPagination(data.pagination);
      setHistoryPageSize(data.pagination.pageSize);
    },
    []
  );

  const loadStylesSection = useCallback(
    async ({ userId = "", page = 1, pageSize = DEFAULT_USER_PAGE_SIZE } = {}) => {
      const data = normalizePaginatedData(
        await listAdminStyles({ userId, page, pageSize }),
        pageSize
      );
      setStyles(data.items);
      setStylesPagination(data.pagination);
      setStylesPageSize(data.pagination.pageSize);
    },
    []
  );

  const loadSettingsSection = useCallback(async () => {
    const data = await getAdminModelSettings();
    setModelPolicy(data?.modelPolicy || emptyPolicy);
    setSupportedModels(data?.supportedModels || []);
  }, []);

  useEffect(() => {
    const sectionId = activeSection;
    const loaders = {
      users: () =>
        loadUsersSection({ pageSize: userPageSize, search: appliedUserSearchRef.current }),
      history: () =>
        loadHistorySection({
          userId: selectedUserId,
          source: historySource,
          pageSize: historyPageSize,
        }),
      styles: () => loadStylesSection({ userId: selectedUserId, pageSize: stylesPageSize }),
      models: () => loadSettingsSection(),
    };
    const loader = loaders[sectionId];
    if (!loader || requestedSectionsRef.current.has(sectionId)) return;

    requestedSectionsRef.current.add(sectionId);
    void Promise.resolve()
      .then(() => {
        setLoadingSection(sectionId);
        setErrorMessage("");
        return loader();
      })
      .catch((error) => {
        requestedSectionsRef.current.delete(sectionId);
        setErrorMessage(error.message || "管理資料載入失敗");
      })
      .finally(() => {
        setLoadingSection((current) => (current === sectionId ? null : current));
      });
  }, [
    activeSection,
    selectedUserId,
    historySource,
    userPageSize,
    historyPageSize,
    stylesPageSize,
    loadUsersSection,
    loadHistorySection,
    loadStylesSection,
    loadSettingsSection,
  ]);

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

  const runRefresh = useCallback(async (loader, failureMessage) => {
    setIsRefreshing(true);
    setErrorMessage("");
    try {
      await loader();
    } catch (error) {
      setErrorMessage(error.message || failureMessage);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleUserPageChange = (page) => {
    if (page < 1 || page > userPagination.totalPages || page === userPagination.page) return;
    void runRefresh(
      () =>
        loadUsersSection({
          page,
          pageSize: userPagination.pageSize || userPageSize,
          search: appliedUserSearchRef.current,
        }),
      "使用者清單載入失敗"
    );
  };

  const handleUserPageSizeChange = (event) => {
    const pageSize = Number(event.target.value);
    if (!USER_PAGE_SIZE_OPTIONS.includes(pageSize) || pageSize === userPageSize) return;
    void runRefresh(
      () => loadUsersSection({ pageSize, search: appliedUserSearchRef.current }),
      "使用者清單載入失敗"
    );
  };

  useEffect(() => {
    if (activeSection !== "users") return undefined;
    const search = userSearch.trim();
    if (search === appliedUserSearchRef.current) return undefined;
    const timer = setTimeout(() => {
      void runRefresh(
        () => loadUsersSection({ pageSize: userPageSize, search }),
        "使用者清單載入失敗"
      );
    }, USER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [activeSection, userSearch, userPageSize, loadUsersSection, runRefresh]);

  const handleHistoryPageChange = (page) => {
    if (
      page < 1 ||
      page > historyPagination.totalPages ||
      page === historyPagination.page
    ) {
      return;
    }
    void runRefresh(
      () =>
        loadHistorySection({
          userId: selectedUserId,
          source: historySource,
          page,
          pageSize: historyPagination.pageSize,
        }),
      "生成紀錄載入失敗"
    );
  };

  const handleHistoryPageSizeChange = (event) => {
    const pageSize = Number(event.target.value);
    if (!USER_PAGE_SIZE_OPTIONS.includes(pageSize) || pageSize === historyPageSize) return;
    void runRefresh(
      () => loadHistorySection({ userId: selectedUserId, source: historySource, pageSize }),
      "生成紀錄載入失敗"
    );
  };

  const handleHistorySourceChange = (event) => {
    const nextSource = event.target.value;
    if (nextSource === historySource) return;
    requestedSectionsRef.current.delete("history");
    setHistorySource(nextSource);
  };

  const handleStylesPageChange = (page) => {
    if (
      page < 1 ||
      page > stylesPagination.totalPages ||
      page === stylesPagination.page
    ) {
      return;
    }
    void runRefresh(
      () =>
        loadStylesSection({
          userId: selectedUserId,
          page,
          pageSize: stylesPagination.pageSize,
        }),
      "風格資料載入失敗"
    );
  };

  const handleStylesPageSizeChange = (event) => {
    const pageSize = Number(event.target.value);
    if (!USER_PAGE_SIZE_OPTIONS.includes(pageSize) || pageSize === stylesPageSize) return;
    void runRefresh(
      () => loadStylesSection({ userId: selectedUserId, pageSize }),
      "風格資料載入失敗"
    );
  };

  const handleUserFilterChange = (nextUserId) => {
    if (nextUserId === selectedUserId) return;
    requestedSectionsRef.current.delete("history");
    requestedSectionsRef.current.delete("styles");
    setSelectedUserId(nextUserId);
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

  const userFilterGroups = useMemo(() => {
    const source = userOptions.length > 0 ? userOptions : users;
    return PROVIDER_FILTERS.map((group) => ({
      ...group,
      users: source.filter(
        (item) => (item.authProvider || "unknown") === group.id
      ),
    })).filter((group) => group.id !== "unknown" || group.users.length > 0);
  }, [userOptions, users]);

  const viewableHistoryItems = useMemo(
    () => historyItems.filter((item) => item.hasImage),
    [historyItems]
  );
  const previewIndex = viewableHistoryItems.findIndex(
    (item) => item.id === previewHistoryId
  );
  const previewItem = previewIndex >= 0 ? viewableHistoryItems[previewIndex] : null;

  const openHistoryPreview = (historyId) => {
    setPreviewHistoryId(historyId);
    setPreviewSource(adminImageCache.get(historyId) || "");
  };

  useEffect(() => {
    if (!previewHistoryId) return undefined;
    let cancelled = false;
    void loadAdminImage(previewHistoryId, getAdminHistoryImage)
      .then((imageUrl) => {
        if (!cancelled) setPreviewSource(imageUrl);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(error.message || "生成圖片載入失敗");
      });
    return () => {
      cancelled = true;
    };
  }, [previewHistoryId]);
  const previewDetails = previewItem
    ? [
        {
          label: "使用者",
          value: [previewItem.userDisplayName, previewItem.userEmail]
            .filter(Boolean)
            .join("\n"),
        },
        { label: "功能", value: historySourceLabel(previewItem.source) },
        { label: "模型", value: modelLabel(previewItem.model || "gemini-imagen") },
        { label: "風格", value: previewItem.styleName },
        { label: "時間", value: formatDate(previewItem.createdAt) },
        { label: "完整 Prompt", value: previewItem.fullPrompt },
        { label: "使用者腳本", value: previewItem.userScript },
      ]
    : [];

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
              <ArrowLeft className="icon-md" aria-hidden="true" />
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15">
              <ShieldCheck className="icon-md" aria-hidden="true" />
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
                <h1 className="text-lg font-semibold">{activeSectionInfo?.label}</h1>
                {selectedUser && (
                  <p className="text-xs text-muted-foreground">
                    目前篩選：{selectedUser.displayName}（{selectedUser.email}）
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeSection === "history" && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>功能</span>
                    <select
                      value={historySource}
                      onChange={handleHistorySourceChange}
                      disabled={isRefreshing}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="依功能篩選生成紀錄"
                    >
                      <option value="">全部功能</option>
                      {HISTORY_SOURCE_FILTERS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(activeSection === "history" || activeSection === "styles") &&
                  userFilterGroups.map((group) => (
                    <UserFilterSelect
                      key={group.id}
                      label={group.label}
                      users={group.users}
                      value={
                        group.users.some((item) => item.id === selectedUserId)
                          ? selectedUserId
                          : ""
                      }
                      onChange={handleUserFilterChange}
                      disabled={isLoadingUserOptions}
                      allLabel="全部使用者"
                    />
                  ))}
                {(isRefreshing || loadingSection) && (
                  <Loader2 className="icon-sm animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="載入中" />
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
                <Check className="icon-sm" aria-hidden="true" />
                {successMessage}
              </div>
            )}

            {loadingSection === activeSection ? (
              <Card>
                <CardContent className="flex min-h-56 items-center justify-center">
                  <Loader2 className="icon-lg animate-spin text-primary motion-reduce:animate-none" aria-label="載入管理資料" />
                </CardContent>
              </Card>
            ) : (
              <>
                {activeSection === "users" && (
                  <Card>
                    <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="icon-sm text-primary" aria-hidden="true" />
                        使用者清單
                        <Badge variant="secondary" className="ml-auto">{userPagination.total}</Badge>
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 icon-sm -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <input
                            type="search"
                            value={userSearch}
                            onChange={(event) => setUserSearch(event.target.value)}
                            placeholder="搜尋姓名或 Email"
                            aria-label="搜尋使用者"
                            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
                          />
                        </div>
                        <PageSizeSelect
                          value={userPageSize}
                          onChange={handleUserPageSizeChange}
                          disabled={isRefreshing}
                          ariaLabel="每頁顯示使用者數量"
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <table className="w-full min-w-[980px] text-sm">
                        <thead className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 font-medium">使用者</th>
                            <th className="px-5 py-3 font-medium">登入方式</th>
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
                              <td className="px-5 py-3 text-xs text-muted-foreground">
                                {providerLabel(item.authProvider)}
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
                                    <UserX className="icon-sm" aria-hidden="true" />
                                  ) : (
                                    <UserCheck className="icon-sm" aria-hidden="true" />
                                  )}
                                  {item.isActive ? "停用" : "啟用"}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {users.length === 0 && (
                        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                          {userSearch.trim()
                            ? "找不到符合搜尋條件的使用者。"
                            : "目前沒有使用者資料。"}
                        </p>
                      )}
                      <AdminTablePagination
                        pagination={userPagination}
                        itemLabel="位使用者"
                        isRefreshing={isRefreshing}
                        onPageChange={handleUserPageChange}
                      />
                    </CardContent>
                  </Card>
                )}

                {activeSection === "history" && (
                  <Card>
                    <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="icon-sm text-primary" aria-hidden="true" />
                        使用者生成圖片紀錄
                        <Badge variant="secondary" className="ml-auto">{historyPagination.total}</Badge>
                      </CardTitle>
                      <PageSizeSelect
                        value={historyPageSize}
                        onChange={handleHistoryPageSizeChange}
                        disabled={isRefreshing}
                        ariaLabel="每頁顯示生成紀錄數量"
                      />
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <table className="w-full min-w-[960px] text-sm">
                        <thead className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-5 py-3 font-medium">圖片</th>
                            <th className="px-5 py-3 font-medium">使用者</th>
                            <th className="px-5 py-3 font-medium">功能</th>
                            <th className="px-5 py-3 font-medium">模型</th>
                            <th className="px-5 py-3 font-medium">Prompt</th>
                            <th className="px-5 py-3 font-medium">時間</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {historyItems.map((item) => (
                            <tr key={item.id} className="align-top hover:bg-muted/30">
                              <td className="px-5 py-3">
                                {item.hasImage ? (
                                  <button
                                    type="button"
                                    onClick={() => openHistoryPreview(item.id)}
                                    aria-label={`放大查看 ${item.userDisplayName} 的生成圖片`}
                                    className="group relative block h-14 w-20 overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                  >
                                    <AdminRemoteImage
                                      id={item.id}
                                      fetcher={getAdminHistoryImage}
                                      alt=""
                                      width={80}
                                      height={54}
                                      className="h-full w-full object-cover"
                                      placeholderClassName="h-full w-full"
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                      <ZoomIn className="icon-sm text-white" aria-hidden="true" />
                                    </span>
                                  </button>
                                ) : (
                                  <span className="flex h-14 w-20 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">無預覽</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <p className="font-medium">{item.userDisplayName}</p>
                                <p className="text-xs text-muted-foreground">{item.userEmail}</p>
                              </td>
                              <td className="px-5 py-3">
                                <Badge variant="secondary">{historySourceLabel(item.source)}</Badge>
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
                      <AdminTablePagination
                        pagination={historyPagination}
                        itemLabel="筆紀錄"
                        isRefreshing={isRefreshing}
                        onPageChange={handleHistoryPageChange}
                      />
                    </CardContent>
                  </Card>
                )}

                {activeSection === "models" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="icon-sm text-primary" aria-hidden="true" />
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
                                    {isAllowed && <Check className="icon-sm" aria-hidden="true" />}
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
                        {isSavingPolicy ? <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="icon-sm" aria-hidden="true" />}
                        儲存模型政策
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {activeSection === "llm" && <LlmModelSettings />}

                {activeSection === "styles" && (
                  <Card>
                    <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Palette className="icon-sm text-primary" aria-hidden="true" />
                        使用者儲存風格庫
                        <Badge variant="secondary" className="ml-auto">{stylesPagination.total}</Badge>
                      </CardTitle>
                      <PageSizeSelect
                        value={stylesPageSize}
                        onChange={handleStylesPageSizeChange}
                        disabled={isRefreshing}
                        ariaLabel="每頁顯示風格數量"
                      />
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
                                  {style.hasPreview ? (
                                    <AdminRemoteImage
                                      id={style.id}
                                      fetcher={getAdminStylePreview}
                                      alt=""
                                      width={48}
                                      height={48}
                                      className="h-12 w-12 rounded-lg border border-border object-cover"
                                      placeholderClassName="h-12 w-12 rounded-lg border border-border"
                                    />
                                  ) : (
                                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted"><Palette className="icon-sm text-muted-foreground" aria-hidden="true" /></span>
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
                                  <Trash2 className="icon-sm" aria-hidden="true" />
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
                      <AdminTablePagination
                        pagination={stylesPagination}
                        itemLabel="筆風格"
                        isRefreshing={isRefreshing}
                        onPageChange={handleStylesPageChange}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      {previewItem && (
        <ImageLightbox
          src={previewSource}
          alt={`${previewItem.userDisplayName} 的生成圖片`}
          details={previewDetails}
          downloadUrl={previewSource}
          downloadName={`pixora-${previewItem.id}.png`}
          position={{ index: previewIndex, total: viewableHistoryItems.length }}
          onPrev={
            previewIndex > 0
              ? () => openHistoryPreview(viewableHistoryItems[previewIndex - 1].id)
              : undefined
          }
          onNext={
            previewIndex < viewableHistoryItems.length - 1
              ? () => openHistoryPreview(viewableHistoryItems[previewIndex + 1].id)
              : undefined
          }
          onClose={() => setPreviewHistoryId(null)}
        />
      )}
    </div>
  );
}
