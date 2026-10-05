const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config({ path: __dirname + '/.env' });

// Use Google DNS to bypass local ISP blocks on SRV records
dns.setServers(['8.8.8.8', '8.8.4.4']);

const Company = require('./models/Company');
const Contact = require('./models/Contact');
const Deal = require('./models/Deal');
const Invoice = require('./models/Invoice');
const Vendor = require('./models/Vendor');
const Purchase = require('./models/Purchase');

async function checkData() {
  try {
    let mongoUri = process.env.MONGO_URI;
    
    // If it's an SRV connection, let's manually resolve it using Google DNS
    if (mongoUri.startsWith('mongodb+srv://')) {
      console.log("Resolving SRV record using Google DNS (8.8.8.8)...");
      const url = new URL(mongoUri);
      const hostname = url.hostname;
      
      const addresses = await dns.promises.resolveSrv(`_mongodb._tcp.${hostname}`);
      console.log("Resolved seedlist:", addresses);
      
      const seedlist = addresses.map(a => `${a.name}:${a.port}`).join(',');
      
      // Construct standard mongodb:// string
      mongoUri = `mongodb://${url.username}:${url.password}@${seedlist}/?ssl=true&replicaSet=atlas-iiu3mlk-shard-0&authSource=admin&retryWrites=true&w=majority`;
      console.log("Constructed Manual URI:", mongoUri.replace(url.password, '****'));
    }

    console.log("Connecting to DB...");
    await mongoose.connect(mongoUri, { family: 4 });
    console.log("Connected to DB successfully!");

    // 1. Find a Company with Deals and Invoices
    const dealsWithInvoices = await Invoice.distinct('deal');
    const deals = await Deal.find({ _id: { $in: dealsWithInvoices } }).populate('company contact');
    
    let bestCompany = null;
    let bestContact = null;
    
    for (const deal of deals) {
      if (deal.company) {
        bestCompany = deal.company;
      }
      if (deal.contact) {
        bestContact = deal.contact;
      }
      if (bestCompany && bestContact) break;
    }

    // 2. Find a Vendor with Purchases
    const vendorIdsWithPurchases = await Purchase.distinct('vendor');
    const vendors = await Vendor.find({ _id: { $in: vendorIdsWithPurchases } });
    let bestVendor = vendors.length > 0 ? vendors[0] : null;

    console.log("\n====================================");
    console.log("      BEST DATA TO TEST WITH        ");
    console.log("====================================");
    if (bestCompany) {
      console.log(`Company: ${bestCompany.companyName || bestCompany.name || 'Unnamed Company'} (ID: ${bestCompany._id})`);
    } else {
      console.log("No Company found with Deals that have Invoices.");
    }
    
    if (bestContact) {
      console.log(`Contact: ${bestContact.firstName || ''} ${bestContact.lastName || ''} (ID: ${bestContact._id})`);
    } else {
      console.log("No Contact found with Deals that have Invoices.");
    }

    if (bestVendor) {
      console.log(`Vendor: ${bestVendor.vendorName || bestVendor.name || 'Unnamed Vendor'} (ID: ${bestVendor._id})`);
    } else {
      console.log("No Vendor found with Purchases.");
    }
    console.log("====================================\n");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    mongoose.disconnect();
  }
}

checkData();
