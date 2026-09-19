// The split-view Delivery Challan panel.
//
// This file used to also hold a full-page DeliveryChallanForm component. It
// was unreachable -- nothing imported the default export, only
// CreateChallanPanel below -- and it still referenced an undefined `item` in
// five places, so it would have thrown on render. Removed rather than left
// as a broken template for the next person to copy. The live full-width
// screen is DeliveryChallanFormFull.jsx.

import { CreateInvoicePanel } from "../invoice/CreateInvoicePanel";

const CreateChallanPanel = (props) => (
  <CreateInvoicePanel {...props} type="deliveryChallan" />
);

export { CreateChallanPanel };
