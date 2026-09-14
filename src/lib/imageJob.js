const hasText = (value) => typeof value === "string" && value.trim().length > 0;

export const requireImageJobId = (jobId) => {
  if (!hasText(jobId)) throw new Error("圖片工作識別遺失，請重新生成圖片。");
  return jobId;
};

export const requireImageJobAdmission = (job) => {
  requireImageJobId(job?.jobId);
  if (job.status !== "queued" || !hasText(job.model)) {
    throw new Error("圖片工作建立回應不完整，請重新生成圖片。");
  }
  return job;
};

export const requireImageJob = (job, { jobId, model, operation } = {}) => {
  requireImageJobId(jobId);
  if (
    job?.jobId !== jobId ||
    !hasText(job.model) ||
    (model !== undefined && job.model !== model) ||
    !["generate", "edit"].includes(job.operation) ||
    (operation !== undefined && job.operation !== operation) ||
    !["queued", "processing", "succeeded", "failed"].includes(job.status)
  ) {
    throw new Error("圖片工作回應與原始工作不符或資料不完整，請重新生成圖片。");
  }
  return job;
};

export const requireCompletedImageJob = (job, expected) => {
  requireImageJob(job, expected);
  if (job.status !== "succeeded" || !hasText(job.imageUrl)) {
    throw new Error("圖片工作尚未成功或缺少圖片，請重新生成圖片。");
  }
  return job;
};
