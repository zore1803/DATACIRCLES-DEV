// scripts/seed5DevOrgs.js
//
// Dev-only helper: creates 5 fresh organizations, each with one admin user
// that can log in with a plain email+password (the local "password|" auth
// flow — see authController.login), plus the same minimal setup the real
// signup flow gives a brand-new org (Branding doc, default Kanban board,
// active 7-day trial subscription) so each org is immediately usable rather
// than landing on a broken/gated dashboard.
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const path = require("path");
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config({ path: path.join(__dirname, "../.env") });

const Organization = require("../models/Organization");
const User = require("../models/User");
const Branding = require("../models/Branding");
const KanbanBoard = require("../models/KanbanBoard");
const Subscription = require("../models/Subscription");
const generateUniqueCode = require("../utils/generateUniqueCode");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Error: MONGO_URI is missing in .env file");
  process.exit(1);
}

const TRIAL_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PERMISSIONS = [
  { name: "Companies", permission: "read-write" },
  { name: "Deals", permission: "read-write" },
  { name: "Contacts", permission: "read-write" },
  { name: "Invoices", permission: "read-write" },
  { name: "Tasks", permission: "read-write" },
  { name: "Vendors", permission: "read-write" },
  { name: "purchases", permission: "read-write" },
  { name: "purchase-orders", permission: "read-write" },
  { name: "Items", permission: "read-write" },
  { name: "Meetings", permission: "read-write" },
  { name: "Emails", permission: "read-write" },
  { name: "quotations", permission: "read-write" },
  { name: "delivery-challans", permission: "read-write" },
  { name: "Forms", permission: "read-write" },
];

const ORG_COUNT = parseInt(process.argv[2], 10) || 5;
const PASSWORD = "DevSeed@123";

async function seedOne(index) {
  const suffix = `${Date.now()}${index}`;
  const orgName = `Dev Seed Org ${index}`;
  const code = await generateUniqueCode();

  const org = await new Organization({ name: orgName, code }).save();

  const branding = new Branding();
  branding.companyName = orgName;
  branding.colors = { primary: "#0085FF", secondary: "#000000" };
  branding.organization = org._id;
  await branding.save();

  await new KanbanBoard({
    statuses: ["Open", "Won", "Lost"],
    organization: org._id,
  }).save();

  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + TRIAL_DAYS_MS);
  await new Subscription({
    organization: org._id,
    razorpayPlanId: "plan_trial",
    planName: "growth",
    status: "active",
    billingCycle: "monthly",
    pricePerUser: 0,
    userCount: 1,
    totalAmount: 0,
    trialStart,
    trialEnd,
    isTrialActive: true,
    trialUsed: true,
    currentPeriodStart: trialStart,
    currentPeriodEnd: trialEnd,
    isPaymentConfirmed: false,
    paymentStatus: "pending_payment",
  }).save();

  const email = `dev.seed.org${index}.${suffix}@datacircles.test`;
  const hashedPassword = await bcrypt.hash(PASSWORD, 12);
  const user = await new User({
    name: `Dev Admin ${index}`,
    email,
    password: hashedPassword,
    role: "admin",
    organization: org._id,
    permissions: DEFAULT_PERMISSIONS,
    isEmailVerified: true,
    onboarding: { isCompleted: true, currentStep: 1 },
  }).save();

  return { orgName, code, email, password: PASSWORD };
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const results = [];
  for (let i = 1; i <= ORG_COUNT; i++) {
    results.push(await seedOne(i));
  }

  console.log("\n5 dev organizations seeded:\n");
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.orgName} (code: ${r.code})`);
    console.log(`   Email:    ${r.email}`);
    console.log(`   Password: ${r.password}\n`);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
