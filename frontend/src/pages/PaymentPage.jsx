import CalendarIcon from "../components/common/CalendarIcon";
import DeleteIcon from "../components/common/DeleteIcon";
import BulkDeleteModal from "../components/common/BulkDeleteModal";
import Checkbox from "../components/common/Checkbox";
import PlusIcon from "../components/common/PlusIcon";
import MoreIcon from "../components/common/MoreIcon";
import React, { useEffect, useState } from "react";
import API from "../services/api";
import { useNavigate } from "react-router-dom";
import PaymentReceipt from "../components/vendor/PaymentReceipt";
import BulkActions from "../components/BulkActions"; // Make sure this exists
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  Truck,
  CheckSquare,
  X,
  ArrowUpCircle,
  ArrowDownCircle,
  Building,
} from "lucide-react";
import { formatNumberFixed } from "../utils/numberFormatter";
import toast from "react-hot-toast";
import VendorPaymentForm from "../components/vendor/VendorPaymentForm";
import logo from "/DataCircles.png";
import VideoTutorialModal from "../components/VideoTutorialModal";
import { getVideoTutorial } from "../utils/videoTutorials";
import VideoTutorialButton from "../components/VideoTutorialButton";
import PaymentPreview from "../components/vendor/venerPaymentPreview";
import AppToaster from "../components/AppToaster";

