// Primary units offered for an item, shared by the Add (QuickItemDrawer) and Edit (ItemForm)
// forms so both list the same units and save them in the same format.
//
// Label is what the dropdown shows ("PCS — PIECES"); the saved value swaps the " — " for a
// single space ("PCS PIECES"), matching the Item model's default "OTH OTHERS".
export const UNIT_OPTIONS = [
  "OTH — OTHERS",
  "PCS — PIECES",
  "NOS — NUMBERS",
  "KGS — KILOGRAMS",
  "GMS — GRAMS",
  "LTR — LITRES",
  "MTR — METRES",
  "BOX — BOX",
  "PKT — PACKET",
  "SET — SET",
];

export const unitLabelToValue = (label) => label.replace(" — ", " ");
export const unitValueToLabel = (value) => (value ? value.replace(" ", " — ") : "");
