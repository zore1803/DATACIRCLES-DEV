import PlusIcon from "../common/PlusIcon";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EditablePaginationButtons } from "../common/EditablePaginationButtons";
import API from "../../services/api";
import QuickDealForm from "../deal/QuickDealForm";
import toast from "react-hot-toast";
import FilterIcon from "../common/FilterIcon";

const CompanyDeals = ({ deals, companyId, setDeals }) => {
  const [showDealForm, setShowDealForm] = useState(false);
  const [dealFilter, setDealFilter] = useState("");
  const [dealSort, setDealSort] = useState("date-desc");
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Handlers
  const handleDealCreated = async (newDeal) => {
    try {
      const resDeals = await API.get("/deals");
      setDeals(resDeals.data.filter((d) => d.company?._id === companyId));
    } catch (err) {
      toast.error("Failed to refresh deals list.");
    }
    setShowDealForm(false);
  };

  const getFilteredAndSortedDeals = () => {
    let filtered = [...deals];

    if (dealFilter) {
      filtered = filtered.filter(
        (deal) =>
          deal.title.toLowerCase().includes(dealFilter.toLowerCase()) ||
          deal.status.toLowerCase().includes(dealFilter.toLowerCase()),
      );
    }

    filtered.sort((a, b) => {
      switch (dealSort) {
        case "name-asc":
          return a.title.localeCompare(b.title);
        case "name-desc":
          return b.title.localeCompare(a.title);
        case "amount-asc":
          return a.amount - b.amount;
        case "amount-desc":
          return b.amount - a.amount;
        case "date-asc":
          return new Date(a.updatedAt) - new Date(b.updatedAt);
        case "date-desc":
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        default:
          return 0;
      }
    });

    return filtered;
  };

  const filteredDeals = getFilteredAndSortedDeals();

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dealFilter, dealSort]);

  // Pagination Logic
  const totalCount = filteredDeals.length;
  const totalPages = Math.ceil(totalCount / limit);
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, totalCount);
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  const currentDeals = filteredDeals.slice((currentPage - 1) * limit, currentPage * limit);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setCurrentPage(1);
  };

  const getPageNumbers = () => {
    const items = [1];
    if (currentPage > 2) items.push("left-dots");
    if (currentPage !== 1 && currentPage !== totalPages) items.push(currentPage);
    if (currentPage < totalPages - 1) items.push("right-dots");
    if (totalPages > 1) items.push(totalPages);
    return items;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Deals</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 text-gray-700 hover:text-gray-900 text-sm font-medium transition-colors px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <FilterIcon size={16} />
            Filter
          </button>
          <button
            onClick={() => setShowDealForm(true)}
            className="flex items-center gap-1 text-gray-700 hover:text-gray-900 text-sm font-medium transition-colors px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <PlusIcon className="w-4 h-4" />
            Add Deal
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Search deals..."
                value={dealFilter}
                onChange={(e) => setDealFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Sort By
              </label>
              <select
                value={dealSort}
                onChange={(e) => setDealSort(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                <option value="date-desc">Date (Newest First)</option>
                <option value="date-asc">Date (Oldest First)</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="amount-desc">Amount (High to Low)</option>
                <option value="amount-asc">Amount (Low to High)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Deal Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Stage
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Amount
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Last Updated
              </th>
            </tr>
          </thead>
          {currentDeals && currentDeals.length > 0 ? (
            <tbody className="divide-y divide-gray-100">
              {currentDeals.map((deal) => (
                <tr key={deal._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/deals/${deal._id}`}
                      className="text-gray-900 hover:underline"
                    >
                      {deal.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{deal.status}</td>
                  <td className="px-4 py-3 text-gray-900">
                    <h6>₹{deal.amount.toLocaleString()}</h6>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(deal.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody>
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  {dealFilter
                    ? "No deals match your search."
                    : "No deals available."}
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6 mt-4 rounded-lg border">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!hasPrevPage}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!hasNextPage}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>

          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-700 font-inter">
                Showing <span className="font-semibold">{startItem}</span> to{" "}
                <span className="font-semibold">{endItem}</span> of{" "}
                <span className="font-semibold">{totalCount}</span> results
              </p>
              <select
                value={limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-inter"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <EditablePaginationButtons
              currentPage={currentPage}
              totalPages={totalPages}
              hasPrevPage={hasPrevPage}
              hasNextPage={hasNextPage}
              onPageChange={handlePageChange}
              getPageNumbers={getPageNumbers}
            />
          </div>
        </div>
      )}

      {showDealForm && (
        <QuickDealForm
          companyId={companyId}
          onClose={() => setShowDealForm(false)}
          onSuccess={handleDealCreated}
        />
      )}
    </div>
  );
};

export default CompanyDeals;
