import React from "react";
import EntitySummaryCard from "../common/EntitySummaryCard";

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

export default function DealSummaryCard({ deal }) {
  if (!deal) return null;

  const customFields = (deal.additionalFields || []).filter((f) => f.key);

  return (
    <EntitySummaryCard
      collapsedFields={[
        { label: "Company", value: deal.company?.name },
        { label: "Contact", value: deal.contact?.name },
        { label: "Owner", value: deal.user?.name },
        { label: "Stage", value: deal.status || "Open" },
        { label: "Created Date", value: formatDate(deal.createdAt) },
      ]}
      expandedFields={[
        { label: "Last Updated", value: formatDate(deal.updatedAt) },
        ...customFields.map((f) => ({ label: f.key, value: f.value != null ? String(f.value) : "" })),
      ]}
    />
  );
}
