import { useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import logo from "/DataCircles.png";

import SearchIcon from "./common/SearchIcon";
const SearchResults = ({ isOpen, onClose, searchQuery, variant = "full" }) => {
  const isPanel = variant === "panel";
  const [results, setResults] = useState({
    candidates: [],
    contacts: [],
    companies: [],
    vendors: [],
    jobs: [],
    deals: [],
    notes: [],
    invoices: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Panel variant: results sit inside per-category dropdown rows (Companies,
  // Contacts, Deals, Vendors) rather than one flat list. Every category that
  // actually matched opens as soon as results land — the hits are the point
  // of the search, so making the user click each row to see them just hides
  // the answer behind an extra step — and any row can be clicked shut again.
  // Notes and Invoices ride along the same way — the /search endpoint queries
  // both (globalSearchController.js).
  const [openCategories, setOpenCategories] = useState(() => new Set());
  const toggleCategory = (key) =>
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Unified Search API call. Goes through the shared `API` axios instance —
  // the same one every other page uses — instead of a raw fetch() with a
  // manually-fetched Auth0 token: that bypassed the app's actual auth scheme
  // (session/phone tokens via API's interceptor), so the backend rejected
  // every request and search silently always came back empty.
  const searchAPI = async (query) => {
    const res = await API.get("/search", { params: { search: query } });
    return res.data;
  };

  useEffect(() => {
    if (searchQuery && searchQuery.trim().length > 0) {
      setLoading(true);
      setError(null);

      searchAPI(searchQuery)
        .then((data) => {
          setResults({
            candidates: [], // Not implemented in API yet
            contacts: Array.isArray(data.contacts) ? data.contacts : [],
            companies: Array.isArray(data.companies) ? data.companies : [],
            vendors: Array.isArray(data.vendors) ? data.vendors : [],
            jobs: [], // Not implemented in API yet
            deals: Array.isArray(data.deals) ? data.deals : [],
            notes: Array.isArray(data.notes) ? data.notes : [],
            invoices: Array.isArray(data.invoices) ? data.invoices : [],
          });
          // Open every category that matched, so a fresh search shows its
          // hits straight away. Recomputed per search rather than merged
          // with the previous set, so rows that no longer match don't stay
          // open as empty sections.
          setOpenCategories(
            new Set(
              ["companies", "contacts", "deals", "vendors", "notes", "invoices"].filter((key) => {
                const list = data[key];
                return Array.isArray(list) && list.length > 0;
              })
            )
          );
          setLoading(false);
        })
        .catch((err) => {
          console.error("Search API error:", err);
          setError("Failed to search. Please try again.");
          setLoading(false);
        });
    } else {
      // Reset results on empty search
      setResults({
        candidates: [],
        contacts: [],
        companies: [],
        vendors: [],
        jobs: [],
        deals: [],
        notes: [],
        invoices: [],
      });
      setOpenCategories(new Set());
      setError(null);
    }
  }, [searchQuery]);

  const handleResultClick = (type, item) => {
    switch (type) {
      case "contacts":
        navigate(`/contacts/${item._id || item.id}`);
        break;
      case "companies":
        navigate(`/companies/${item._id || item.id}`);
        break;
      case "vendors":
        navigate(`/vendors/${item._id || item.id}`);
        break;
      case "deals":
        navigate(`/deals/${item._id || item.id}`);
        break;
      case "notes": {
        // No notes detail route — a note is read where it lives, on its
        // company's Notes tab.
        const companyId = item.company?._id || item.company;
        if (companyId) navigate(`/companies/${companyId}?tab=Notes`);
        break;
      }
      case "invoices":
        navigate(`/accounting?tab=tax&search=${encodeURIComponent(itemLabel(item))}`);
        break;
      default:
        console.log(`Clicked ${type}:`, item);
    }
    onClose();
  };

  // One flat, mixed list instead of four separate section blocks — each row
  // carries its own type badge (bottom-right) rather than being grouped under
  // a heading, so a company and a contact that both match can sit next to
  // each other in relevance/insertion order.
  const TYPE_LABELS = {
    companies: "Company",
    contacts: "Contact",
    vendors: "Vendor",
    deals: "Deal",
  };

  // Ranked so a match on the primary name/title comes before a match that
  // only hit some other field (address, GSTIN, email, ...) — Array.sort is
  // stable, so within each rank the original company/vendor/contact/deal
  // order is untouched, it's just the two tiers that get separated out.
  const isNameMatch = (item, query) => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    const nameField = item.name || item.title || item.companyName || "";
    return nameField.toLowerCase().includes(q);
  };

  // Category rows for the panel variant, in the fixed order they're listed
  // whether or not each one currently has matches.
  const CATEGORIES = [
    { key: "companies", label: "Companies" },
    { key: "contacts", label: "Contacts" },
    { key: "deals", label: "Deals" },
    { key: "vendors", label: "Vendors" },
    { key: "notes", label: "Notes" },
    { key: "invoices", label: "Invoices" },
  ];

  // Notes and invoices have no `name`: a note is labelled by its title (or
  // the first line of its body when untitled), an invoice by its number.
  const itemLabel = (item) =>
    item.name ||
    item.title ||
    item.companyName ||
    item.invoiceNumber ||
    (item.note ? item.note.split(/\r?\n/)[0].slice(0, 80) : "") ||
    "Untitled";

  // Base list route per category, for "View all" — it hands off to the real
  // module list rather than trying to replicate pagination/filtering here.
  const CATEGORY_ROUTES = {
    companies: "/companies",
    contacts: "/contacts",
    deals: "/deals",
    vendors: "/vendors",
    // Invoices live as the tax tab of Accounting; there is no standalone
    // notes list page, so Notes has no "View all" target.
    invoices: "/accounting?tab=tax",
  };

  const RESULTS_LIMIT = 5;

  // Most recently updated (falling back to created) first, so the five shown
  // are whichever records actually changed most recently — not just whatever
  // order the DB query happened to return them in.
  const recencyOf = (item) =>
    new Date(item.updatedAt || item.createdAt || 0).getTime();
  const sortByRecency = (items) =>
    [...items].sort((a, b) => recencyOf(b) - recencyOf(a));

  const renderCategoryAccordion = () => {
    const hasQuery = searchQuery && searchQuery.trim().length > 0;
    return (
      <div className="divide-y divide-gray-100">
        {CATEGORIES.map(({ key, label }) => {
          const items = results[key] || [];
          const visibleItems = sortByRecency(items).slice(0, RESULTS_LIMIT);
          const hasMore = items.length > RESULTS_LIMIT;
          const isOpen = openCategories.has(key);
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => toggleCategory(key)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-gray-700">{label}</span>
                  {hasQuery && (
                    <span className="flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-500 flex-shrink-0">
                      {items.length}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3 flex-shrink-0">
                  {hasQuery && hasMore && CATEGORY_ROUTES[key] && (
                    <span
                      role="link"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Hands the same query off as a URL param — each list
                        // page reads `?search=` on mount and drops it straight
                        // into its own search box, so "View all" lands on a
                        // list already filtered to this search, not the full
                        // unfiltered table.
                        const base = CATEGORY_ROUTES[key];
                        const joiner = base.includes("?") ? "&" : "?";
                        navigate(`${base}${joiner}search=${encodeURIComponent(searchQuery)}`);
                        onClose();
                      }}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      View all
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>

              {isOpen && (
                <div className="pb-2">
                  {!hasQuery ? (
                    <p className="px-4 pb-2 text-sm text-gray-400">
                      Start typing to search {label.toLowerCase()}.
                    </p>
                  ) : visibleItems.length === 0 ? (
                    <p className="px-4 pb-2 text-sm text-gray-400">
                      No {label.toLowerCase()} matched "{searchQuery}".
                    </p>
                  ) : (
                    visibleItems.map((item) => (
                      <div
                        key={item._id || item.id}
                        onClick={() => handleResultClick(key, item)}
                        className="flex items-center justify-between gap-4 px-4 py-2 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {itemLabel(item)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const flatResults = [
    ...results.companies.map((item) => ({ item, type: "companies" })),
    ...results.vendors.map((item) => ({ item, type: "vendors" })),
    ...results.contacts.map((item) => ({ item, type: "contacts" })),
    ...results.deals.map((item) => ({ item, type: "deals" })),
  ].sort((a, b) => {
    const aRank = isNameMatch(a.item, searchQuery) ? 0 : 1;
    const bRank = isNameMatch(b.item, searchQuery) ? 0 : 1;
    return aRank - bRank;
  });

  const renderResultsList = () =>
    flatResults.length > 0 ? (
      // Plain rows, not individual cards — a hairline divider between them
      // instead of each match getting its own bordered/shadowed box floating
      // in space. The type is a small label, not a pill/badge.
      <div className="divide-y divide-gray-100">
        {flatResults.map(({ item, type }) => (
          <div
            key={`${type}-${item._id || item.id}`}
            onClick={() => handleResultClick(type, item)}
            className="group flex items-end justify-between gap-4 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <h4 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate min-w-0">
              {item.name || item.title || item.companyName}
            </h4>
            <span className="flex-shrink-0 text-xs font-medium text-gray-400 whitespace-nowrap">
              {TYPE_LABELS[type]}
            </span>
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <SearchIcon className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-500 text-sm">No results found for your search</p>
      </div>
    );

  if (!isOpen) return null;

  // Panel variant docks under the navbar search bar (Header.jsx owns the
  // backdrop, close-on-click-outside and positioning there) — so it's just
  // the scrollable results filling whatever box it's given, no second
  // fixed overlay or close button stacked on top of the outer one.
  // The panel this docks into (Header.jsx) already scrolls — no second
  // h-full/overflow wrapper here, since percentage heights don't resolve
  // against a maxHeight-only ancestor and that silently broke scrolling.
  if (isPanel) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        {error && (
          <div className="mx-5 mt-5 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
            <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            </div>
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <img
              src={logo}
              alt="Loading..."
              className="animate-spin-smooth drop-shadow-lg"
              style={{ width: 36, height: 36, animationDuration: "1.8s" }}
            />
            <p className="mt-3 text-sm text-gray-600 font-medium">
              Searching across all records...
            </p>
          </div>
        ) : (
          // Companies / Contacts / Deals / Vendors as standing dropdown rows,
          // always present — matches land inside their own category, with the
          // matching rows opened for you, rather than the panel dumping every
          // hit into one flat list up front.
          renderCategoryAccordion()
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed top-[calc(64px+var(--dc-offline-offset,0px))] left-0 lg:left-16 right-0 bottom-0 bg-gray-50 z-[9991] transition-all duration-300 transform"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="absolute top-6 right-6 z-10">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg border border-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="h-full overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
                <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                </div>
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <img
                  src={logo}
                  alt="Loading..."
                  className="animate-spin-smooth drop-shadow-lg"
                  style={{
                    width: 48,
                    height: 48,
                    animationDuration: "1.8s",
                    filter: "invert(100%)",
                  }}
                />
                <p className="mt-4 text-gray-600 font-medium">
                  Searching across all records...
                </p>
              </div>
            ) : searchQuery && searchQuery.trim().length > 0 ? (
              <div className="space-y-8">
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Search Results
                  </h1>
                  <p className="text-gray-600">
                    Showing results for{" "}
                    <span className="font-semibold text-gray-800">
                      "{searchQuery}"
                    </span>
                  </p>
                </div>
                {renderResultsList()}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <SearchIcon className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Start Typing To Search
                </h2>
                <p className="text-gray-600 max-w-md mx-auto">
                  Search across companies, vendors, contacts, and deals by any
                  field. Results will appear as you type.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SearchResults;
