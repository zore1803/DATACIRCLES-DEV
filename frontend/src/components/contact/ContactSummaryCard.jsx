import React from "react";
import EntitySummaryCard from "../common/EntitySummaryCard";

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * Collapsible summary strip above the contact Overview tab's KPI row —
 * same component and layout as CompanySummaryCard, built from Contact's own
 * real fields instead. "Owner" here is contact.user (the CRM user a contact
 * is assigned to — same field BasicDetails.jsx's own owner picker reads),
 * not a separate `owner` field, since Contact has no such field.
 */
export default function ContactSummaryCard({ contact }) {
  if (!contact) return null;

  const customFields = (contact.additionalFields || []).filter((f) => f.key);

  return (
    <EntitySummaryCard
      collapsedFields={[
        { label: "Email", value: contact.email },
        { label: "Phone", value: contact.phone },
        { label: "Company", value: contact.company?.name },
        { label: "Owner", value: contact.user?.name },
        { label: "Client Since", value: formatDate(contact.createdAt) },
      ]}
      expandedFields={[
        { label: "Lifecycle Stage", value: contact.lifecycleStage },
        { label: "Status", value: contact.stageStatus },
        { label: "LinkedIn", value: contact.socialMedia?.linkedin },
        { label: "Twitter / X", value: contact.socialMedia?.twitter },
        { label: "Facebook", value: contact.socialMedia?.facebook },
        ...customFields.map((f) => ({ label: f.key, value: f.value != null ? String(f.value) : "" })),
      ]}
    />
  );
}
