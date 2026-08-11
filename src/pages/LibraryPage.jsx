import React from "react";
import { useSearchParams } from "react-router-dom";
import InfographicGenerator from "../InfographicGenerator";

export default function LibraryPage() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section") || "overview";
  const viewMode = searchParams.get("view") || "grid";

  return (
    <InfographicGenerator
      initialTab="library"
      initialLibrarySection={section}
      initialLibraryViewMode={viewMode}
    />
  );
}
