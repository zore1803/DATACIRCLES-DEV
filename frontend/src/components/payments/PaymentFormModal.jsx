import React, { useState, useEffect, useRef, useMemo } from "react";
import { X, ChevronDown, Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, Strikethrough as StrikethroughIcon, List as ListIcon, ListOrdered, Link as LinkIcon } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";
import BankLogo from "../BankLogo";
import PaymentAllocationPanel from "./PaymentAllocationPanel";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

export default function PaymentFormModal({ isOpen, onClose, onSuccess }) {
  useBodyScrollLock(isOpen);
  const [isSliding, setIsSliding] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [banks, setBanks] = useState([]);
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const notesEditorRef = useRef(null);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const partyInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const paymentDateInputRef = useRef(null);

  // Party selection. Which side of the ledger a party comes from is decided
  // by the direction: a Credit/IN payment is received from a customer (a
  // Company or Contact — whichever the deal behind the invoice points at),
  // a Debit/OUT payment is made to a Vendor.
  const [parties, setParties] = useState([]);
  const [partySearch, setPartySearch] = useState("");
  const [selectedParty, setSelectedParty] = useState(null);

  // Open documents for the selected party, and the split across them.
  const [openDocs, setOpenDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [allocations, setAllocations] = useState({});
  const [creditBalance, setCreditBalance] = useState(0);

  const [formData, setFormData] = useState({
    amount: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    direction: "OUT",
    paymentType: "UPI",
    bank: "",
    reference: "",
    notes: ""
  });

  const isCredit = formData.direction === "IN";
  const partyLabel = isCredit ? "Customer" : "Vendor";
  const documentType = isCredit ? "Invoice" : "Purchase";

  const fetchParties = async (direction) => {
    try {
      const res = await API.get("/payments-timeline/parties", { params: { direction } });
      setParties(res.data.parties || []);
    } catch (err) {
      console.error("Fetch parties failed", err);
      setParties([]);
    }
  };

  const fetchBanks = async () => {
    try {
      const res = await API.get("/bank-details/all");
      const fetchedBanks = Array.isArray(res.data) ? res.data : [];
      setBanks(fetchedBanks);
      const defaultBank = fetchedBanks.find(b => b.isDefault) || fetchedBanks[0];
      if (defaultBank) {
        setFormData(prev => ({ ...prev, bank: defaultBank.bankName || defaultBank.bank || "" }));
        setSelectedBankId(defaultBank._id);
      }
    } catch (err) {
      console.error("Fetch banks failed", err);
    }
  };

  // Slide-in/out animation, matching the other quick-drawer forms (ItemForm,
  // CallLogForm, CompanyForm) instead of popping open and vanishing instantly.
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsSliding(true), 10);
    } else {
      setIsSliding(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsSliding(false);
    setTimeout(() => onClose(), 300);
  };

  const resetPartyState = () => {
    setSelectedParty(null);
    setPartySearch("");
    setOpenDocs([]);
    setAllocations({});
    setCreditBalance(0);
  };

  useEffect(() => {
    if (isOpen) {
      fetchBanks();
      fetchParties("OUT");
      resetPartyState();
      setValidationErrors({});
      setFormData({
        amount: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        direction: "OUT",
        paymentType: "UPI",
        bank: "",
        reference: "",
        notes: ""
      });
      // notesEditorRef is an uncontrolled contentEditable (see execCmd below)
      // so re-opening the panel must also clear its live DOM content, not
      // just the notes state — otherwise the previous payment's notes (and
      // formatting) would still be visible underneath the reset state.
      if (notesEditorRef.current) notesEditorRef.current.innerHTML = "";
    }
  }, [isOpen]);

  // Switching direction switches which side of the ledger we're settling
  // against, so the party list, the chosen party and any split against their
  // documents all have to go — a vendor bill can't be settled by a customer
  // receipt.
  useEffect(() => {
    if (!isOpen) return;
    fetchParties(formData.direction);
    resetPartyState();
  }, [formData.direction, isOpen]);

  // The party's open documents (and any credit they're already sitting on).
  useEffect(() => {
    if (!isOpen || !selectedParty?._id) return;

    let cancelled = false;
    const load = async () => {
      setDocsLoading(true);
      try {
        const params = {
          direction: formData.direction,
          partyType: selectedParty.partyType,
          partyId: selectedParty._id,
        };
        const [docsRes, creditRes] = await Promise.all([
          API.get("/payments-timeline/open-documents", { params }),
          API.get("/payments-timeline/credit-balances", { params }),
        ]);
        if (cancelled) return;
        setOpenDocs(docsRes.data.documents || []);
        setCreditBalance(creditRes.data.total || 0);
      } catch (err) {
        if (!cancelled) {
          console.error("Fetch open documents failed", err);
          setOpenDocs([]);
          setCreditBalance(0);
        }
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedParty, formData.direction, isOpen]);

  // execCommand is deprecated but still the simplest way to drive a handful
  // of basic rich-text commands (bold/italic/underline/lists) against a
  // contentEditable div without pulling in an editor library — same pattern
  // Accounting.jsx's email composer uses.
  const execNotesCmd = (cmd, value = null) => {
    notesEditorRef.current?.focus();
    document.execCommand(cmd, false, value);
    setFormData((p) => ({ ...p, notes: notesEditorRef.current?.innerHTML || "" }));
  };
  const insertNotesLink = () => {
    const url = window.prompt("Enter URL");
    if (url) execNotesCmd("createLink", url);
  };
  const notesToolbarButtons = [
    { icon: <BoldIcon className="w-3.5 h-3.5" />, title: "Bold", onClick: () => execNotesCmd("bold") },
    { icon: <ItalicIcon className="w-3.5 h-3.5" />, title: "Italic", onClick: () => execNotesCmd("italic") },
    { icon: <UnderlineIcon className="w-3.5 h-3.5" />, title: "Underline", onClick: () => execNotesCmd("underline") },
    { icon: <StrikethroughIcon className="w-3.5 h-3.5" />, title: "Strikethrough", onClick: () => execNotesCmd("strikeThrough") },
    { icon: <ListOrdered className="w-3.5 h-3.5" />, title: "Numbered list", onClick: () => execNotesCmd("insertOrderedList") },
    { icon: <ListIcon className="w-3.5 h-3.5" />, title: "Bulleted list", onClick: () => execNotesCmd("insertUnorderedList") },
    { icon: <LinkIcon className="w-3.5 h-3.5" />, title: "Insert link", onClick: insertNotesLink },
  ];

  const allocationLines = useMemo(
    () =>
      Object.entries(allocations)
        .map(([documentId, value]) => ({
          documentId,
          documentType,
          amount: Number(value) || 0,
        }))
        .filter((a) => a.amount > 0),
    [allocations, documentType]
  );

  const totalAllocated = useMemo(
    () => allocationLines.reduce((sum, a) => sum + a.amount, 0),
    [allocationLines]
  );

  const validateForm = () => {
    const errors = {};
    if (!selectedParty && !(formData.direction === "OUT" && partySearch.trim())) {
      // A new vendor can be created inline by typing a name; a customer must
      // be an existing Company/Contact, since an invoice can only exist
      // against one that's already in the CRM.
      errors.party = isCredit
        ? "Select the customer this payment came from"
        : "Vendor is required";
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      errors.amount = "Amount is required";
    }
    if (!formData.paymentDate) {
      errors.paymentDate = "Payment date is required";
    }
    if (totalAllocated > Number(formData.amount || 0) + 0.01) {
      errors.allocation = "Applied amounts add up to more than the payment";
    }
    for (const doc of openDocs) {
      const applied = Number(allocations[doc._id] || 0);
      if (applied > doc.due + 0.01) {
        errors.allocation = `₹${applied} applied to ${doc.number || "a document"} is more than its ₹${doc.due} balance`;
        break;
      }
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);

      if (errors.allocation && !errors.party && !errors.amount && !errors.paymentDate) {
        toast.error(errors.allocation);
        return;
      }

      const candidates = [
        errors.party ? partyInputRef.current : null,
        errors.amount ? amountInputRef.current : null,
        errors.paymentDate ? paymentDateInputRef.current : null,
      ].filter(Boolean);

      let topMost = null;
      for (const el of candidates) {
        if (!topMost || el.getBoundingClientRect().top < topMost.getBoundingClientRect().top) {
          topMost = el;
        }
      }
      topMost?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        partyType: selectedParty?.partyType,
        party: selectedParty?._id,
        // Legacy vendor fields — still what the server uses to create a new
        // vendor on the fly for an OUT payment typed in by name.
        vendor: selectedParty?.partyType === "Vendor" ? selectedParty._id : undefined,
        vendorName: !selectedParty && formData.direction === "OUT" ? partySearch : undefined,
        allocations: allocationLines,
      };
      const res = await API.post("/payments-timeline", payload);

      const leftover = Number(res.data?.unallocatedAmount) || 0;
      if (leftover > 0.01 && allocationLines.length > 0) {
        toast.success(
          `Payment recorded — ₹${leftover.toLocaleString("en-IN")} held as credit for ${selectedParty?.name || partySearch}`
        );
      } else {
        toast.success("Payment added successfully!");
      }
      onSuccess();
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to add payment");
    } finally {
      setLoading(false);
    }
  };

  if (!shouldRender) return null;

  const filteredParties = parties.filter(p =>
    (p.name || "").toLowerCase().includes(partySearch.toLowerCase())
  );

  const selectedBankObj = banks.find(bk => bk._id === selectedBankId);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100000] transition-opacity duration-300"
        style={{ opacity: isSliding ? 1 : 0 }}
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className={`fixed dc-panel-card dc-panel-w bg-white shadow-2xl flex flex-col z-[100001] overflow-hidden transform transition-transform duration-300 ease-out ${isSliding ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {isCredit ? "Record Customer Payment" : "Record Vendor Payment"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto flex-1 px-8 py-6">
          <form id="payment-form" onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Amount and direction come first: direction decides whether the
                next field asks for a customer or a vendor, and which
                documents can be settled. */}
            <div ref={amountInputRef}>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Amount <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1F2937] opacity-50 text-[12px]">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={e => {
                    setFormData(p => ({ ...p, amount: e.target.value }));
                    if (validationErrors.amount) setValidationErrors((p) => ({ ...p, amount: undefined }));
                  }}
                  className={`w-full border rounded-full pl-7 pr-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all ${validationErrors.amount ? "border-red-500" : "border-[#1F2937]/10"}`}
                />
              </div>
              {validationErrors.amount && (
                <p className="mt-1 text-xs text-red-600">{validationErrors.amount}</p>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Direction <span className="text-red-500">*</span></label>
              <select
                value={formData.direction}
                onChange={e => setFormData(p => ({ ...p, direction: e.target.value }))}
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all bg-white cursor-pointer"
              >
                <option value="OUT">Debit (Out) — paid to a vendor</option>
                <option value="IN">Credit (In) — received from a customer</option>
              </select>
            </div>

            <div ref={partyInputRef}>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">
                {partyLabel} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={partySearch}
                  onChange={(e) => {
                    setPartySearch(e.target.value);
                    setSelectedParty(null);
                    setOpenDocs([]);
                    setAllocations({});
                    setCreditBalance(0);
                    if (validationErrors.party) setValidationErrors((p) => ({ ...p, party: undefined }));
                  }}
                  placeholder={isCredit ? "Search customers..." : "Search or enter new vendor name"}
                  className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 ${validationErrors.party ? "border-red-500" : "border-[#1F2937]/10"}`}
                />
                {validationErrors.party && (
                  <p className="mt-1 text-xs text-red-600">{validationErrors.party}</p>
                )}
                {partySearch && !selectedParty && filteredParties.length > 0 && (
                  <div className="absolute z-10 w-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {filteredParties.map(p => (
                      <button
                        key={`${p.partyType}-${p._id}`}
                        type="button"
                        onClick={() => {
                          setSelectedParty(p);
                          setPartySearch(p.name);
                          setAllocations({});
                        }}
                        className="w-full flex items-center justify-between gap-2 text-left px-4 py-2.5 text-[12px] hover:bg-gray-50 transition-colors"
                      >
                        <span className="truncate text-[#1F2937]">{p.name}</span>
                        {/* Customers can be a company or an individual contact
                            and the names can collide, so say which. */}
                        {p.partyType !== "Vendor" && (
                          <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-[#78788D]">
                            {p.partyType}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {isCredit && partySearch && !selectedParty && filteredParties.length === 0 && (
                  <p className="mt-1 text-[11px] text-[#1F2937] opacity-50">
                    No customer matches — only customers with an existing deal can be paid against.
                  </p>
                )}
              </div>
            </div>

            {/* The allocation step. */}
            <PaymentAllocationPanel
              documentType={documentType}
              documents={openDocs}
              loading={docsLoading}
              allocations={allocations}
              onChange={(next) => {
                setAllocations(next);
                if (validationErrors.allocation) setValidationErrors((p) => ({ ...p, allocation: undefined }));
              }}
              paymentAmount={formData.amount}
              partySelected={Boolean(selectedParty)}
              creditBalance={creditBalance}
            />

            <div ref={paymentDateInputRef}>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Payment Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={formData.paymentDate}
                onChange={e => {
                  setFormData(p => ({ ...p, paymentDate: e.target.value }));
                  if (validationErrors.paymentDate) setValidationErrors((p) => ({ ...p, paymentDate: undefined }));
                }}
                className={`w-full border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all ${validationErrors.paymentDate ? "border-red-500" : "border-[#1F2937]/10"}`}
              />
              {validationErrors.paymentDate && (
                <p className="mt-1 text-xs text-red-600">{validationErrors.paymentDate}</p>
              )}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Type <span className="text-red-500">*</span></label>
              <select
                value={formData.paymentType}
                onChange={e => setFormData(p => ({ ...p, paymentType: e.target.value }))}
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all bg-white cursor-pointer"
              >
                <option value="UPI">UPI</option>
                <option value="Net Banking">Net Banking</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Cheque">Cheque</option>
                <option value="EMI">EMI</option>
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Reference</label>
              <input
                type="text"
                value={formData.reference}
                onChange={e => setFormData(p => ({ ...p, reference: e.target.value }))}
                placeholder="UTR / cheque no. / txn id"
                className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Select Bank Account</label>
              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => setBankDropdownOpen(!bankDropdownOpen)}
                  className="w-full flex items-center justify-between border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all bg-white"
                >
                  {selectedBankObj ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <BankLogo bankName={selectedBankObj.bankName || selectedBankObj.bank || ""} size={20} />
                      <span className="text-[12px] font-medium text-[#1F2937] truncate">
                        {selectedBankObj.bankName || selectedBankObj.bank}
                        {selectedBankObj.branch ? ` (${selectedBankObj.branch})` : ""}
                        {selectedBankObj.accountNumber ? ` - XXXX${selectedBankObj.accountNumber.slice(-4)}` : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[#1F2937] opacity-50 text-[12px]">Select a bank...</span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform ${bankDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {bankDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {banks.map(b => {
                      const name = b.bankName || b.bank || "Bank";
                      const branch = b.branch ? ` (${b.branch})` : "";
                      const lastFour = b.accountNumber ? b.accountNumber.slice(-4) : "";
                      return (
                        <button
                          key={b._id}
                          type="button"
                          onClick={() => {
                            setSelectedBankId(b._id);
                            setFormData(p => ({ ...p, bank: name }));
                            setBankDropdownOpen(false);
                          }}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12px] hover:bg-gray-50 text-left transition-colors"
                        >
                          <BankLogo bankName={name} size={20} />
                          <span className="font-medium text-[#1F2937]">{name}{branch}</span>
                          {lastFour && <span className="text-[#1F2937] opacity-50 text-[11px] ml-auto">XXXX{lastFour}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Notes</label>
              <div className="flex items-center gap-0.5 border border-[#1F2937]/10 border-b-0 rounded-t-2xl bg-gray-50 px-1.5 py-1">
                {notesToolbarButtons.map(({ icon, title, onClick }) => (
                  <button
                    key={title}
                    type="button"
                    title={title}
                    // Mousedown (not click) so the editor's text selection
                    // survives — a click first steals focus/selection away
                    // from the contentEditable.
                    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
                    className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <div
                ref={(el) => {
                  notesEditorRef.current = el;
                  if (el && el.dataset.init !== "true") {
                    el.innerHTML = formData.notes;
                    el.dataset.init = "true";
                  }
                }}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => {
                  const html = e.currentTarget.innerHTML;
                  setFormData((p) => ({ ...p, notes: html }));
                }}
                data-placeholder="Optional payment notes..."
                className="w-full min-h-[72px] px-3 py-2 border border-[#1F2937]/10 rounded-b-2xl text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all empty:before:content-[attr(data-placeholder)] empty:before:text-[#1F2937] empty:before:opacity-50 [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              />
            </div>
          </form>
        </div>

        <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="payment-form"
            disabled={loading}
            className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Add Payment
          </button>
        </div>
      </div>
    </>
  );
}
