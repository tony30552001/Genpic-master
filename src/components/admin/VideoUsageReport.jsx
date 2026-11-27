import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminVideoUsage } from "@/services/adminService";
import AdminTable from "./AdminTable";
import UserFilterSelect from "./UserFilterSelect";

const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" });
const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });
const usd = new Intl.NumberFormat("zh-TW", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
});
const defaultFilters = () => {
  const now = Date.now();
  return { userId: "", modelKey: "", from: day.format(now - 29 * 86_400_000), to: day.format(now) };
};
const fieldClass = "grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground";
const columns = ["使用者", "模型識別碼", "模式", "單段秒數", "音訊", "角色參考圖", "成功段數", "生成秒數", "每秒單價", "估算成本"];

function Metric({ label, value, note }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-4 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-xl font-semibold tabular-nums">{value}</dd>
      <dd className="mt-1 text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

export default function VideoUsageReport({ users, models, loadingUsers }) {
  const [draft, setDraft] = useState(defaultFilters);
  const [filters, setFilters] = useState(draft);
  const [result, setResult] = useState(null);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const controller = new AbortController();
    void getAdminVideoUsage(filters, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setResult({ filters, data }); },
      (error) => { if (!controller.signal.aborted) setResult({ filters, error: error.message || "影片用量載入失敗" }); }
    );
    return () => controller.abort();
  }, [filters]);

  const report = result?.filters === filters ? result.data : null;
  const modelOptions = new Map([
    ...(report?.rows || []).map((row) => [row.modelKey, row.modelKey]),
    ...models.map((model) => [model.modelKey, model.label]),
  ]);
  return (
    <section aria-labelledby="video-usage-title" className="space-y-5">
      <div>
        <h2 id="video-usage-title" className="text-xl font-semibold">影片用量與成本</h2>
        <p className="mt-1 text-sm text-muted-foreground">依工作完成日統計（台灣時間）。金額按模型目錄目前的美元單價估算，並非帳單。</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        setFilters({ ...draft, modelKey: draft.modelKey.trim() });
      }}>
        <UserFilterSelect label="使用者" users={users} value={draft.userId} disabled={loadingUsers}
          allLabel="全部使用者" onChange={(value) => update("userId", value)} />
        <label className={fieldClass}>模型識別碼
          <Input list="usage-models" placeholder="全部模型" maxLength={128} value={draft.modelKey}
            onChange={(event) => update("modelKey", event.target.value)} />
        </label>
        <datalist id="usage-models">
          {[...modelOptions].map(([key, label]) => <option key={key} value={key} label={label} />)}
        </datalist>
        <label className={fieldClass}>開始日期
          <Input type="date" max={draft.to || undefined} value={draft.from} onChange={(event) => update("from", event.target.value)} />
        </label>
        <label className={fieldClass}>結束日期
          <Input type="date" min={draft.from || undefined} value={draft.to} onChange={(event) => update("to", event.target.value)} />
        </label>
        <Button type="submit">套用篩選</Button>
      </form>
      {result?.filters !== filters ? <p role="status">正在載入影片用量…</p> :
        result.error ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="成功生成" value={`${number.format(report.generatedSeconds)} 秒`} note="僅計實際生成，不含沿用分段" />
            <Metric label={report.unpricedSeconds ? "已定價部分估算" : "生成成本估算"}
              value={report.knownCostUsd == null ? "未定價" : usd.format(report.knownCostUsd)}
              note={report.unpricedSeconds ? `另有 ${number.format(report.unpricedSeconds)} 秒未定價，未計入成本` : "美元（USD）"} />
            <Metric label="組合輸出" value={report.knownOutputMinutes == null ? "未記錄時長" : `${number.format(report.knownOutputMinutes)} 分鐘`}
              note={`成功組合 ${number.format(report.renderCount)} 支${report.unknownDurationCount ? `，其中 ${report.unknownDurationCount} 支時長未記錄` : ""}`} />
            <Metric
              label="旁白合成字數"
              value={`${number.format(report.narrationCharacters ?? 0)} 字`}
              note={report.narrationCharacters ? "來自已完成的合成成片" : "篩選範圍內尚無旁白合成"}
            />
          </dl>
          <div className="space-y-2">
            <h3 className="font-semibold">生成明細</h3>
            <AdminTable columns={columns} minWidth="min-w-[900px]" isEmpty={!report.rows.length} emptyMessage="篩選範圍內沒有成功生成的分段。">
              {report.rows.map((row) => (
                <tr key={JSON.stringify([row.userId, row.modelKey, row.mode, row.durationSeconds, row.generateAudio, row.usedElements])}
                  className="[&>td]:whitespace-nowrap [&>td]:px-4 [&>td]:py-3 [&>td]:tabular-nums">
                  <td><span>{row.displayName}</span>{row.videoUnlimited && <Badge variant="secondary" className="ml-2">不限額</Badge>}
                    <span className="block text-xs text-muted-foreground">{row.email}</span></td>
                  <td>{row.modelKey}</td><td>{row.mode === "i2v" ? "圖生影片" : "文生影片"}</td>
                  <td>{row.durationSeconds}</td><td>{row.generateAudio ? "開啟" : "關閉"}</td>
                  <td>{row.usedElements == null ? "未記錄" : row.usedElements ? "使用" : "未使用"}</td>
                  <td>{number.format(row.jobCount)}</td><td>{number.format(row.generatedSeconds)}</td>
                  <td>{row.pricePerSecondUsd == null ? "未定價" : usd.format(row.pricePerSecondUsd)}</td>
                  <td>{row.estimatedCostUsd == null ? "未定價" : usd.format(row.estimatedCostUsd)}</td>
                </tr>
              ))}
            </AdminTable>
          </div>
        </>
      )}
    </section>
  );
}
