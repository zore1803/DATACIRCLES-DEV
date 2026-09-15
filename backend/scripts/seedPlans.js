// scripts/seedPlans.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const PlanConfig = require('../models/PlanConfig');

// Load env variables
dotenv.config();

async function seedPlans() {
  try {
    // ✅ Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected");

    // Clear existing features
    await PlanConfig.deleteMany({}); // Clear existing for fresh seeding

  await PlanConfig.create({
    planId: 'trial',
    monthlyPrice: 0,
    yearlyPrice: 0,
    razorpayPlanIds: { monthly: 'plan_trial', yearly: 'plan_trial' },
    features: {
      recordsLimit: 25000, // Per user, matches Growth
      emailTemplates: 5,
      salesPipelines: 3,
      customFields: 25,
      recordTags: 25,
      websiteForms: 3,
      fileStorage: 2 * 1024 * 1024 * 1024, // GB per user
      modules: { contacts: { read: true, write: true, limit: 100 }, companies: { read: true, write: true, limit: 100 }, deals: { read: true, write: true, limit: 100 }, vendors: { read: true, write: true, limit: 50 }, invoices: { read: true, write: true, limit: 50 }, tasks: { read: true, write: true, limit: 200 }, callLogs: { read: true, write: true, limit: 200 }, meetings: { read: true, write: true, limit: 100 }, quotations: { read: true, write: true, limit: 50 }, 'delivery-challans': { read: true, write: true, limit: 50 }, purchases: { read: true, write: true, limit: 50 }, emails: { read: true, write: true, limit: 2000 }, folders: { read: true, write: true }, forms: { read: true, write: true, limit: 3 }, },
      rottenDeals: true,
      advancedReports: true,
      includedSeats: 1,
      staffSeats: 1,
    },
  });

  await PlanConfig.create({
    planId: 'starter',
    monthlyPrice: 250,
    yearlyPrice: 200 * 12,
    discount: 20,
    razorpayPlanIds: { monthly: 'plan_RnsI9bIqZCaD6m', yearly: 'plan_Rp6CGuyWq5RS6t' },
    features: {
      recordsLimit: 10000,
      emailTemplates: 3,
      salesPipelines: 1,
      customFields: 10,
      recordTags: 10,
      websiteForms: 1,
      fileStorage: 1 * 1024 * 1024 * 1024,
      modules: { contacts: { read: true, write: true, limit: 1000 }, companies: { read: true, write: true, limit: 1000 }, deals: { read: true, write: true, limit: 1000 }, vendors: { read: true, write: true, limit: 200 }, invoices: { read: true, write: true, limit: 500 }, tasks: { read: true, write: true, limit: 2000 }, callLogs: { read: true, write: true, limit: 2000 }, meetings: { read: true, write: true, limit: 500 }, quotations: { read: true, write: true, limit: 300 }, 'delivery-challans': { read: true, write: true, limit: 300 }, purchases: { read: true, write: true, limit: 300 }, emails: { read: true, write: true, limit: 500 }, folders: { read: true, write: true }, forms: { read: true, write: true, limit: 1 }, },
      rottenDeals: false,
      advancedReports: false,
      includedSeats: 1,
      staffSeats: 3,
    },
  });

  await PlanConfig.create({
    planId: 'growth',
    monthlyPrice: 450,
    yearlyPrice: 400 * 12,
    discount: 11.11,
    razorpayPlanIds: { monthly: 'plan_Rp6Cv5hJePOt7e', yearly: 'plan_Rp6H2oWqAHcRge' },
    features: {
      recordsLimit: 25000,
      emailTemplates: 5,
      salesPipelines: 3,
      customFields: 25,
      recordTags: 25,
      websiteForms: 3,
      fileStorage: 2 * 1024 * 1024 * 1024,
      modules: { contacts: { read: true, write: true, limit: 5000 }, companies: { read: true, write: true, limit: 5000 }, deals: { read: true, write: true, limit: 5000 }, vendors: { read: true, write: true, limit: 1000 }, invoices: { read: true, write: true, limit: 2500 }, tasks: { read: true, write: true, limit: 10000 }, callLogs: { read: true, write: true, limit: 10000 }, meetings: { read: true, write: true, limit: 2500 }, quotations: { read: true, write: true, limit: 1500 }, 'delivery-challans': { read: true, write: true, limit: 1500 }, purchases: { read: true, write: true, limit: 1500 }, emails: { read: true, write: true, limit: 2000 }, folders: { read: true, write: true }, forms: { read: true, write: true, limit: 3 }, },
      rottenDeals: true,
      advancedReports: true,
      includedSeats: 1,
      staffSeats: 5,
    },
  });

  await PlanConfig.create({
    planId: 'business',
    monthlyPrice: 650,
    yearlyPrice: 600 * 12,
    discount: 7.69,
    razorpayPlanIds: { monthly: 'plan_Rp6HYd0wJLlNam', yearly: 'plan_Rp6IESuzfJaqPr' },
    features: {
      recordsLimit: 50000,
      emailTemplates: 10,
      salesPipelines: 5,
      customFields: 50,
      recordTags: 50,
      websiteForms: 5,
      fileStorage: 5 * 1024 * 1024 * 1024,
      modules: { contacts: { read: true, write: true, limit: 'unlimited' }, companies: { read: true, write: true, limit: 'unlimited' }, deals: { read: true, write: true, limit: 'unlimited' }, vendors: { read: true, write: true, limit: 'unlimited' }, invoices: { read: true, write: true, limit: 'unlimited' }, tasks: { read: true, write: true, limit: 'unlimited' }, callLogs: { read: true, write: true, limit: 'unlimited' }, meetings: { read: true, write: true, limit: 'unlimited' }, quotations: { read: true, write: true, limit: 'unlimited' }, 'delivery-challans': { read: true, write: true, limit: 'unlimited' }, purchases: { read: true, write: true, limit: 'unlimited' }, emails: { read: true, write: true, limit: 'unlimited' }, folders: { read: true, write: true }, forms: { read: true, write: true, limit: 5 }, },
      rottenDeals: true,
      advancedReports: true,
      includedSeats: 1,
      staffSeats: 10,
    },
  });

    console.log("✅ Plans seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding plans:", err);
    process.exit(1);
  }
}

seedPlans();
