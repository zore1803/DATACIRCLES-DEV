// seedSampleData.js
const mongoose = require('mongoose');
const Company = require('../models/Company');
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Invoice = require('../models/Invoice');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const Item = require('../models/Item');
const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');
const Purchase = require('../models/Purchase');

async function seedSampleData(organizationId, userId) {
  try {
    // Sample Companies
    const companyData = [
      { name: 'Tech Innovations Ltd', industry: 'Technology', address: '123 Innovation St, Tech City', website: 'www.techinnovations.com', organization: organizationId, user: userId },
      { name: 'Green Energy Corp', industry: 'Energy', address: '456 Green Ave, Eco Town', website: 'www.greenenergy.com', organization: organizationId, user: userId },
      { name: 'HealthCare Solutions', industry: 'Healthcare', address: '789 Health Blvd, Med City', website: 'www.healthcaresolutions.com', organization: organizationId, user: userId },
      { name: 'Finance Experts Inc', industry: 'Finance', address: '101 Finance Rd, Money City', website: 'www.financeexperts.com', organization: organizationId, user: userId },
      { name: 'EduTech Academy', industry: 'Education', address: '202 Edu Lane, Learn Town', website: 'www.edutechacademy.com', organization: organizationId, user: userId },
      { name: 'Auto Manufacturers', industry: 'Automotive', address: '303 Auto Dr, Car City', website: 'www.automanufacturers.com', organization: organizationId, user: userId },
      { name: 'Retail Giants', industry: 'Retail', address: '404 Retail St, Shop Town', website: 'www.retailgiants.com', organization: organizationId, user: userId },
      { name: 'Food Services Co', industry: 'Food', address: '505 Food Ave, Eat City', website: 'www.foodservices.com', organization: organizationId, user: userId },
      { name: 'Travel Adventures', industry: 'Travel', address: '606 Travel Blvd, Adventure Town', website: 'www.traveladventures.com', organization: organizationId, user: userId },
      { name: 'Media Entertainment', industry: 'Media', address: '707 Media Rd, Entertain City', website: 'www.mediaentertainment.com', organization: organizationId, user: userId }
    ];
    const createdCompanies = await Company.insertMany(companyData);

    // Sample Vendors
    const vendorData = [
      { name: 'Tech Supplies Inc', email: 'contact@techsupplies.com', phone: '+1-555-1001', company: 'Tech Supplies', address: { line1: '100 Supply Rd', city: 'Supply City', state: 'CA', pincode: '90001', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'Energy Parts Ltd', email: 'contact@energyparts.com', phone: '+1-555-1002', company: 'Energy Parts', address: { line1: '200 Parts Ave', city: 'Energy Town', state: 'TX', pincode: '90002', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'MediCare Distributors', email: 'contact@medicaredist.com', phone: '+1-555-1003', company: 'MediCare Dist', address: { line1: '300 Health St', city: 'Med City', state: 'NY', pincode: '90003', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'Finance Solutions', email: 'contact@financesol.com', phone: '+1-555-1004', company: 'Finance Sol', address: { line1: '400 Money Rd', city: 'Finance City', state: 'FL', pincode: '90004', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'Edu Supplies Co', email: 'contact@edusupplies.com', phone: '+1-555-1005', company: 'Edu Supplies', address: { line1: '500 Learn Ave', city: 'Edu Town', state: 'IL', pincode: '90005', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'Auto Parts Ltd', email: 'contact@autoparts.com', phone: '+1-555-1006', company: 'Auto Parts', address: { line1: '600 Auto Dr', city: 'Car City', state: 'MI', pincode: '90006', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'Retail Suppliers', email: 'contact@retailsuppliers.com', phone: '+1-555-1007', company: 'Retail Suppliers', address: { line1: '700 Shop St', city: 'Retail Town', state: 'OH', pincode: '90007', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'Food Distributors', email: 'contact@fooddist.com', phone: '+1-555-1008', company: 'Food Dist', address: { line1: '800 Food Ave', city: 'Eat City', state: 'PA', pincode: '90008', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'Travel Gear Co', email: 'contact@travelgear.com', phone: '+1-555-1009', company: 'Travel Gear', address: { line1: '900 Travel Rd', city: 'Adventure Town', state: 'CO', pincode: '90009', country: 'USA' }, organization: organizationId, user: userId },
      { name: 'Media Supplies', email: 'contact@mediasupplies.com', phone: '+1-555-1010', company: 'Media Supplies', address: { line1: '1000 Media Blvd', city: 'Entertain City', state: 'CA', pincode: '90010', country: 'USA' }, organization: organizationId, user: userId }
    ];
    const createdVendors = await Vendor.insertMany(vendorData);

    // Sample Contacts (linked to companies)
    const contactData = createdCompanies.map((company, index) => ({
      name: `Contact Person ${index + 1}`,
      email: `contact${index + 1}@example.com`,
      phone: `+1-555-000${index + 1}`,
      company: company._id,
      lifecycleStage: index % 3 === 0 ? 'Lead' : index % 3 === 1 ? 'Sales Qualified Lead' : 'Customer',
      stageStatus: index % 3 === 0 ? 'New' : index % 3 === 1 ? 'Qualified' : 'Won',
      organization: organizationId,
      user: userId
    }));
    const createdContacts = await Contact.insertMany(contactData);

    // Sample Items
    const itemData = [
      { type: 'product', name: 'Laptop', description: 'High-performance laptop', purchasePrice: 800, sellingPrice: 1000, hsnSac: '8471', organization: organizationId, user: userId, variants: [{ name: 'Laptop - 16GB', sku: 'LAP-16GB', purchasePrice: 850, sellingPrice: 1050, stock: 50, attributes: { ram: '16GB' } }] },
      { type: 'service', name: 'Cloud Hosting', description: 'Annual cloud hosting service', purchasePrice: 200, sellingPrice: 300, organization: organizationId, user: userId },
      { type: 'product', name: 'Smartphone', description: 'Latest smartphone model', purchasePrice: 500, sellingPrice: 700, hsnSac: '8517', organization: organizationId, user: userId, variants: [{ name: 'Smartphone - 128GB', sku: 'PHONE-128GB', purchasePrice: 550, sellingPrice: 750, stock: 100, attributes: { storage: '128GB' } }] },
      { type: 'service', name: 'Consulting', description: 'Business consulting service', purchasePrice: 1000, sellingPrice: 1500, organization: organizationId, user: userId },
      { type: 'product', name: 'Desk Chair', description: 'Ergonomic office chair', purchasePrice: 150, sellingPrice: 250, hsnSac: '9403', organization: organizationId, user: userId, variants: [{ name: 'Chair - Black', sku: 'CHAIR-BLK', purchasePrice: 160, sellingPrice: 260, stock: 30, attributes: { color: 'Black' } }] },
      { type: 'product', name: 'Monitor', description: '4K ultra HD monitor', purchasePrice: 300, sellingPrice: 400, hsnSac: '8528', organization: organizationId, user: userId },
      { type: 'service', name: 'Maintenance Contract', description: 'Annual maintenance service', purchasePrice: 500, sellingPrice: 750, organization: organizationId, user: userId },
      { type: 'product', name: 'Printer', description: 'All-in-one printer', purchasePrice: 200, sellingPrice: 300, hsnSac: '8443', organization: organizationId, user: userId },
      { type: 'product', name: 'Tablet', description: '10-inch tablet', purchasePrice: 250, sellingPrice: 350, hsnSac: '8471', organization: organizationId, user: userId, variants: [{ name: 'Tablet - 64GB', sku: 'TAB-64GB', purchasePrice: 260, sellingPrice: 360, stock: 40, attributes: { storage: '64GB' } }] },
      { type: 'service', name: 'Software License', description: 'Annual software license', purchasePrice: 400, sellingPrice: 600, organization: organizationId, user: userId }
    ];
    const createdItems = await Item.insertMany(itemData);

    // Helper to get a random date within a specific month offset
function getRandomDateInMonth(monthOffset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Generate a random "deal amount" with up-and-down trend
function generateDealAmount(index) {
  // Create wave-like variation in values for nicer chart curves
  const base = 4000 + Math.sin(index) * 2000 + Math.random() * 1500;
  return Math.round(base + index * 1000);
}

// Create sample deal data for the last 5 months
const dealData = createdContacts.map((contact, index) => {
  const monthOffset = index % 5; // distribute across last 5 months
  return {
    createdBy: userId,
    lastUpdatedBy: userId,
    title: `Deal Opportunity ${index + 1}`,
    amount: generateDealAmount(index),
    status: index % 3 === 0 ? "Open" : index % 3 === 1 ? "Won" : "Lost",
    contact: contact._id,
    company: createdCompanies[index]._id,
    user: userId,
    organization: organizationId,
    createdAt: getRandomDateInMonth(monthOffset)
  };
});

const createdDeals = await Deal.insertMany(dealData);

    // Sample Invoices (linked to deals)
    const invoiceData = createdDeals.map((deal, index) => ({
      deal: deal._id,
      invoiceNumber: `INV-${index + 1}`,
      date: new Date('2025-09-23'),
      dueDate: new Date('2025-10-23'),
      amount: deal.amount,
      user: userId,
      organization: organizationId,
      status: index % 2 === 0 ? 'Pending' : 'Paid',
      discount: { type: 'percentage', value: 5 },
      style: '',
      items: [
        {
          itemId: createdItems[index % createdItems.length]._id,
          name: createdItems[index % createdItems.length].name,
          description: `Item for deal ${index + 1}`,
          rate: createdItems[index % createdItems.length].sellingPrice,
          quantity: 10 + index,
          discountType: 'percentage',
          discount: 0
        }
      ]
    }));
    await Invoice.insertMany(invoiceData);

    // Sample Tasks (linked to companies)
    const taskData = createdCompanies.map((company, index) => ({
      title: `Task ${index + 1}`,
      description: `Complete review for company ${company.name}`,
      dueDate: new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000),
      selectedDate: new Date('2025-09-23'),
      status: index % 2 === 0 ? 'Pending' : 'Completed',
      relatedTo: company._id,
      relationModel: 'Company',
      users: [userId],
      createdBy: userId,
      organization: organizationId
    }));
    const createdTasks = await Task.insertMany(taskData);

    // Sample Meetings (linked to vendors)
    const meetingData = createdVendors.map((vendor, index) => ({
      title: `Vendor Meeting ${index + 1}`,
      description: `Discuss supply terms with ${vendor.name}`,
      scheduledAt: new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000),
      duration: 60,
      priority: index % 3 === 0 ? 'low' : index % 3 === 1 ? 'medium' : 'high',
      status: index % 3 === 0 ? 'scheduled' : index % 3 === 1 ? 'completed' : 'cancelled',
      meetingType: index % 3 === 0 ? 'in-person' : index % 3 === 1 ? 'video-call' : 'phone-call',
      location: index % 3 === 0 ? `${vendor.address.line1}, ${vendor.address.city}` : index % 3 === 1 ? 'Zoom Link' : 'Phone',
      linkedTo: 'vendor',
      vendor: vendor._id,
      createdBy: userId,
      organization: organizationId
    }));
    const createdMeetings = await Meeting.insertMany(meetingData);

    // Sample Purchase Orders (linked to vendors and items)
    const purchaseOrderData = createdVendors.map((vendor, index) => ({
      vendor: vendor._id,
      poNumber: `PO-2025-00${index + 1}`,
      orderDate: new Date('2025-09-23'),
      items: [
        {
          itemId: createdItems[index % createdItems.length]._id,
          name: createdItems[index % createdItems.length].name,
          quantity: 10 + index,
          unitPrice: createdItems[index % createdItems.length].purchasePrice,
          total: (10 + index) * createdItems[index % createdItems.length].purchasePrice,
          sku: createdItems[index % createdItems.length].variants.length > 0 ? createdItems[index % createdItems.length].variants[0].sku : undefined,
          variantAttributes: createdItems[index % createdItems.length].variants.length > 0 ? createdItems[index % createdItems.length].variants[0].attributes : undefined
        }
      ],
      totalAmount: (10 + index) * createdItems[index % createdItems.length].purchasePrice,
      paymentTerms: 'Net 30',
      status: index % 3 === 0 ? 'Pending' : index % 3 === 1 ? 'Approved' : 'Delivered',
      notes: `Purchase order for ${vendor.name}`,
      user: userId,
      organization: organizationId
    }));
    const createdPurchaseOrders = await PurchaseOrder.insertMany(purchaseOrderData);

    // Sample Purchases (linked to vendors, purchase orders, and items)
    const purchaseData = createdPurchaseOrders.map((po, index) => ({
      vendor: po.vendor,
      purchaseOrder: po._id,
      purchaseNumber: `PUR-2025-00${index + 1}`,
      purchaseDate: new Date('2025-09-23'),
      items: [
        {
          itemId: createdItems[index % createdItems.length]._id,
          name: createdItems[index % createdItems.length].name,
          quantity: 10 + index,
          unitPrice: createdItems[index % createdItems.length].purchasePrice,
          total: (10 + index) * createdItems[index % createdItems.length].purchasePrice,
          sku: createdItems[index % createdItems.length].variants.length > 0 ? createdItems[index % createdItems.length].variants[0].sku : undefined,
          variantAttributes: createdItems[index % createdItems.length].variants.length > 0 ? createdItems[index % createdItems.length].variants[0].attributes : undefined
        }
      ],
      grandTotal: (10 + index) * createdItems[index % createdItems.length].purchasePrice,
      status: index % 2 === 0 ? 'Draft' : 'Paid',
      notes: `Purchase for ${createdVendors[index].name}`,
      user: userId,
      organization: organizationId
    }));
    await Purchase.insertMany(purchaseData);

    console.log(`Sample data seeded successfully for organization: ${organizationId}`);
  } catch (error) {
    console.error('Error seeding sample data:', error);
  }
}

module.exports = seedSampleData;