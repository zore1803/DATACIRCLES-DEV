import React, { useState } from "react";

// Info banner shared by the Company/Contact/Deal/Vendor import modals. The
// "Show More" link in each of them was rendered without a handler, so the
// help it promised was unreachable; the copy below describes what those
// modals actually do rather than generic import advice.
const FieldMappingHelp = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">i</span>
          </div>
        </div>
        <div className="ml-3">
          <p className="text-sm text-blue-800">
            Learn how you can map the CSV or XLS (Excel) files columns to CRM fields.{" "}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-blue-600 hover:text-blue-800 underline font-medium"
              aria-expanded={expanded}
            >
              {expanded ? "Show Less" : "Show More"}
            </button>
          </p>

          {expanded && (
            <ul className="mt-3 space-y-2 text-sm text-blue-800 list-disc pl-5">
              <li>
                The first row of your file is read as the column headers. Those headers are
                listed on the left, and you choose which CRM field each one becomes.
              </li>
              <li>
                To leave a column out of the import, set it to
                {" "}<span className="font-medium">Don&apos;t Import This Column</span>.
              </li>
              <li>
                Each CRM field can only be used once. Once a field is mapped, it disappears
                from the other columns&apos; dropdowns.
              </li>
              <li>
                Fields marked <span className="font-medium">*</span> are required. Rows with
                those values missing may fail to import.
              </li>
              <li>
                Custom fields you have created appear in the list marked
                {" "}<span className="font-medium">(Custom Field)</span>.
              </li>
              <li>
                At least one column has to be mapped before the import button becomes
                available.
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default FieldMappingHelp;