import SearchIcon from "../components/common/SearchIcon";
import FilterIcon from "../components/common/FilterIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";
const PaymentPage = () => {
  const [vendors, setVendors] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [paymentToEdit, setPaymentToEdit] = useState(null);
  const [formDirection, setFormDirection] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filterDirection, setFilterDirection] = useState("");

  // Bulk Selection
  const [selectedPayments, setSelectedPayments] = useState([]);
  const [selectionMode, setSelectionMode] = useState(true);
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Modals
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [paymentToPreview, setPaymentToPreview] = useState(null);
  // Video Tutorial State
  const [showVideoTutorial, setShowVideoTutorial] = useState(false);

  const navigate = useNavigate();

  // Pagination
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    limit: 10,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Sorting
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: null,
  });

  const directionOptions = ["IN", "OUT"];

  const handlePreview = (payment) => {
    setPaymentToPreview(payment);
    setShowPreview(true);
  };

  // Long press event handlers
  const handleMouseDown = (paymentId) => {
    const timer = setTimeout(() => {
      setSelectionMode(true);
      handleSelectPayment(paymentId);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleMouseUp = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  };

  const handleTouchStart = (paymentId) => {
    const timer = setTimeout(() => {
      setSelectionMode(true);
      handleSelectPayment(paymentId);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  };

  const handleSelectPayment = (paymentId) => {
    setSelectedPayments((prev) =>
      prev.includes(paymentId)
        ? prev.filter((id) => id !== paymentId)
        : [...prev, paymentId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPayments.length === payments.length && payments.length > 0) {
      setSelectedPayments([]);
    } else {
      setSelectedPayments(payments.map((p) => p._id));
    }
    setSelectionMode(true);
  };

  const exitSelectionMode = () => {
    setSelectionMode(true);
    setSelectedPayments([]);
    setShowBulkActions(false);
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset on filter/search change
  useEffect(() => {
    exitSelectionMode();
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  }, [debouncedSearchTerm, filterDirection]);

  // Fetch data
  useEffect(() => {
    fetchPayments();
  }, [
    pagination.currentPage,
    pagination.limit,
    sortConfig,
    debouncedSearchTerm,
    filterDirection,
  ]);

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const res = await API.get("/vendors");
      setVendors(res.data || []);
    } catch (err) {
      toast.error("Failed to load vendors");
    }
  };

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.currentPage,
        limit: pagination.limit,
      });
      if (sortConfig.key) {
        params.append("sortBy", sortConfig.key);
        params.append("sortOrder", sortConfig.direction || "asc");
      } else {
        params.append("sortBy", "createdAt");
        params.append("sortOrder", "desc");
      }
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      if (filterDirection) params.append("direction", filterDirection);

      const res = await API.get(
        `/vendors/payments/pagination?${params.toString()}`
      );
      setPayments(res.data.payments || []);
      setPagination((prev) => ({
        ...prev,
        ...res.data.pagination,
      }));
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load payments");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePayment = async (payload) => {
    console.log("Creating payment with payload:", payload);

    try {
      // Make the POST request to create the payment
      const response = await API.post(
        `/vendors/${payload.vendor}/payments`,
        payload
      );
      console.log("Payment created:", response.data);

      // Show success message
      toast.success("Payment added successfully");

      // Refresh the payments list
      await fetchPayments();

      // Exit selection mode if active
      exitSelectionMode();

      return response.data;
    } catch (error) {
      console.error("Error creating payment:", error);
      // Throw error to be caught by form
      throw error;
    }
  };

  const handleSuccess = () => {
    toast.success("Payment saved successfully");
    fetchPayments();
    exitSelectionMode();
  };

  const handleEdit = (payment) => {
    setPaymentToEdit(payment);
    setFormDirection(payment.direction);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setPaymentToEdit(null);
    setFormDirection(null);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    setPaymentToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;
    const toastId = toast.loading("Deleting...");
    try {
      const payment = payments.find((p) => p._id === paymentToDelete);
      await API.delete(
        `/vendors/${payment.vendor._id}/payments/${paymentToDelete}`
      );
      toast.success("Payment deleted", { id: toastId });
      fetchPayments();
      exitSelectionMode();
    } catch (err) {
      toast.error(err.response?.data?.error || "Delete failed", {
        id: toastId,
      });
    } finally {
      setShowDeleteModal(false);
      setPaymentToDelete(null);
    }
  };

  // const handleViewReceipt = (payment) => {
  //   setSelectedPaymentForReceipt(payment);
  //   setShowReceipt(true);
  // };

  // Bulk Delete Only (Payments don't have status)
  const handleBulkDelete = async (itemIds) => {
    setBulkLoading(true);
    try {
      await Promise.all(
        itemIds.map(async (id) => {
          const payment = payments.find((p) => p._id === id);
          if (payment?.vendor?._id) {
            await API.delete(`/vendors/${payment.vendor._id}/payments/${id}`);
          }
        })
      );
      toast.success(`Deleted ${itemIds.length} payments`);
      fetchPayments();
      exitSelectionMode();
    } catch (err) {
      toast.error("Bulk delete failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const paymentFieldConfig = {
    fields: [], // No status field for payments
    hideUpdate: true, // Hide "Update" tab in BulkActions
  };

  const getDirectionBadgeColor = (direction) => {
    return direction === "IN"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-[#FCEAEA] text-[#EA4B4B] border-[#F5C7C7]";
  };

  // Cycles asc -> desc -> off
  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key && prev.direction === "asc") return { key, direction: "desc" };
      if (prev.key === key && prev.direction === "desc") return { key: null, direction: null };
      return { key, direction: "asc" };
    });
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  };

  const SortableHeader = ({ field, children }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none transition-colors"
    >
      <div className="flex items-center gap-2">
        {children}
        <div className="flex flex-col">
          <ChevronUp
            className={`w-3 h-3 ${sortConfig.key === field && sortConfig.direction === "asc"
                ? "text-blue-600"
                : "text-gray-400"
              }`}
          />
          <ChevronDown
            className={`w-3 h-3 -mt-1 ${sortConfig.key === field && sortConfig.direction === "desc"
                ? "text-blue-600"
                : "text-gray-400"
              }`}
          />
        </div>
      </div>
    </th>
  );

  const PaginationControls = () => {
    const {
      currentPage,
      totalPages,
      totalCount,
      limit,
      hasNextPage,
      hasPrevPage,
    } = pagination;
    if (totalCount === 0) return null;

    const startItem = (currentPage - 1) * limit + 1;
    const endItem = Math.min(currentPage * limit, totalCount);

    const getPageNumbers = () => {
      const delta = 2;
      const range = [];
      for (
        let i = Math.max(2, currentPage - delta);
        i <= Math.min(totalPages - 1, currentPage + delta);
        i++
      ) {
        range.push(i);
      }
      const result = [1];
      if (currentPage - delta > 2) result.push("...");
      result.push(...range);
      if (currentPage + delta < totalPages - 1) result.push("...");
      if (totalPages > 1) result.push(totalPages);
      return result.filter((v, i, a) => a.indexOf(v) === i);
    };

    return (
      <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div className="flex items-center space-x-2">
            <p className="text-sm text-gray-700">
              Showing <span className="font-semibold">{startItem}</span> to{" "}
              <span className="font-semibold">{endItem}</span> of{" "}
              <span className="font-semibold">{totalCount}</span>
            </p>
            <select
              value={limit}
              onChange={(e) => handleLimitChange(parseInt(e.target.value))}
              className="ml-2 border rounded-lg px-3 py-1.5 text-sm"
            >
              {[10, 20, 50, 100].map((v) => (
                <option key={v} value={v}>
                  {v} per page
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={!hasPrevPage}
              className="pagination-btn"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {getPageNumbers().map((num, i) =>
              num === "..." ? (
                <span key={i} className="px-4 py-2 text-sm text-gray-700">
                  ...
                </span>
              ) : (
                <button
                  key={num}
                  onClick={() => handlePageChange(num)}
                  className={`pagination-btn ${num === currentPage ? "text-gary-800" : ""
                    }`}
                >
                  {num}
                </button>
              )
            )}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!hasNextPage}
              className="pagination-btn"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handlePageChange = (page) => {
    if (
      page >= 1 &&
      page <= pagination.totalPages &&
      page !== pagination.currentPage
    ) {
      setPagination((prev) => ({ ...prev, currentPage: page }));
      exitSelectionMode();
    }
  };

  const handleLimitChange = (limit) => {
    setPagination((prev) => ({ ...prev, limit, currentPage: 1 }));
    exitSelectionMode();
  };

  return (
    <>
      <AppToaster />

      <VideoTutorialModal
        isOpen={showVideoTutorial}
        onClose={() => setShowVideoTutorial(false)}
        videoId={getVideoTutorial("vendors-payment")?.videoId}
        title={getVideoTutorial("vendors-payment")?.title}
      />

      <BulkActions
        isOpen={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        selectedItems={payments.filter((p) => selectedPayments.includes(p._id))}
        onBulkDelete={handleBulkDelete}
        fieldConfig={paymentFieldConfig}
        module="payments"
        loading={bulkLoading}
      />

      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        message={
          <>
            Are you sure you want to delete <strong>{selectedPayments.length}</strong> selected Payments? This action cannot be undone.
          </>
        }
        loading={bulkLoading}
        onCancel={() => setShowBulkDeleteModal(false)}
        onConfirm={async () => {
          await handleBulkDelete(selectedPayments);
          setShowBulkDeleteModal(false);
        }}
      />

      <div className="">
        {/* Header */}
        <div className="md:flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-xl">
              <IndianRupee className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-sf text-gray-900">
                Payments
              </h1>
              <p className="text-sm text-gray-500 font-inter">
                Manage vendor payments & receipts
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4 md:mt-0">
            
            <button
              onClick={handleAddNew}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 transition shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              Add Payment
            </button>
          </div>
        </div>

        {/* Form */}
        <VendorPaymentForm
          open={showForm}
          vendorId={paymentToEdit?.vendor?._id || null}
          direction={formDirection}
          onSave={handleSavePayment}
          onClose={() => {
            setShowForm(false);
            setPaymentToEdit(null);
            setFormDirection(null);
          }}
          paymentToEdit={paymentToEdit}
          vendors={vendors}
        />

        {/* Payment Preview */}
        <PaymentPreview
          payment={paymentToPreview}
          isOpen={showPreview}
          onClose={() => {
            setShowPreview(false);
            setPaymentToPreview(null);
          }}
        />

        {/* Selection Mode Banner */}
        {selectionMode && selectedPayments.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-5 h-5 text-blue-600" />
              <span className="text-blue-800 font-semibold">
                {selectedPayments.length} payment
                {selectedPayments.length > 1 ? "s" : ""} selected
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
              >
                <DeleteIcon className="w-4 h-4" />
                Bulk Delete
              </button>
              <button
                onClick={exitSelectionMode}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search & Filter */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 -translate-y-1/2 top-1/2 w-4 h-4 text-[#525866]" />
              <input
                type="text"
                placeholder="Search payments..."
                className="w-full pl-10 pr-4 py-2.5 bg-gradient-to-r from-white to-blue-100 border border-[#E0E0E1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <FilterIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={filterDirection}
                onChange={(e) => setFilterDirection(e.target.value)}
                className="pl-9 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white"
              >
                <option value="">All Directions</option>
                {directionOptions.map((d) => (
                  <option key={d} value={d}>
                    {d === "IN" ? "Received" : "Paid"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {selectionMode && (
                    <th className="px-4 py-4">
                      <Checkbox checked={
                          selectedPayments.length === payments.length &&
                          payments.length > 0
                        } onChange={handleSelectAll}  uncheckedColor="text-[#525866]"/>
                    </th>
                  )}
                  <SortableHeader field="paymentDate">
                    <CalendarIcon className="w-4 h-4 inline mr-1" />
                    Date
                  </SortableHeader>
                  <SortableHeader field="vendor.name">
                    <Truck className="w-4 h-4 inline mr-1" />
                    Vendor
                  </SortableHeader>
                  <SortableHeader field="amount">
                    <IndianRupee className="w-4 h-4 inline mr-1" />
                    Amount
                  </SortableHeader>
                  <SortableHeader field="direction">Direction</SortableHeader>
                  <SortableHeader field="paymentType">Type</SortableHeader>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                      <MoreIcon className="w-4 h-4" />
                      Actions
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={selectionMode ? 7 : 6}
                      className="text-center py-12"
                    >
                      <div className="flex flex-col items-center">
                        <img
                          src={logo}
                          alt="Loading"
                          className="animate-spin-slow w-12 h-12"
                        />
                        <p className="mt-3 text-gray-600">
                          Loading payments...
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={selectionMode ? 7 : 6}
                      className="text-center py-12 text-gray-500"
                    >
                      <IndianRupee className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p className="font-medium">No payments found</p>
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr
                      key={p._id}
                      onMouseDown={() => handleMouseDown(p._id)}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onTouchStart={() => handleTouchStart(p._id)}
                      onTouchEnd={handleTouchEnd}
                      className={`hover:bg-gray-50 transition-colors ${selectedPayments.includes(p._id) ? "bg-blue-50" : ""
                        }`}
                    >
                      {selectionMode && (
                        <td className="px-4 py-4">
                          <Checkbox checked={selectedPayments.includes(p._id)} onChange={() => handleSelectPayment(p._id)} />
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm">
                        {new Date(p.paymentDate).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          onClick={() =>
                            p.vendor?._id &&
                            navigate(`/vendors/${p.vendor._id}`)
                          }
                          className="text-sm font-medium text-blue-600 hover:underline cursor-pointer"
                        >
                          {p.vendor?.name || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <h6 className="text-sm text-gray-700 font-mono">
                            ₹{formatNumberFixed(p.amount)}
                          </h6>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1.5 border rounded-lg text-xs font-semibold ${getDirectionBadgeColor(
                            p.direction
                          )}`}
                        >
                          {p.direction === "IN" ? (
                            <ArrowDownCircle className="w-4 h-4 inline mr-1" />
                          ) : (
                            <ArrowUpCircle className="w-4 h-4 inline mr-1" />
                          )}
                          {p.direction}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-700">
                          {p.paymentType || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePreview(p)}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Preview"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(p)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p?._id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <DeleteIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls />
        </div>

        {/* Receipt Modal */}
        {/* {showReceipt && selectedPaymentForReceipt && (
          <PaymentReceipt
            payment={selectedPaymentForReceipt}
            onClose={() => {
              setShowReceipt(false);
              setSelectedPaymentForReceipt(null);
            }}
            companyDetails={companyDetails}
          />
        )} */}

        {/* Delete Confirmation */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[10000]">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-red-100 p-2 rounded-lg">
                  <DeleteIcon className="w-4 h-4 text-red-600" />
                </div>
                <h2 className="text-xl font-semibold">Delete Payment</h2>
              </div>
              <p className="text-gray-600 mb-6">
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setPaymentToDelete(null);
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <DeleteIcon className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default PaymentPage;
