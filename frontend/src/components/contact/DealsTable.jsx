import PlusIcon from "../common/PlusIcon";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import QuickDealForm from "../deal/QuickDealForm";
import toast from "react-hot-toast";

const DealsTable = ({ deals = [], contact, company, allCompanies = [], onDealCreated }) => {
  const [showQuickDealForm, setShowQuickDealForm] = useState(false);

  // Handle deal creation
  const handleDealCreated = (newDeal) => {
    // Call parent callback to update parent state
    if (onDealCreated) {
      onDealCreated(newDeal);
    }
    
    // Close the form
    setShowQuickDealForm(false);
    
    // Show success message (moved to parent, but can keep here too)
  };

  const handleCloseForm = () => {
    setShowQuickDealForm(false);
  };

  return (
    <>
      <div>
        {/* Add Deal Button - Top Right */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowQuickDealForm(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-[#0085FF] text-white text-sm font-medium rounded-full hover:bg-blue-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Deal
          </button>
        </div>

        {/* Full-bleed table — breaks out of the card's px-4 so the header band
            and row dividers run edge to edge, like the main Deals list. */}
        <div className="-mx-4 border-t border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="pl-4 pr-4 py-3 text-left font-medium text-gray-700">Deal Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Stage</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Last Updated</th>
                <th className="pl-4 pr-4 py-3 text-left font-medium text-gray-700">Company</th>
              </tr>
            </thead>
            {deals?.length > 0 ? (
              <tbody className="divide-y divide-gray-100">
                {deals.map((deal) => (
                  <tr key={deal._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/deals/${deal._id}`}
                        className="text-gray-900 hover:underline font-medium"
                      >
                        {deal.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        deal.status === 'Won'
                          ? 'bg-blue-900 text-white'
                          : deal.status === 'Lost'
                          ? 'bg-blue-300 text-gray-700'
                          : 'bg-blue-100 text-gray-800'
                      }`}>
                        {deal.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      <h6>₹{deal.amount?.toLocaleString("en-IN") || 0}</h6>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(deal.updatedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {deal.company?.name || company?.name || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                <tr>
                  <td colSpan="5" className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <PlusIcon className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">No deals yet</p>
                        <p className="text-xs text-gray-600">Create your first deal to get started</p>
                      </div>
                      <button
                        onClick={() => setShowQuickDealForm(true)}
                        className="px-4 py-2 bg-[#0085FF] text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Create Deal
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>

      {/* Quick Deal Form with Pre-filled Company and Contact */}
      {showQuickDealForm && (
        <QuickDealForm
          companies={company ? [company] : (allCompanies.length > 0 ? allCompanies : [])}
          contacts={contact ? [contact] : []}
          initialCompanyId={company?._id}
          initialContactId={contact?._id}
          isContactLocked={!!contact}
          onDealCreated={handleDealCreated}
          onRequestClose={handleCloseForm}
        />
      )}
    </>
  );
};

export default DealsTable;
