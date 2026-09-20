import React from "react";
import EntitySummaryCard from "../common/EntitySummaryCard";

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

const formatAddress = (addr) => {
  if (!addr) return "";
  const parts = [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.pincode, addr.country]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.join(", ");
};

const formatWhatsapp = (w) => (w?.number ? `${w.countryCode || ""} ${w.number}`.trim() : "");

/**
 * Collapsible summary strip above the company Overview tab's KPI row.
 * Collapsed shows the handful of fields someone glancing at a company most
 * likely wants (GSTIN, industry, lead source, owner, client-since);
 * expanding reveals every other field the record actually carries —
 * contact info, billing address, social links, and any org-defined custom
 * fields — rather than a fixed list invented to match some other product's
 * schema, since this only shows data the Company model really has.
 */
export default function CompanySummaryCard({ company }) {
  if (!company) return null;

  const customFields = (company.additionalFields || []).filter((f) => f.key);

  return (
    <EntitySummaryCard
      collapsedFields={[
        { label: "GSTIN", value: company.gstin },
        { label: "Industry", value: company.industry },
        { label: "Lead Source", value: company.leadSource },
        { label: "Owner", value: company.owner?.name },
        { label: "Client Since", value: formatDate(company.createdAt) },
      ]}
      expandedFields={[
        { label: "Website", value: company.website },
        { label: "Email", value: company.email },
        { label: "WhatsApp Number", value: formatWhatsapp(company.whatsappNumber) },
        { label: "LinkedIn", value: company.socialMedia?.linkedin },
        { label: "Twitter / X", value: company.socialMedia?.twitter },
        { label: "Instagram", value: company.socialMedia?.instagram },
        { label: "Facebook", value: company.socialMedia?.facebook },
        { label: "Billing Address", value: formatAddress(company.billingAddress) || company.address },
        ...customFields.map((f) => ({ label: f.key, value: f.value != null ? String(f.value) : "" })),
      ]}
      fullWidthLabels={["Billing Address"]}
    />
  );
}
