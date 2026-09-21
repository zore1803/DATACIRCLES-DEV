// One-off script: seeds a single test org + user for external verification
// (e.g. handing test login credentials to a payment provider for site review).
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Organization = require("../models/Organization");
const User = require("../models/User");

const EMAIL = "test@datacircles.in";
const PASSWORD = "Test@1234";

async function seedTestLogin() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  let org = await Organization.findOne({ code: "TEST" });
  if (!org) {
    org = await Organization.create({ name: "Test Org", code: "TEST" });
    console.log("Created org:", org._id);
  }

  const hashedPassword = await bcrypt.hash(PASSWORD, 12);
  let user = await User.findOne({ email: EMAIL });
  if (user) {
    user.password = hashedPassword;
    user.organization = org._id;
    user.role = "admin";
    await user.save();
    console.log("Updated existing test user");
  } else {
    user = await User.create({
      name: "Test User",
      email: EMAIL,
      password: hashedPassword,
      role: "admin",
      organization: org._id,
    });
    console.log("Created test user");
  }

  console.log("==================================");
  console.log("Email   :", EMAIL);
  console.log("Password:", PASSWORD);
  console.log("==================================");

  await mongoose.connection.close();
}

seedTestLogin().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
