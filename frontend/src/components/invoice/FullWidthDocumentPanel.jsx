import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useState } from "react";
import { Search, Info } from "lucide-react";
import toast from "react-hot-toast";
import {
  SectionHeader,
  FieldLabel,
  PickerSelect,
  AddressFieldsGroup,
  emptyAddress,
  isAddressEmpty,
} from "./formPrimitives.jsx";
import AddressBookDrawer from "./AddressBookDrawer";
import { resolveTransactionType } from "../../utils/placeOfSupply";
import { computeDocument } from "../../../../shared/documentTemplates.js";

const money = (n) =>
  `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const lineTotal = (item) =>
  (parseFloat(item.rate) || 0) * (parseInt(item.quantity) || 0);

/*
 * Alternate "edge to edge" layout for CreateInvoicePanel's create/edit
 * screen, used only when the preview is hidden (the Maximize2/Minimize2
 * toggle in Accounting.jsx). Same form state, same handlers, same
 * validation and submit path as the default split view — this component
 * only changes how Details/Address/GST/Items are arranged and styled; it
 * covers sections 01-04, everything from Notes onward keeps rendering from
 * CreateInvoicePanel's own JSX unchanged.
 *
 * The GST/CGST/SGST/IGST math is never recomputed here — computeDocument()
 * (shared/documentTemplates.js, the same function the PDF and live preview
 * use) is called on the current form state so this table can never disagree
 * with what actually prints.
 */
const FullWidthDocumentPanel = ({
  type,
  docName,
  supportsGSTIN,
  supportsTax,
  // The organization's own state — the supplier side of the intra/inter
  // comparison. Without it the tax type is left exactly as it is.
  sellerState,
  sectionNo,
  form,
  setField,
  setForm,
  deals,
  dealOptions,
  onAddDeal,
  catalogue,
  addItem,
  removeItem,
  updateItem,
  stripHtml,
}) => {
  // "billing" | "shipping" | null — which field group opened the saved
  // address book (AddressBookDrawer).
  const [addressDrawer, setAddressDrawer] = useState(null);
  // The tax columns/sections are driven by the supportsTax prop; the body
  // has always called it taxOn.
  const taxOn = supportsTax;
  const t = computeDocument(form, type);
  const totalTax = t.totalCGST + t.totalSGST + t.totalIGST;
  // The GST rates actually present on this document's lines. Tax is per
  // line, so there can be more than one -- these readouts report what the
  // lines carry and never stand in for a document-wide rate.
  const lineGstRates = [...new Set((t.rows || []).map((r) => Number(r.gstRate) || 0))]
    .sort((a, b) => a - b);
  const fmtRates = (half = false) =>
    lineGstRates.length === 0
      ? "--"
      : lineGstRates.map((r) => `${+(half ? r / 2 : r).toFixed(2)}%`).join(", ");

  const inputClass =
    "w-full h-10 px-2.5 rounded-lg border border-[#E1E4EA] bg-white text-[13px] text-[#1F2937] placeholder:text-[#99A0AE] focus:outline-none focus:border-[#0085FF] transition-colors";
  const readOnlyClass =
    "w-full h-10 px-2.5 rounded-lg border border-[#E1E4EA] bg-[#F5F7FA] text-[13px] text-[#525866]";

  return (
    <div className="w-full flex flex-col items-start gap-1">
      {/* 01 — Details */}
      <SectionHeader number={sectionNo.details} title={`${docName} Details`} />
      <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-6 gap-y-2 w-full">
        <div className="flex flex-col gap-1">
          <FieldLabel required>Select Deal</FieldLabel>
          <div className="flex items-center gap-2">
            <PickerSelect
              value={form.deal}
              options={dealOptions}
              placeholder="Search and select deal"
              icon={Search}
              onSelect={(o) => {
                // Same behavior as the default view: switching the deal
                // always replaces the Receiver GSTIN and billing/shipping
                // address with the new deal's company data, clearing them
                // to empty when that company doesn't have them saved.
                const selectedDeal = deals.find((d) => d._id === o.value);
                const company = selectedDeal?.company;
                const nextBilling =
                  company && !isAddressEmpty(company.billingAddress)
                    ? { ...emptyAddress(), ...company.billingAddress }
                    : emptyAddress();
                const nextShipping =
                  company && !isAddressEmpty(company.shippingAddresses?.[0])
                    ? { ...emptyAddress(), ...company.shippingAddresses[0] }
                    : emptyAddress();
                setForm((p) => {
                  const shipping = p.sameAsBilling ? nextBilling : nextShipping;
                  // Goods: place of supply is the shipping state, so it decides
                  // CGST+SGST vs IGST — same rule as the other two layouts.
                  const autoType = resolveTransactionType(sellerState, shipping, nextBilling);
                  return {
                    ...p,
                    deal: o.value,
                    receiverGSTIN: supportsGSTIN ? company?.gstin || "" : p.receiverGSTIN,
                    billingAddress: nextBilling,
                    shippingAddress: shipping,
                    transactionType: supportsTax && autoType ? autoType : p.transactionType,
                  };
                });
              }}
            />
            <button
              type="button"
              onClick={onAddDeal}
              title="Create a new deal"
              className="w-10 h-10 flex-shrink-0 rounded-lg bg-[#0085FF] hover:bg-blue-600 text-white flex items-center justify-center transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel required>{docName} Date</FieldLabel>
          <input
            type="date"
            value={form.date}
            onChange={(e) => {
              const newDate = e.target.value;
              setForm((prev) => {
                let newDueDate = prev.dueDate;
                if (!prev.dueDate) {
                  const d = new Date(newDate);
                  d.setDate(d.getDate() + 30);
                  newDueDate = d.toISOString().split("T")[0];
                }
                return { ...prev, date: newDate, dueDate: newDueDate };
              });
            }}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel>Due Date</FieldLabel>
          <input
            type="date"
            value={form.dueDate}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setField("dueDate", e.target.value)}
            className={inputClass}
          />
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[11px] font-medium ${form.date ? "text-[#99A0AE]" : "text-[#C9CFD8]"}`}>
              Quick set:
            </span>
            {[7, 15, 30].map((days) => (
              <button
                key={days}
                type="button"
                disabled={!form.date}
                title={
                  form.date
                    ? `Set Due Date to ${days} days after the ${docName} date`
                    : `Select the ${docName} date first`
                }
                onClick={() => {
                  if (!form.date) {
                    toast.error(`Please select the ${docName} date first.`);
                    return;
                  }
                  const d = new Date(form.date);
                  d.setDate(d.getDate() + days);
                  setField("dueDate", d.toISOString().split("T")[0]);
                }}
                className={`h-6 px-2.5 text-[11px] font-medium rounded-full border-none focus:outline-none transition-colors ${
                  form.date
                    ? "text-[#525866] bg-[#F5F7FA] hover:bg-[#E1E4EA] cursor-pointer"
                    : "text-[#C9CFD8] bg-[#F5F7FA] cursor-not-allowed"
                }`}
              >
                {days} days
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* 02 — Billing & Shipping Address, side by side.
          Flex, not grid: AddressFieldsGroup carries its own `@md:col-span-2`
          (meant for the default view's single-column details grid, where it
          forces the card to full width) — inside a CSS grid that class would
          make it span both columns and collapse this back to one column, so
          a flex row is used here instead, where col-span has no effect. */}
      <SectionHeader number={sectionNo.address} title="Billing & Shipping Address" />
      {/* Its own row above both cards — inside either card's wrapper it
          pushed that card's top down and read as floating, and made the two
          cards start at different heights. */}
      <div className="flex items-center justify-end gap-2 w-full mb-1">
        <button
          type="button"
          onClick={() =>
            setForm((p) => {
              const nowSame = !p.sameAsBilling;
              const shipping = nowSame ? p.billingAddress : p.shippingAddress;
              const autoType = resolveTransactionType(sellerState, shipping, p.billingAddress);
              return {
                ...p,
                sameAsBilling: nowSame,
                shippingAddress: shipping,
                transactionType: supportsTax && autoType ? autoType : p.transactionType,
              };
            })
          }
          className="flex-shrink-0"
        >
          <span
            className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${form.sameAsBilling ? "bg-[#0085FF]" : "bg-[#E1E4EA]"}`}
          >
            <span
              className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.sameAsBilling ? "translate-x-4" : "translate-x-0"}`}
            />
          </span>
        </button>
        <span className="text-[12px] font-medium text-[#1F2937]">
          Shipping address same as billing
        </span>
      </div>
      <div className="flex flex-col @2xl:flex-row items-start gap-4 w-full">
        <div className="flex-1 min-w-0 w-full">
          <AddressFieldsGroup
            label="Billing Address"
            value={form.billingAddress}
            onUseSaved={() => setAddressDrawer("billing")}
            onChange={(next) =>
              setForm((p) => {
                const shipping = p.sameAsBilling ? next : p.shippingAddress;
                const autoType = resolveTransactionType(sellerState, shipping, next);
                return {
                  ...p,
                  billingAddress: next,
                  shippingAddress: shipping,
                  transactionType: supportsTax && autoType ? autoType : p.transactionType,
                };
              })
            }
          />
        </div>
        <div className="flex-1 min-w-0 w-full">
          <AddressFieldsGroup
            label="Shipping Address"
            value={form.shippingAddress}
            disabled={!!form.sameAsBilling}
            onUseSaved={() => setAddressDrawer("shipping")}
            onChange={(next) =>
              setForm((p) => {
                const autoType = resolveTransactionType(sellerState, next, p.billingAddress);
                return {
                  ...p,
                  shippingAddress: next,
                  transactionType: supportsTax && autoType ? autoType : p.transactionType,
                };
              })
            }
          />
        </div>
      </div>

      <AddressBookDrawer
        isOpen={addressDrawer !== null}
        onClose={() => setAddressDrawer(null)}
        currentAddress={addressDrawer === "billing" ? form.billingAddress : form.shippingAddress}
        onApply={(next) => {
          if (addressDrawer === "billing") {
            setForm((p) => ({
              ...p,
              billingAddress: next,
              shippingAddress: p.sameAsBilling ? next : p.shippingAddress,
            }));
          } else {
            setField("shippingAddress", next);
          }
        }}
      />

      {/* 03 — GST & Tax Details */}
      {supportsGSTIN && (
        <>
          <SectionHeader number={sectionNo.billing} title="GST & Tax Details" />
          <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-6 gap-y-2 w-full">
            <div className="flex flex-col gap-1">
              <FieldLabel>Receiver GSTIN</FieldLabel>
              <input
                type="text"
                value={form.receiverGSTIN}
                onChange={(e) => setField("receiverGSTIN", e.target.value)}
                placeholder="Enter Receiver GSTIN (e.g., 22AAAAA0000A1Z5)"
                className={inputClass}
              />
            </div>
            {/* No document-level GST Rate control here: GST is strictly
                item/variant-level. computeDocument() reads each line's own
                gstRate and nothing else, so a document-wide selector would
                change no total. */}
          </div>

          {taxOn && (
            <>
              <div className="grid grid-cols-1 @lg:grid-cols-2 gap-x-6 gap-y-2 w-full mt-2">
                <div className="flex flex-col gap-1">
                  <FieldLabel required>Transaction Type</FieldLabel>
                  <div className="flex items-center gap-5 h-10">
                    {[
                      { value: "intra", label: "Intra-state (CGST + SGST)" },
                      { value: "inter", label: "Inter-state (IGST)" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-[13px] text-[#1F2937] cursor-pointer">
                        <input
                          type="radio"
                          name="transactionType"
                          checked={form.transactionType === opt.value}
                          onChange={() => setField("transactionType", opt.value)}
                          className="accent-[#0085FF] w-3.5 h-3.5"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 w-full mt-2">
                <div className="flex flex-col gap-1">
                  <FieldLabel>CGST Rate</FieldLabel>
                  <div className={readOnlyClass}>{t.isInterState ? "0%" : fmtRates(true)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>SGST Rate</FieldLabel>
                  <div className={readOnlyClass}>{t.isInterState ? "0%" : fmtRates(true)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>IGST Rate</FieldLabel>
                  <div className={readOnlyClass}>{t.isInterState ? fmtRates() : "0%"}</div>
                </div>
              </div>

              <div className="flex items-start gap-2 w-full mt-2 p-2.5 rounded-lg bg-[#F0F6FF] text-[12px] text-[#1F2937]">
                <Info className="w-4 h-4 text-[#0085FF] flex-shrink-0 mt-0.5" />
                {t.isInterState
                  ? `Inter-state selected: IGST is applied per line (${fmtRates()}).`
                  : `Intra-state selected: each line is split into CGST + SGST (${fmtRates(true)} each).`}
              </div>
            </>
          )}
        </>
      )}

      {/* 04 — Items, as a real table */}
      <SectionHeader number={sectionNo.items} title={`${docName} Items`} />
      <div className="w-full overflow-x-auto rounded-lg border border-[#E1E4EA]">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[11px] font-medium text-[#525866]">
              <th className="px-2 py-2 text-left w-8">#</th>
              <th className="px-2 py-2 text-left min-w-[220px]">Item / Description</th>
              {taxOn && <th className="px-2 py-2 text-left w-24">HSN/SAC</th>}
              <th className="px-2 py-2 text-right w-20">Qty</th>
              <th className="px-2 py-2 text-right w-28">Rate (₹)</th>
              <th className="px-2 py-2 text-right w-32">Discount</th>
              <th className="px-2 py-2 text-right w-28">Amount (₹)</th>
              {taxOn && <th className="px-2 py-2 text-right w-20">GST (%)</th>}
              {taxOn && <th className="px-2 py-2 text-right w-28">GST Amount (₹)</th>}
              <th className="px-2 py-2 text-right w-28">Total (₹)</th>
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {form.items.map((item, index) => {
              const row = t.rows[index];
              const hasDescription = item.showDescription || !!item.description;
              // Show PickerSelect when: item has an _id that matches the catalogue,
              // OR when the item has no name yet (blank row ready for selection),
              // OR when the user clicked "Search" to switch back (name was cleared).
              const inCatalogue = !item.name || (item._id && catalogue.some((c) => c._id === item._id));
              return (
                <React.Fragment key={index}>
                  <tr className="border-t border-[#E1E4EA] align-top">
                    <td className="px-2 py-2 text-[#99A0AE]">{index + 1}</td>
                    <td className="px-2 py-2 min-w-[220px]">
                      {inCatalogue ? (
                        <PickerSelect
                          value={item._id}
                          options={catalogue.map((c) => ({ value: c._id, label: c.displayName }))}
                          placeholder="Search items or variants"
                          onSelect={(o) => {
                            const picked = catalogue.find((c) => c._id === o.value);
                            if (!picked) return;
                            updateItem(index, {
                              _id: picked._id,
                              // displayName is "Item - Variant" — picked.name
                              // alone would be just the variant's own name.
                              name: picked.displayName,
                              description: stripHtml(picked.description),
                              rate: picked.sellingPrice ?? "",
                              hsn: picked.hsnSac || "",
                              isVariant: picked.isVariant,
                              parentItemId: picked.parentItemId,
                              // The product's own default discount — previously
                              // never copied, so a picked item's discount stayed
                              // whatever the blank row started with (0).
                              discountType: picked.discount?.type || "amount",
                              discount: picked.discount?.value || 0,
                              // Same tax info the normal split view's add-item copies, so both
                              // layouts calculate identically (this used to keep the blank
                              // row's 0% GST and Without Tax).
                              // Per-line rate only: 0% stays 0%, and an unset
                              // product rate means untaxed, not 18%.
                              gstRate: picked.gstRate ?? 0,
                              taxInclusive: !!picked.taxInclusive,
                            });
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={item.name || ""}
                            onChange={(e) => updateItem(index, { name: e.target.value, _id: null })}
                            placeholder="Item name"
                            className="flex-1 h-10 px-2.5 rounded-lg border border-[#E1E4EA] bg-white text-[13px] text-[#1F2937] placeholder:text-[#99A0AE] focus:outline-none focus:border-[#0085FF] transition-colors"
                          />
                          <button
                            type="button"
                            title="Switch to catalogue search"
                            onClick={() => updateItem(index, { _id: null, name: "" })}
                            className="h-10 px-2 rounded-lg border border-[#E1E4EA] text-[11px] text-[#0085FF] hover:bg-blue-50 transition-colors whitespace-nowrap flex-shrink-0"
                          >
                            Search
                          </button>
                        </div>
                      )}
                      {hasDescription ? (
                        <textarea
                          rows={1}
                          autoFocus={item.showDescription && !item.description}
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          onBlur={() => {
                            if (!item.description) updateItem(index, { showDescription: false });
                          }}
                          placeholder="Describe this item — appears under its name on the document"
                          className="w-full mt-1.5 px-2.5 py-1.5 rounded-lg border border-[#E1E4EA] text-[12px] placeholder:text-[#99A0AE] focus:outline-none focus:border-[#0085FF] resize-y"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateItem(index, { showDescription: true })}
                          className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-[#0085FF] hover:underline"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Add description
                        </button>
                      )}
                    </td>
                    {taxOn && (
                      <td className="px-2 py-2">
                        <input
                          value={item.hsn}
                          onChange={(e) => updateItem(index, { hsn: e.target.value })}
                          placeholder="HSN"
                          className="w-full h-9 px-2 rounded-md border border-[#E1E4EA] text-[13px] focus:outline-none focus:border-[#0085FF]"
                        />
                      </td>
                    )}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: e.target.value })}
                        placeholder="1"
                        className="w-full h-9 px-2 rounded-md border border-[#E1E4EA] text-[13px] text-right focus:outline-none focus:border-[#0085FF]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateItem(index, { rate: e.target.value })}
                        placeholder="0.00"
                        className="w-full h-9 px-2 rounded-md border border-[#E1E4EA] text-[13px] text-right focus:outline-none focus:border-[#0085FF]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step={item.discountType === "percentage" ? "0.1" : "0.01"}
                          value={item.discount}
                          onChange={(e) => {
                            const rawValue = e.target.value;
                            const parsed = parseFloat(rawValue) || 0;
                            const base = lineTotal(item);
                            let clamped = rawValue;
                            if (item.discountType === "amount" && parsed > base) {
                              clamped = base;
                              toast.error("Item discount cannot exceed item total.");
                            } else if (item.discountType === "percentage" && parsed > 100) {
                              clamped = 100;
                              toast.error("Percentage discount cannot exceed 100%.");
                            }
                            updateItem(index, { discount: clamped });
                          }}
                          placeholder="0"
                          className="w-full h-9 px-2 rounded-md border border-[#E1E4EA] text-[13px] text-right focus:outline-none focus:border-[#0085FF]"
                        />
                        <select
                          value={item.discountType}
                          onChange={(e) => updateItem(index, { discountType: e.target.value })}
                          className="h-9 px-1 rounded-md border border-[#E1E4EA] text-[13px] bg-white focus:outline-none focus:border-[#0085FF] flex-shrink-0"
                        >
                          <option value="amount">₹</option>
                          <option value="percentage">%</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-[#1F2937]">
                      {money(row?.taxable ?? 0)}
                    </td>
                    {taxOn && <td className="px-2 py-2 text-right text-[#525866]">{row?.gstRate ?? 0}%</td>}
                    {taxOn && (
                      <td className="px-2 py-2 text-right text-[#525866]">
                        {money((row?.cgst ?? 0) + (row?.sgst ?? 0) + (row?.igst ?? 0))}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right font-semibold text-[#1F2937]">
                      {money(row?.amount ?? 0)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        title="Remove item"
                        disabled={form.items.length === 1}
                        className="w-7 h-7 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addItem}
        className="w-full h-10 min-h-[40px] flex-shrink-0 flex items-center justify-center gap-2 rounded-lg bg-white border border-[#0085FF]/20 text-sm font-medium text-[#0085FF] hover:bg-blue-50 transition-colors mt-2"
      >
        <PlusIcon className="w-4 h-4" />
        Add Another Item
      </button>

      {/* Totals — same aggregate math the PDF prints, so this can't drift. */}
      <div className="w-full flex justify-end mt-3">
        <div className="w-full max-w-xs flex flex-col gap-1.5 p-3 rounded-lg bg-[#F9FAFB] border border-[#E1E4EA]">
          <div className="flex justify-between text-[13px] text-[#525866]">
            <span>Sub Total</span>
            <span>{money(t.grossTaxable - t.documentDiscount)}</span>
          </div>
          {taxOn && (
            <div className="flex justify-between text-[13px] text-[#525866]">
              <span>Total GST</span>
              <span>{money(totalTax)}</span>
            </div>
          )}
          <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-[#F0F6FF] mt-1">
            <span className="font-bold text-[#0085FF]">Grand Total</span>
            <span className="font-bold text-[#0085FF]">{money(t.grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FullWidthDocumentPanel;
