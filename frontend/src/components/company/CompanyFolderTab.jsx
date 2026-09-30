import HistoryIcon from "../common/HistoryIcon";
import CloudStorageIcon from "../common/CloudStorageIcon";
import FilesIcon from "../common/FilesIcon";
import React, { useState } from "react";
import UploadIcon from "../common/UploadIcon";
import Folder from "./Folder";
import StatTile from "../common/StatTile";
import StatTileSkeleton from "../common/StatTileSkeleton";

const STORAGE_ALLOCATION_GB = 5;

// On a company page this lists the company's folders and its deals' folders;
// pass `dealId` to scope it to a single deal.
export default function CompanyFolderTab({ dealId, showStats = true, isLoading = false, autoOpenCreate = false, onAutoOpenCreateConsumed }) {
  const [folders, setFolders] = useState([]);

  const allFiles = folders.flatMap((f) => f.files || []);
  const totalFiles = allFiles.length;

  const totalBytes = allFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0);
  const usedGB = totalBytes / (1024 * 1024 * 1024);
  const storageLabel =
    usedGB >= 1
      ? `${usedGB.toFixed(1)} GB`
      : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

  const sortedByDate = [...allFiles].sort(
    (a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0),
  );
  const latest = sortedByDate[0];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentUploads = allFiles.filter(
    (f) => f.uploadedAt && new Date(f.uploadedAt) >= sevenDaysAgo,
  ).length;

  const relativeTime = (date) => {
    if (!date) return "—";
    const diffMs = Date.now() - new Date(date);
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return "less than an hour ago";
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  const latestUpdatedLabel = (() => {
    if (!latest) return "—";
    const isToday =
      new Date(latest.uploadedAt).toDateString() === new Date().toDateString();
    return isToday ? "Today" : relativeTime(latest.uploadedAt);
  })();

  const latestSubtitle = latest
    ? `${latest.fileName} · ${new Date(latest.uploadedAt).toLocaleTimeString(
      "en-US",
      { hour: "numeric", minute: "2-digit" },
    )}`
    : null;

  const kpiTiles = [
    { label: "Total Files", value: totalFiles, icon: FilesIcon },
    {
      label: "Storage Used",
      value: storageLabel,
      icon: CloudStorageIcon,
      subtitle: `Of ${STORAGE_ALLOCATION_GB} GB allocated`,
      subtitleClass: "text-gray-400",
    },
    {
      label: "Recent Uploads",
      value: recentUploads,
      icon: UploadIcon,
      subtitle: latest ? `Last upload ${relativeTime(latest.uploadedAt)}` : null,
      subtitleClass: "text-gray-400",
    },
    {
      label: "Last Updated",
      value: latestUpdatedLabel,
      icon: HistoryIcon,
      subtitle: latestSubtitle,
      subtitleClass: "text-gray-400",
    },
  ];

  return (
    <div>
      {/* KPI Tiles */}
      {showStats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
            ) : (
              kpiTiles.map((tile) => (
              <StatTile key={tile.label} tile={tile} />
            )))}
          </div>

          <div className="-mx-6" style={{ marginTop: 24, paddingBottom: 24, borderTop: "1px solid #E1E4EA" }} />
        </>
      )}

      {/* Existing folder UI (its own search/grid/upload) */}
      <Folder
        dealId={dealId}
        onFoldersChange={setFolders}
        isLoading={isLoading}
        showStats={showStats}
        autoOpenCreate={autoOpenCreate}
        onAutoOpenCreateConsumed={onAutoOpenCreateConsumed}
      />
    </div>
  );
}
