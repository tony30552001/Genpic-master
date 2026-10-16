import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  Search,
  Trash2,
  X,
  ZoomIn,
} from "@/components/icons/lucideControls";
import {
  AlertCircle,
  Check,
  Loader2,
  UserCheck,
  UserX,
} from "@/components/icons/lucideStatus";
import {
  Brain,
  Image,
  Palette,
  Settings,
  ShieldCheck,
  Users,
} from "@/components/icons/lucideContent";
import PixoraWordmark from "@/components/icons/PixoraWordmark";
import AccountMenu from "@/components/common/AccountMenu";
import SegmentedTabs from "@/components/common/SegmentedTabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HISTORY_SOURCE_LABELS, getHistorySourceLabel } from "@/lib/historySource";
import ImageLightbox from "../common/ImageLightbox";
import { AnimatePresence } from "motion/react";
import LlmModelSettings from "./LlmModelSettings";
import ImageModelSettings from "./ImageModelSettings";
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

const SECTIONS = [
  { id: "users", label: "使用者", icon: Users, description: "管理帳號角色與存取權限。" },
  { id: "history", label: "生成紀錄", icon: Image, description: "檢視所有使用者的生成結果與使用的 Prompt。" },
  { id: "models", label: "模型政策", icon: Settings, description: "登錄圖片模型，並決定開放與預設使用的模型。" },
  { id: "llm", label: "分析模型", icon: Brain, description: "設定文件分析與簡報授稿使用的語言模型。" },
  { id: "styles", label: "風格庫", icon: Palette, description: "管理使用者儲存與共享的視覺風格。" },
];

const NATIVE_SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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

const formatDate = (value) => {
  if (!value?.seconds) return "—";
  return new Date(value.seconds * 1000).toLocaleString("zh-TW");
};

