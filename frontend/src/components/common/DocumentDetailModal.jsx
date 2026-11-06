import { useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Building2,
  MapPin,
  Check,
  Receipt,
  Wallet,
  StickyNote,
  Package,
  Pencil,
} from "lucide-react";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { docNameFor, numberKeyFor } from "../../utils/documentTypes";

/* A centred "document card" opened by clicking a row in the Accounting list.
   Everything about the document on one screen, in plain language:
   - a header with the number, status pill and the big amount;
   - a journey strip showing where the document is in its life
     (Draft -> Pending -> Paid ...) and what is still to come;
   - key facts as small cards (dates with a "due in 5 days" hint, customer, tax);
   - tabs for Items, Payments (invoices) and Notes;
   - ← / → (or the arrow buttons) flip to the previous / next row without
     closing the card, Esc closes, E edits. */

const JOURNEY = {
  tax: ["Draft", "Pending", "Paid"],
  performa: ["Draft", "Pending", "Sent", "Paid"],
  quotation: ["Draft", "Pending", "Accepted"],
  deliveryChallan: ["Draft", "Pending", "Delivered"],
};

const BAD_END = ["Cancelled", "Void", "Rejected"];

const STATUS_STYLE = {
  Draft: "bg-gray-100 text-gray-700 border-gray-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Sent: "bg-blue-50 text-blue-700 border-blue-200",
  "Partially Paid": "bg-sky-50 text-sky-700 border-sky-200",
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Overdue: "bg-red-50 text-red-700 border-red-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Void: "bg-gray-100 text-gray-600 border-gray-300",
};

const inr = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// "Due in 5 days" / "Overdue by 3 days" / "Due today", with a colour tone.
const dueHint = (dueDate, status) => {
  if (!dueDate || ["Paid", "Cancelled", "Void", "Accepted", "Rejected", "Delivered"].includes(status)) return null;
  const days = Math.round((startOfDay(dueDate) - startOfDay(new Date())) / 86400000);
  if (days < 0) return { text: `Overdue by ${-days} day${-days === 1 ? "" : "s"}`, tone: "text-red-600 bg-red-50" };
  if (days === 0) return { text: "Due today", tone: "text-amber-700 bg-amber-50" };
  return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "text-emerald-700 bg-emerald-50" };
};

const addressLines = (a) =>
  a
    ? [a.addressLine1, a.addressLine2, [a.city, a.pincode].filter(Boolean).join(" "), a.state, a.country].filter(Boolean)
    : [];

