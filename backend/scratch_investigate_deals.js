const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Deal = require('./models/Deal');
const Invoice = require('./models/Invoice');
const Task = require('./models/Task');
const Meeting = require('./models/Meeting');
const Note = require('./models/Note');

// Load environment variables
dotenv.config();

async function run() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("Connected.");

    const deals = await Deal.find({});
    console.log("\n--- REPORT ---");
    console.log(`1. Total number of Deals: ${deals.length}`);

    // Distribution of statuses
    const statusCounts = {};
    deals.forEach(d => {
      const s = d.status || "Open";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    console.log("\n2. Distribution of Deal status/stages:");
    console.log(statusCounts);

    // Additional fields inspection
    const fieldKeys = {};
    const fieldTypes = {};
    const fieldValuesFreq = {};
    let dealsWithExpectedCloseDate = 0;
    let dealsWithPriorityTypeSource = 0;

    const amounts = [];
    const dates = [];

    deals.forEach(d => {
      if (d.amount != null) amounts.push(d.amount);
      if (d.createdAt) dates.push(new Date(d.createdAt));
      if (d.updatedAt) dates.push(new Date(d.updatedAt));

      let hasDateFields = false;
      let hasPriorityFields = false;

      (d.additionalFields || []).forEach(af => {
        const key = af.key;
        if (!key) return;

        fieldKeys[key] = (fieldKeys[key] || 0) + 1;
        fieldTypes[key] = af.type || "text";

        // Collect samples
        if (!fieldValuesFreq[key]) fieldValuesFreq[key] = [];
        if (af.value !== undefined && af.value !== null && af.value !== "") {
           if (fieldValuesFreq[key].length < 3) fieldValuesFreq[key].push(af.value);
        }

        const lKey = key.toLowerCase();
        if (lKey.includes('date') || lKey.includes('close')) hasDateFields = true;
        if (lKey.includes('priority') || lKey.includes('type') || lKey.includes('source')) hasPriorityFields = true;
      });

      if (hasDateFields) dealsWithExpectedCloseDate++;
      if (hasPriorityFields) dealsWithPriorityTypeSource++;
    });

    console.log("\n3 & 4. AdditionalFields keys and their frequency (Top 20):");
    Object.entries(fieldKeys).sort((a,b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => {
      console.log(`  - ${k} (${fieldTypes[k]}): ${v} times. Example values: ${JSON.stringify(fieldValuesFreq[k])}`);
    });

    console.log("\n5. Custom fields that contain dates:");
    const dateFields = Object.keys(fieldKeys).filter(k => k.toLowerCase().includes('date') || fieldTypes[k] === 'date');
    console.log(dateFields.length ? dateFields.join(', ') : "None found");

    console.log("\n6. Custom fields that contain numeric values:");
    const numFields = Object.keys(fieldKeys).filter(k => fieldTypes[k] === 'number');
    console.log(numFields.length ? numFields.join(', ') : "None explicitly marked as 'number'. Keys that might be numeric based on names:");
    const possibleNumFields = Object.keys(fieldKeys).filter(k => k.toLowerCase().match(/amount|value|price|cost|probability|percent/));
    console.log(possibleNumFields.join(', '));

    console.log("\n7. Custom fields that contain percentages/probability-like values:");
    const probFields = Object.keys(fieldKeys).filter(k => k.toLowerCase().match(/probability|percent|chance/));
    console.log(probFields.length ? probFields.join(', ') : "None found");

    console.log("\n8. Deals with expected close dates (or similar fields):");
    console.log(`${dealsWithExpectedCloseDate} out of ${deals.length}`);

    console.log("\n9. Deals with priority/source/type fields:");
    console.log(`${dealsWithPriorityTypeSource} out of ${deals.length}`);

    console.log("\n10. Distribution of Deal amounts:");
    if (amounts.length === 0) {
      console.log("No amounts found on deals.");
    } else {
      amounts.sort((a,b) => a-b);
      console.log(`  Min: ${amounts[0]}`);
      console.log(`  Max: ${amounts[amounts.length-1]}`);
      console.log(`  Median: ${amounts[Math.floor(amounts.length/2)]}`);
      console.log(`  Total count with amounts: ${amounts.length}`);
    }

    console.log("\n11. Date Range:");
    if (dates.length === 0) {
      console.log("No dates found.");
    } else {
      dates.sort((a,b) => a-b);
      console.log(`  Earliest: ${dates[0]}`);
      console.log(`  Latest: ${dates[dates.length-1]}`);
    }

    console.log("\n12. Representative Deal connections:");
    const repDeal = deals.find(d => d.amount > 0) || deals[0];
    if (!repDeal) {
      console.log("No deals to inspect connections for.");
    } else {
      console.log(`Selected deal: ID ${repDeal._id}, Title: "${repDeal.title}"`);
      const invs = await Invoice.find({ deal: repDeal._id });
      const tasks = await Task.find({ deal: repDeal._id });
      const mtgs = await Meeting.find({ deal: repDeal._id });
      const notes = await Note.find({ deal: repDeal._id });
      
      console.log(`  - Invoices: ${invs.length} found`);
      console.log(`  - Tasks: ${tasks.length} found`);
      console.log(`  - Meetings: ${mtgs.length} found`);
      console.log(`  - Notes: ${notes.length} found`);
      // We can also see if any invoices have a paid amount.
      const paidInvs = invs.filter(i => (i.status || "").toLowerCase() === 'paid');
      console.log(`  - Payments/collections: based on invoice statuses, ${paidInvs.length} paid invoices.`);
    }

    console.log("\n=== HISTORICAL DATA FEASIBILITY ===");
    console.log("- Status Pipeline charts: Deal currently tracks current 'status' but not stage change history.");
    console.log("- Revenue trends: Can use related Invoices (createdAt & paid amount).");
    console.log("- Value forecasts: 'amount' exists, but close date / probability seem missing or rare.");
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

run();