const emptyPolicy = {
  allowedModels: [],
  defaultModel: null,
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
  <label className="flex items-center gap-2 text-xs text-muted-foreground">
    <span>每頁顯示</span>
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={NATIVE_SELECT_CLASS}
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
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p className="tabular-nums">
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

const AdminTable = ({ columns, minWidth, isEmpty, emptyMessage, footer, children }) => (
  <div className="overflow-hidden rounded-xl border border-border bg-card">
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", minWidth)}>
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            {columns.map((column) => {
              const { label, align } = typeof column === "string" ? { label: column } : column;
              return (
                <th
                  key={label}
                  scope="col"
                  className={cn("whitespace-nowrap px-4 py-3 font-medium", align === "right" && "text-right")}
                >
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
    {isEmpty && (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    )}
    {footer}
  </div>
);

const AdminHeader = ({ user, onBack, onLogout }) => (
  <header className="relative shrink-0 bg-background pt-[env(safe-area-inset-top)] text-foreground">
    <div className="flex h-12 min-w-0 items-center justify-between gap-2 px-3 sm:px-4 lg:h-14 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <PixoraWordmark />
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <span aria-hidden="true">/</span>
          <ShieldCheck className="icon-sm shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-foreground">管理中心</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="返回創作平台"
          className="gap-1.5 rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <ArrowLeft className="icon-sm" aria-hidden="true" />
          <span className="hidden sm:inline">返回創作</span>
        </Button>
        <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
        <AccountMenu user={user} onLogout={onLogout} />
      </div>
    </div>
  </header>
);

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user, profile, handleLogout, refreshProfile } = useAuth();
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
  const [policyModels, setPolicyModels] = useState(null);
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
  const [pendingAction, setPendingAction] = useState(null);
  const requestedSectionsRef = useRef(new Set());
  const appliedUserSearchRef = useRef("");
  const models = policyModels ?? profile?.imageModels ?? [];
  const modelLabel = (modelKey) =>
    models.find((model) => model.modelKey === modelKey)?.label || modelKey || "未紀錄";
  const allowedRegisteredModels = models.filter((model) => modelPolicy.allowedModels.includes(model.modelKey));
  const missingPolicyKeys = modelPolicy.allowedModels.filter((key) => !models.some((model) => model.modelKey === key));
  const isPolicyValid = policyModels !== null
    && modelPolicy.allowedModels.length > 0
    && missingPolicyKeys.length === 0
    && allowedRegisteredModels.some((model) => model.modelKey === modelPolicy.defaultModel);

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
    setPolicyModels(null);
    const data = await getAdminModelSettings();
    setModelPolicy(data.modelPolicy);
    setPolicyModels(data.models);
  }, []);

  const handleCatalogChange = useCallback(async () => {
    await Promise.all([loadSettingsSection(), refreshProfile()]);
  }, [loadSettingsSection, refreshProfile]);

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

  const applyUserStatusChange = async (item) => {
    const nextIsActive = !item.isActive;
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

  const handleUserStatusChange = (item) => {
    if (item.isActive) {
      setPendingAction({ kind: "deactivate-user", item });
      return;
    }
    void applyUserStatusChange(item);
  };

  const handleAllowedModelToggle = (modelId) => {
    setModelPolicy((previous) => {
      const allowedModels = previous.allowedModels || [];
      if (allowedModels.includes(modelId)) {
        const nextAllowedModels = allowedModels.filter((id) => id !== modelId);
        return {
          ...previous,
          allowedModels: nextAllowedModels,
          defaultModel: nextAllowedModels.includes(previous.defaultModel)
            ? previous.defaultModel
            : null,
        };
      }
      return {
        ...previous,
        allowedModels: [...allowedModels, modelId],
      };
    });
  };

  const handleSavePolicy = async () => {
    if (!isPolicyValid) {
      setErrorMessage("請先登錄模型，並從開放清單選擇預設模型。");
      return;
    }
    setIsSavingPolicy(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await updateAdminModelSettings({
        allowedModels: modelPolicy.allowedModels,
        defaultModel: modelPolicy.defaultModel,
      });
      setModelPolicy(result.modelPolicy);
      setPolicyModels(result.models);
      setSuccessMessage("模型政策已更新，下一次生成將套用新設定。");
      try {
        await refreshProfile();
      } catch (error) {
        setErrorMessage(`政策已儲存，但使用者設定重新載入失敗：${error.message}。請重新整理頁面。`);
      }
    } catch (error) {
      setErrorMessage(error.message || "模型政策更新失敗");
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const applyDeleteStyle = async (style) => {
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await deleteAdminStyle(style.id);
      setStyles((previous) => previous.filter((item) => item.id !== style.id));
      setSuccessMessage(`已刪除風格「${style.name}」。`);
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
        { label: "功能", value: getHistorySourceLabel(previewItem.source) },
        { label: "模型", value: modelLabel(previewItem.model) },
        { label: "風格", value: previewItem.styleName },
        { label: "時間", value: formatDate(previewItem.createdAt) },
        { label: "完整 Prompt", value: previewItem.fullPrompt },
        { label: "使用者腳本", value: previewItem.userScript },
      ]
    : [];

  const activeSectionInfo = SECTIONS.find((section) => section.id === activeSection);
  const isSectionLoading = loadingSection === activeSection;
  const sectionCount = {
    users: userPagination.total,
    history: historyPagination.total,
    styles: stylesPagination.total,
  }[activeSection];
  const showsUserFilter = activeSection === "history" || activeSection === "styles";

  const handleSectionChange = (sectionId) => {
    if (sectionId === activeSection) return;
    setErrorMessage("");
    setSuccessMessage("");
    setActiveSection(sectionId);
  };

  const handleConfirmPendingAction = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action?.kind === "deactivate-user") void applyUserStatusChange(action.item);
    if (action?.kind === "delete-style") void applyDeleteStyle(action.style);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] font-sans text-foreground">
      <AdminHeader user={user} onBack={() => navigate("/")} onLogout={handleLogout} />

      <main className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md">
          <div className="mx-auto max-w-[1760px] overflow-x-auto px-4 py-2 lg:px-8 2xl:px-12">
            <SegmentedTabs
              tabs={SECTIONS}
              activeTab={activeSection}
              onTabChange={handleSectionChange}
              ariaLabel="管理功能"
              className="w-max min-w-full sm:min-w-0"
              renderIcon={(section) => {
                const Icon = section.icon;
                return <Icon className="icon-sm" aria-hidden="true" />;
              }}
            />
          </div>
        </div>

        <div
          key={activeSection}
          className="mx-auto max-w-[1760px] space-y-5 px-4 pb-10 pt-4 animate-in fade-in duration-(--motion-enter) ease-emphasized motion-reduce:animate-none lg:px-8 2xl:px-12"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{activeSectionInfo?.label}</h1>
                {sectionCount !== undefined && !isSectionLoading && (
                  <Badge variant="secondary" className="tabular-nums">{sectionCount}</Badge>
                )}
                {(isRefreshing || loadingSection) && (
                  <Loader2 className="icon-sm animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="載入中" />
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{activeSectionInfo?.description}</p>
            </div>
            {showsUserFilter && selectedUser && (
              <div className="flex min-w-0 items-center gap-1 self-start rounded-full border border-primary/30 bg-primary/5 py-1 pl-3 pr-1 text-xs sm:self-auto">
                <span className="min-w-0 truncate">
                  篩選：<span className="font-medium">{selectedUser.displayName}</span>
                  <span className="text-muted-foreground">（{selectedUser.email}）</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleUserFilterChange("")}
                  className="size-6 shrink-0 rounded-full"
                  aria-label="清除使用者篩選"
                >
                  <X className="icon-xs" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>

          {errorMessage && (
            <div
              className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-2.5 text-sm text-destructive animate-in fade-in slide-in-from-top-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none"
              role="alert"
            >
              <AlertCircle className="icon-sm shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div
              className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-4 py-2.5 text-sm text-foreground animate-in fade-in slide-in-from-top-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none"
              role="status"
            >
              <Check className="icon-sm shrink-0 text-success" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {(activeSection === "users" || showsUserFilter) && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {activeSection === "users" && (
                <div className="relative min-w-0 sm:w-72">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 icon-sm -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="搜尋姓名或 Email"
                    aria-label="搜尋使用者"
                    autoComplete="off"
                    className="h-9 pl-9"
                  />
                </div>
              )}
              {activeSection === "history" && (
                <select
                  value={historySource}
                  onChange={handleHistorySourceChange}
                  disabled={isRefreshing}
                  className={NATIVE_SELECT_CLASS}
                  aria-label="依功能篩選生成紀錄"
                >
                  <option value="">全部功能</option>
                  {HISTORY_SOURCE_LABELS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
              {showsUserFilter &&
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
              <div className="sm:ml-auto">
                {activeSection === "users" && (
                  <PageSizeSelect
                    value={userPageSize}
                    onChange={handleUserPageSizeChange}
                    disabled={isRefreshing}
                    ariaLabel="每頁顯示使用者數量"
                  />
                )}
                {activeSection === "history" && (
                  <PageSizeSelect
                    value={historyPageSize}
                    onChange={handleHistoryPageSizeChange}
                    disabled={isRefreshing}
                    ariaLabel="每頁顯示生成紀錄數量"
                  />
                )}
                {activeSection === "styles" && (
                  <PageSizeSelect
                    value={stylesPageSize}
                    onChange={handleStylesPageSizeChange}
                    disabled={isRefreshing}
                    ariaLabel="每頁顯示風格數量"
                  />
                )}
              </div>
            </div>
          )}

          {isSectionLoading ? (
            <div className="flex min-h-56 items-center justify-center rounded-xl border border-border bg-card">
              <Loader2 className="icon-lg animate-spin text-primary motion-reduce:animate-none" aria-label="載入管理資料" />
            </div>
          ) : (
            <>
              {activeSection === "users" && (
                <AdminTable
                  minWidth="min-w-[980px]"
                  columns={["使用者", "登入方式", "角色", "狀態", "生成圖片", "儲存風格", "加入時間", { label: "操作", align: "right" }]}
                  isEmpty={users.length === 0}
                  emptyMessage={userSearch.trim() ? "找不到符合搜尋條件的使用者。" : "目前沒有使用者資料。"}
                  footer={
                    <AdminTablePagination
                      pagination={userPagination}
                      itemLabel="位使用者"
                      isRefreshing={isRefreshing}
                      onPageChange={handleUserPageChange}
                    />
                  }
                >
                  {users.map((item) => {
                    const isSelf = item.id === profile?.id && item.isActive;
                    return (
                      <tr
                        key={item.id}
                        className={cn("transition-colors hover:bg-muted/30", !item.isActive && "bg-muted/20 text-muted-foreground")}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{item.displayName}</p>
                          <p className="text-xs text-muted-foreground">{item.email}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {providerLabel(item.authProvider)}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={item.role}
                            onChange={(event) => handleRoleChange(item.id, event.target.value)}
                            className={cn(NATIVE_SELECT_CLASS, "h-8")}
                            aria-label={`${item.displayName} 的角色`}
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role.value} value={role.value}>{role.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
                            <span
                              aria-hidden="true"
                              className={cn("size-1.5 rounded-full", item.isActive ? "bg-success" : "bg-destructive")}
                            />
                            {item.isActive ? "啟用" : "已停用"}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{item.generationCount}</td>
                        <td className="px-4 py-3 tabular-nums">{item.styleCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(item.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUserStatusChange(item)}
                            disabled={isSelf}
                            title={isSelf ? "不能停用目前登入的管理員帳號" : undefined}
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
                    );
                  })}
                </AdminTable>
              )}

              {activeSection === "history" && (
                <AdminTable
                  minWidth="min-w-[960px]"
                  columns={["圖片", "使用者", "功能", "模型", "Prompt", "時間"]}
                  isEmpty={historyItems.length === 0}
                  emptyMessage="目前沒有生成紀錄。"
                  footer={
                    <AdminTablePagination
                      pagination={historyPagination}
                      itemLabel="筆紀錄"
                      isRefreshing={isRefreshing}
                      onPageChange={handleHistoryPageChange}
                    />
                  }
                >
                  {historyItems.map((item) => (
                    <tr key={item.id} className="align-top transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {item.hasImage ? (
                          <button
                            type="button"
                            onClick={() => openHistoryPreview(item.id)}
                            aria-label={`放大查看 ${item.userDisplayName} 的生成圖片`}
                            className="group relative block h-14 w-20 overflow-hidden rounded-lg border border-border press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                            <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-(--motion-hover) ease-emphasized group-hover:opacity-100 group-focus-visible:opacity-100">
                              <ZoomIn className="icon-sm text-white" aria-hidden="true" />
                            </span>
                          </button>
                        ) : (
                          <span className="flex h-14 w-20 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">無預覽</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.userDisplayName}</p>
                        <p className="text-xs text-muted-foreground">{item.userEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{getHistorySourceLabel(item.source)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{modelLabel(item.model)}</Badge>
                      </td>
                      <td className="max-w-[360px] px-4 py-3">
                        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground" title={item.fullPrompt || item.userScript || ""}>
                          {item.fullPrompt || item.userScript || "—"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </AdminTable>
              )}

              {activeSection === "models" && (
                <div className="space-y-6">
                  <ImageModelSettings onCatalogChange={handleCatalogChange} />
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">圖片生成模型政策</CardTitle>
                      <CardDescription>
                        使用者不會看到模型選擇器，所有創作（含附圖修改）與文件批次生成都會使用這裡的預設模型。
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {policyModels === null ? (
                        <div className="space-y-2">
                          <p role="alert" className="text-sm text-destructive">政策資料尚未載入，請重試。</p>
                          <Button type="button" variant="outline" disabled={isRefreshing} onClick={() => runRefresh(loadSettingsSection, "政策資料載入失敗")}>重新載入政策</Button>
                        </div>
                      ) : models.length === 0 || missingPolicyKeys.length > 0 ? (
                        <p role="status" className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm text-foreground [overflow-wrap:anywhere]">需要設定圖片模型。請先登錄模型；未登錄的政策識別碼：{missingPolicyKeys.join("、") || "無"}。新增目錄不會自動切換預設模型。</p>
                      ) : null}
                      <div className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold">開放模型</h3>
                          <p className="text-xs text-muted-foreground">至少開放一個已登錄模型，並明確選擇預設模型後儲存。</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {(policyModels || []).map((model) => {
                            const modelId = model.modelKey;
                            const isAllowed = modelPolicy.allowedModels?.includes(modelId);
                            return (
                              <button
                                type="button"
                                key={modelId}
                                onClick={() => handleAllowedModelToggle(modelId)}
                                aria-pressed={isAllowed}
                                disabled={isSavingPolicy || isRefreshing}
                                className={cn(
                                  "min-w-0 rounded-xl border p-4 text-left press-feedback transition-colors duration-(--motion-hover) ease-emphasized focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                                  isAllowed
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                                    <p className="text-sm font-semibold">{model.label}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{modelId}</p>
                                  </div>
                                  <span className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--motion-hover) ease-emphasized",
                                    isAllowed ? "border-primary bg-primary text-primary-foreground" : "border-border"
                                  )}>
                                    {isAllowed && <Check className="icon-sm" aria-hidden="true" />}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                          {policyModels !== null && missingPolicyKeys.map((key) => (
                            <Button key={key} type="button" variant="outline" className="h-auto min-w-0 whitespace-normal [overflow-wrap:anywhere]" disabled={isSavingPolicy} onClick={() => handleAllowedModelToggle(key)}>移除未登錄模型 {key}</Button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
                        <div className="w-full max-w-md space-y-2">
                          <label htmlFor="admin-default-model" className="text-sm font-semibold">預設生成模型</label>
                          <select
                            id="admin-default-model"
                            value={allowedRegisteredModels.some((model) => model.modelKey === modelPolicy.defaultModel) ? modelPolicy.defaultModel : ""}
                            disabled={isSavingPolicy || isRefreshing || policyModels === null}
                            onChange={(event) => setModelPolicy((previous) => ({ ...previous, defaultModel: event.target.value }))}
                            className={cn(NATIVE_SELECT_CLASS, "h-10 w-full text-sm")}
                          >
                            <option value="">請選擇已開放的模型</option>
                            {allowedRegisteredModels.map((model) => (
                              <option key={model.modelKey} value={model.modelKey}>{model.label}</option>
                            ))}
                          </select>
                        </div>
                        <Button type="button" onClick={handleSavePolicy} disabled={isSavingPolicy || !isPolicyValid || isRefreshing} className="shrink-0 gap-2">
                          {isSavingPolicy ? <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="icon-sm" aria-hidden="true" />}
                          儲存模型政策
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeSection === "llm" && <LlmModelSettings />}

              {activeSection === "styles" && (
                <AdminTable
                  minWidth="min-w-[780px]"
                  columns={["風格", "擁有者", "分類 / 狀態", "使用次數", { label: "操作", align: "right" }]}
                  isEmpty={styles.length === 0}
                  emptyMessage="目前沒有風格資料。"
                  footer={
                    <AdminTablePagination
                      pagination={stylesPagination}
                      itemLabel="筆風格"
                      isRefreshing={isRefreshing}
                      onPageChange={handleStylesPageChange}
                    />
                  }
                >
                  {styles.map((style) => (
                    <tr key={style.id} className="align-top transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
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
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted"><Palette className="icon-sm text-muted-foreground" aria-hidden="true" /></span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium">{style.name}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{style.description || style.prompt}</p>
                            {style.tags?.length > 0 && <p className="mt-1 truncate text-[11px] text-muted-foreground">#{style.tags.join(" #")}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{style.authorName}</p>
                        <p className="text-xs text-muted-foreground">{style.authorEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary">{style.category}</Badge>
                          <Badge variant="outline">{style.visibility === "shared" ? "共享" : "私人"}</Badge>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {style.usageCount}
                        <span className="ml-1 text-xs text-muted-foreground">次</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingAction({ kind: "delete-style", style })}
                          aria-label={`刪除 ${style.name}`}
                          className="gap-1.5 text-destructive hover:bg-destructive/5 hover:text-destructive"
                        >
                          <Trash2 className="icon-sm" aria-hidden="true" />
                          刪除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </AdminTable>
              )}
            </>
          )}
        </div>
      </main>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === "delete-style" ? "刪除風格" : "停用使用者"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === "delete-style"
                ? `確定要刪除「${pendingAction.style.name}」嗎？相關歷史紀錄仍會保留。`
                : `確定要停用 ${pendingAction?.item.displayName} 嗎？停用後該使用者將無法使用系統，之後可再重新啟用。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPendingAction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pendingAction?.kind === "delete-style" ? "確認刪除" : "確認停用"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  );
}