const Fact = ({ icon: Icon, label, children, hint }) => (
  <div className="rounded-xl border border-[#E8EAF0] bg-white px-3 py-2">
    <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#78788D]">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="text-sm font-semibold text-[#0E121B] break-words">{children}</div>
    {hint && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${hint.tone}`}>{hint.text}</span>}
  </div>
);

/* `type` is a sales document (tax / performa / quotation / deliveryChallan).
   Purchase orders reuse the same card by passing `docLabel`, `numberKey`,
   `steps` and `paymentTerms` (which swaps the due-date facts for the vendor's
   terms) and `hideAddresses`. */
export default function DocumentDetailModal({
  doc,
  type,
  onClose,
  onEdit,
  onPrev,
  onNext,
  position,
  docLabel,
  numberKey: numberKeyProp,
  steps: stepsProp,
  paymentTerms,
  hideAddresses = false,
  showPayments: showPaymentsProp = false,
  dateLabel,
  termsLabel,
}) {
  const [tab, setTab] = useState("items");
  useBodyScrollLock(true);

  const numberKey = numberKeyProp || numberKeyFor(type);
  const isPurchase = paymentTerms !== undefined;
  const items = useMemo(() => doc.items || [], [doc.items]);
  const payments = useMemo(() => doc.payments || [], [doc.payments]);
  const status = doc.status || "Pending";

  // Back to the first tab whenever another document is shown.
  useEffect(() => setTab("items"), [doc._id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if (e.key === "ArrowRight" && onNext) onNext();
      else if ((e.key === "e" || e.key === "E") && onEdit) onEdit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, onEdit]);

  // Money breakdown, derived from the stored lines. The document's own
  // `amount` is the authority for the total; "Taxes & round-off" is whatever
  // sits between the discounted subtotal and that total.
  const money = useMemo(() => {
    const lines = items.map((it) => {
      const gross = (Number(it.rate) || 0) * (Number(it.quantity) || 0);
      const disc =
        it.discountType === "percentage"
          ? (gross * (Number(it.discount) || 0)) / 100
          : Number(it.discount) || 0;
      return { ...it, gross, disc, net: Math.max(gross - disc, 0) };
    });
    const subtotal = lines.reduce((s, l) => s + l.net, 0);
    const dd = doc.discount;
    const docDiscount = dd
      ? dd.type === "percentage"
        ? (subtotal * (Number(dd.value) || 0)) / 100
        : Number(dd.value) || 0
      : 0;
    const total = Number(doc.amount) || 0;
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return {
      lines,
      subtotal,
      docDiscount,
      taxes: total - (subtotal - docDiscount),
      total,
      paid,
      due: Math.max(total - paid, 0),
    };
  }, [items, payments, doc.discount, doc.amount]);

  const steps = stepsProp || JOURNEY[type] || JOURNEY.tax;
  const effective = status === "Partially Paid" ? "Pending" : status;
  const stepIndex = steps.indexOf(effective);
  const ended = BAD_END.includes(status);
  const showPayments = type === "tax" || showPaymentsProp;
  const hint = dueHint(doc.dueDate, status);
  const paidPct = money.total > 0 ? Math.min((money.paid / money.total) * 100, 100) : 0;

  const customer = doc.deal?.title || doc.company?.name || doc.contact?.name || "N/A";
  const customerSub =
    doc.deal?.company?.name || doc.company?.name || doc.contact?.name || doc.deal?.contactPerson || "";

  const tabs = [
    { id: "items", label: `Items (${items.length})`, icon: Package },
    ...(showPayments ? [{ id: "payments", label: `Payments (${payments.length})`, icon: Wallet }] : []),
    { id: "notes", label: "Notes & Terms", icon: StickyNote },
  ];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#0E121B]/40 backdrop-blur-sm" onClick={onClose} />

      <div
        key={doc._id}
        className="relative flex max-h-[96vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[22px] bg-[#F7F8FA] shadow-2xl"
        style={{ animation: "dcDocPop 180ms ease-out" }}
      >
        <style>{`@keyframes dcDocPop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}`}</style>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 bg-white px-6 py-3.5">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#EEF4FF] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#2B5BFF]">
                {docLabel || docNameFor(type)}
              </span>
              <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] || STATUS_STYLE.Draft}`}>
                {status}
              </span>
            </div>
            <h2 className="truncate text-xl font-bold text-[#0E121B]">#{doc[numberKey]}</h2>
            <p className="mt-0.5 truncate text-sm text-[#525866]">
              {customer}
              {customerSub && customerSub !== customer ? ` · ${customerSub}` : ""}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-start gap-3">
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#78788D]">Total</p>
              <p className="text-xl font-bold text-[#0E121B]">{inr(money.total)}</p>
              {showPayments && money.total > 0 && (
                <p className={`text-xs font-medium ${money.due > 0.01 ? "text-amber-700" : "text-emerald-700"}`}>
                  {money.due > 0.01 ? `${inr(money.due)} still to pay` : "Fully paid"}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-[#525866] hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-3 pt-3">
          <div className={`mb-3 grid gap-3 ${showPayments && money.total > 0 ? "md:grid-cols-[1fr_250px]" : ""}`}>
          {/* Journey: where this document is in its life */}
          <div className="rounded-xl border border-[#E8EAF0] bg-white px-4 py-2">
            <div className="flex items-center">
              {steps.map((step, i) => {
                const done = !ended && stepIndex >= 0 && i < stepIndex;
                const current = !ended && i === stepIndex;
                return (
                  <div key={step} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                          done
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : current
                              ? "border-[#2B5BFF] bg-[#2B5BFF] text-white ring-4 ring-[#2B5BFF]/15"
                              : "border-[#D5D9E2] bg-white text-[#99A0AE]"
                        }`}
                      >
                        {done ? <Check className="h-4 w-4" /> : i + 1}
                      </span>
                      <span className={`text-[11px] font-medium ${current ? "text-[#2B5BFF]" : done ? "text-emerald-700" : "text-[#99A0AE]"}`}>
                        {step}
                      </span>
                    </div>
                    {i < steps.length - 1 && (
                      <span className={`mx-2 mb-4 h-0.5 flex-1 rounded ${done ? "bg-emerald-500" : "bg-[#E1E4EA]"}`} />
                    )}
                  </div>
                );
              })}
              {ended && (
                <span className={`ml-3 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>
                  Ended: {status}
                </span>
              )}
              {status === "Partially Paid" && (
                <span className="ml-3 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  Part-paid
                </span>
              )}
            </div>
          </div>
          {/* Payment progress (invoices), beside the journey */}
          {showPayments && money.total > 0 && (
            <div className="flex flex-col justify-center rounded-xl border border-[#E8EAF0] bg-white px-4 py-2.5">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#525866]">
                <span>Payment progress</span>
                <span>
                  {inr(money.paid)} of {inr(money.total)} ({Math.round(paidPct)}%)
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#E8EAF0]">
                <div
                  className={`h-full rounded-full transition-all ${paidPct >= 99.9 ? "bg-emerald-500" : "bg-[#2B5BFF]"}`}
                  style={{ width: `${paidPct}%` }}
                />
              </div>
            </div>
          )}

          </div>

          {/* Key facts */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact icon={CalendarDays} label={dateLabel || (isPurchase ? "Order date" : "Issue date")}>{fmtDate(doc.date)}</Fact>
            {isPurchase ? (
              <Fact icon={Clock} label={termsLabel || "Payment terms"}>{paymentTerms || "—"}</Fact>
            ) : (
              <Fact icon={Clock} label={type === "quotation" ? "Valid until" : "Due date"} hint={hint}>
                {fmtDate(doc.dueDate)}
              </Fact>
            )}
            <Fact icon={Building2} label={isPurchase ? "Vendor" : "Customer"}>{customer}</Fact>
            {isPurchase ? (
              <Fact icon={Package} label="Items">{items.length}</Fact>
            ) : (
              <Fact icon={MapPin} label="Place of supply">{doc.placeOfSupply || "—"}</Fact>
            )}
          </div>

          {/* Tabs */}
          <div className="mb-2 inline-flex rounded-full bg-[#ECEEF3] p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-medium transition-colors ${
                  tab === t.id ? "bg-white text-[#2B5BFF] shadow-sm" : "text-[#0E121B] hover:bg-white/60"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "items" && (
            <div className="rounded-xl border border-[#E8EAF0] bg-white">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[#99A0AE]">No line items on this document.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-[#78788D]">
                      <tr className="border-b border-[#F1F1F5]">
                        <th className="px-4 py-2 font-medium">Item</th>
                        <th className="px-2 py-2 text-right font-medium">Qty</th>
                        <th className="px-2 py-2 text-right font-medium">Rate</th>
                        <th className="px-2 py-2 text-right font-medium">Discount</th>
                        <th className="px-2 py-2 text-right font-medium">GST</th>
                        <th className="px-4 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {money.lines.map((l, i) => (
                        <tr key={l._id || i} className="border-b border-[#F7F7FA] last:border-0">
                          <td className="px-4 py-2">
                            <p className="font-medium text-[#0E121B]">{l.name}</p>
                            {(l.description || l.hsn) && (
                              <p className="text-xs text-[#78788D]">
                                {[l.hsn && `HSN ${l.hsn}`, l.description].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{l.quantity}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{inr(l.rate)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-[#78788D]">
                            {l.disc > 0 ? `− ${inr(l.disc)}` : "—"}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-[#78788D]">
                            {l.gstRate ? `${l.gstRate}%` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{inr(l.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="ml-auto w-full max-w-[320px] space-y-1 border-t border-[#F1F1F5] px-4 py-2 text-sm">
                <div className="flex justify-between text-[#525866]">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{inr(money.subtotal)}</span>
                </div>
                {money.docDiscount > 0 && (
                  <div className="flex justify-between text-[#525866]">
                    <span>Discount</span>
                    <span className="tabular-nums">− {inr(money.docDiscount)}</span>
                  </div>
                )}
                {Math.abs(money.taxes) > 0.005 && (
                  <div className="flex justify-between text-[#525866]">
                    <span>Taxes &amp; round-off</span>
                    <span className="tabular-nums">{inr(money.taxes)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#E8EAF0] pt-1.5 text-base font-bold text-[#0E121B]">
                  <span>Total</span>
                  <span className="tabular-nums">{inr(money.total)}</span>
                </div>
              </div>
            </div>
          )}

          {tab === "payments" && (
            <div className="rounded-xl border border-[#E8EAF0] bg-white p-4">
              {payments.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#99A0AE]">No payments recorded yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l-2 border-[#E1E4EA] pl-5">
                  {[...payments]
                    .sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate))
                    .map((p, i) => (
                      <li key={p._id || i} className="relative">
                        <span className="absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 ring-2 ring-emerald-100" />
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#0E121B]">{inr(p.amount)}</p>
                            <p className="text-xs text-[#78788D]">
                              {fmtDate(p.paymentDate)} · {p.paymentMethod || "—"}
                              {p.reference ? ` · Ref ${p.reference}` : ""}
                            </p>
                            {p.notes && <p className="mt-0.5 text-xs text-[#525866]">{p.notes}</p>}
                          </div>
                          <Receipt className="h-4 w-4 flex-shrink-0 text-[#99A0AE]" />
                        </div>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          )}

          {tab === "notes" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(hideAddresses
                ? []
                : [
                    { title: "Billing address", lines: addressLines(doc.billingAddress) },
                    { title: "Shipping address", lines: addressLines(doc.shippingAddress) },
                  ]
              ).map((a) => (
                <div key={a.title} className="rounded-xl border border-[#E8EAF0] bg-white p-4">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#78788D]">{a.title}</p>
                  {a.lines.length ? (
                    a.lines.map((l, i) => <p key={i} className="text-sm text-[#0E121B]">{l}</p>)
                  ) : (
                    <p className="text-sm text-[#99A0AE]">Not provided</p>
                  )}
                </div>
              ))}
              {[
                { title: "Reference", text: doc.reference },
                { title: "GSTIN", text: doc.receiverGSTIN },
                { title: "Notes", text: doc.notes },
                { title: "Terms & conditions", text: doc.terms },
              ]
                .filter((b) => !isPurchase || b.title === "Notes")
                .map((b) => (
                <div key={b.title} className="rounded-xl border border-[#E8EAF0] bg-white p-4">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#78788D]">{b.title}</p>
                  <p className="whitespace-pre-wrap text-sm text-[#0E121B]">
                    {b.text || <span className="text-[#99A0AE]">—</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: flip between rows, edit */}
        <div className="flex items-center justify-between gap-3 border-t border-[#E8EAF0] bg-white px-6 py-2.5">
          <div className="flex items-center gap-2 text-xs text-[#78788D]">
            <button
              type="button"
              onClick={onPrev}
              disabled={!onPrev}
              aria-label="Previous document"
              className="rounded-full border border-[#E1E4EA] p-1.5 text-[#0E121B] hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>{position ? `${position.index + 1} of ${position.total}` : ""}</span>
            <button
              type="button"
              onClick={onNext}
              disabled={!onNext}
              aria-label="Next document"
              className="rounded-full border border-[#E1E4EA] p-1.5 text-[#0E121B] hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 hidden sm:inline">← → to browse{onEdit ? " · E to edit" : ""} · Esc to close</span>
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-10 items-center gap-2 rounded-full bg-[#0085FF] px-5 text-sm font-semibold text-white hover:bg-blue-600"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
