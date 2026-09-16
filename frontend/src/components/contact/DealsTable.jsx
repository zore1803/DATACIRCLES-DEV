import PlusIcon from "../common/PlusIcon";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import QuickDealForm from "../deal/QuickDealForm";
import toast from "react-hot-toast";

const DealsTable = ({ deals = [], contact, company, onDealCreated }) => {
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
    toast.success("Deal created!");
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

        <div className="overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm text-gray-700">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-900">Deal Name</th>
                <th className="px-4 py-3 font-medium text-gray-900">Stage</th>
                <th className="px-4 py-3 font-medium text-gray-900">Amount</th>
                <th className="px-4 py-3 font-medium text-gray-900">Last Updated</th>
                <th className="px-4 py-3 font-medium text-gray-900">Company</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {deals?.length > 0 ? (
                deals.map((deal) => (
                  <tr key={deal._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/deals/${deal._id}`}
                        className="text-gray-900 hover:text-gray-700 hover:underline font-medium"
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
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <h6>₹{deal.amount?.toLocaleString() || 0}</h6>
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
                ))
              ) : (
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
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Deal Form with Pre-filled Company and Contact */}
      {showQuickDealForm && (
        <QuickDealForm
          companies={company ? [company] : []} // Pass single company
          contacts={contact ? [contact] : []} // Pass single contact
          preSelectedCompany={company?._id} // Pre-select the company
          preSelectedContact={contact?._id} // Pre-select the contact
          onDealCreated={handleDealCreated}
          onRequestClose={handleCloseForm}
        />
      )}
    </>
  );
};

export default DealsTable;
