require('dotenv').config();

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');

// Register the global change-notifier plugin BEFORE any model is compiled so it
// applies to every schema. Writes an activity-feed Notification for each
// create/update/delete performed within an authenticated request.
mongoose.plugin(require('./utils/changeNotifier'));

const cors = require('cors');
const startReminderJob = require('./utils/reminderJob');
require('./jobs/subscriptionLifecycleJobs');
require('./jobs/referralLifecycleJobs');
require('./jobs/renewalLifecycleJobs');
// Backstop for first payments never acknowledged by the browser callback or the webhook.
require('./jobs/paymentReconciliationJobs');
// Turns Active Sales Subscriptions into Invoices when their billing date arrives.
require('./jobs/salesSubscriptionBillingJob');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const YAML = require('yaml');
const swaggerDocument = YAML.parse(fs.readFileSync('./swagger.yaml', 'utf8'));
const axios = require('axios');

const app = express();

console.log("JWT Secret Check:", process.env.SUPER_ADMIN_JWT_SECRET ? "LOADED" : "MISSING");

// Enhanced CORS configuration
// ALLOWED_ORIGINS (comma-separated) lets a new deploy target (e.g. a fresh
// Vercel project URL) be whitelisted via env var alone, no code change/rebuild needed.
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: [
    "https://crm-frontend-flax-tau.vercel.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174", // Add this
    "https://bejewelled-unicorn-7909b8.netlify.app",
    "https://datacircles.netlify.app",
    "https://app.datacircles.in",
    "https://data-circles-crm-dev.vercel.app",
    "https://data-circles-dev.vercel.app",
    ...extraOrigins,
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-phone-token",
    "X-CSRF-Token",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  preflightContinue: false,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));

// Explicit OPTIONS handler for all routes
app.options(/.*/, cors(corsOptions)); // Enable pre-flight for all routes

// Needed to read the dc_session cookie (DataCircles application-session layer).
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Establish a per-request context (AsyncLocalStorage) so the change-notifier
// plugin can attribute DB writes to the current user. Must wrap all routes.
const { requestContext } = require('./middlewares/requestContext');
app.use(requestContext);


const subscriptionRoutes = require("./routes/subscription");
app.use("/api/subscription", subscriptionRoutes)

app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/json', limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

app.use('/api/doc', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Import routes
const companyRoutes = require('./routes/CompanyRoutes');
app.use('/api/companies', companyRoutes);

const contactRoutes = require('./routes/contactRoutes');
app.use('/api/contacts', contactRoutes);

const walletRoutes = require('./routes/walletRoutes');
app.use('/api/wallet', walletRoutes);

// PUBLIC, unauthenticated form-submission surface (FORMS_ARCHITECTURE.md §2.9) — org resolved from the
// URL slug inside the service, never from req.user (there is none here). Kept as its own router so the
// absence of requireAuth is intentional and obvious, not an oversight.
const publicFormRoutes = require('./routes/publicFormRoutes');
app.use('/api/public/forms', publicFormRoutes);

// Authenticated Forms management + Duplicate Review Center (Phase 1b) — mounted at /api so the
// router's own /forms/* and /duplicate-reviews/* paths resolve correctly.
const formRoutes = require('./routes/formRoutes');
app.use('/api', formRoutes);

const dealRoutes = require('./routes/dealRoutes');
app.use('/api/deals', dealRoutes);

const taskRoutes = require('./routes/taskRoutes');
app.use('/api/tasks', taskRoutes);

const systemSettingsRoutes = require('./routes/systemSettingsRoutes');
app.use('/api/system-settings', systemSettingsRoutes);

const invoiceRoutes = require('./routes/invoiceRoutes');
app.use('/api/invoices', invoiceRoutes);

const performaInvoiceRoutes = require('./routes/perfomainvoice');
app.use('/api/performa-invoices', performaInvoiceRoutes);

const quotationRoutes = require('./routes/quotationRoutes');
app.use('/api/quotations', quotationRoutes);

const salesReturnRoutes = require('./routes/salesReturnRoutes');
app.use('/api/sales-returns', salesReturnRoutes);

const salesSubscriptionRoutes = require('./routes/salesSubscriptionRoutes');
app.use('/api/sales-subscriptions', salesSubscriptionRoutes);

const deliveryChallanRoutes = require('./routes/deliveryChallanRoutes');
app.use('/api/delivery-challans', deliveryChallanRoutes);

const paymentTimelineRoutes = require('./routes/paymentTimelineRoutes');
app.use('/api/payments-timeline', paymentTimelineRoutes);

// Expenses and Indirect Income share one router — same record, different kind.
const expenseRoutes = require('./routes/expenseRoutes');
app.use('/api/expenses', expenseRoutes);

const invoiceConverter = require('./routes/converterRoutes');
app.use('/api/converter', invoiceConverter);

const publicDocumentRoutes = require('./routes/publicDocumentRoutes');
app.use('/api/public', publicDocumentRoutes);

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const sessionRoutes = require('./routes/session');
app.use('/api/session', sessionRoutes);

const brandingRoutes = require('./routes/brandingRoutes');
app.use('/api/branding', brandingRoutes);

const documentSettingsRoutes = require('./routes/documentSettingsRoutes');
app.use('/api/document-settings', documentSettingsRoutes);

const bankDetailsRoutes = require("./routes/bankDetails");
app.use("/api/bank-details", bankDetailsRoutes);

const documentTemplateSettingsRoutes = require("./routes/documentTemplateSettings");
app.use("/api/document-templates", documentTemplateSettingsRoutes);

const documentFooterTemplateRoutes = require("./routes/documentFooterTemplates");
app.use("/api/document-footers", documentFooterTemplateRoutes);
const savedAddressRoutes = require("./routes/savedAddresses");
app.use("/api/saved-addresses", savedAddressRoutes);

const kanbanBoardRoutes = require('./routes/kanbanBoard');
app.use('/api/kanban', kanbanBoardRoutes);

const companyFields = require('./routes/companyFields');
app.use('/api/company-fields', companyFields);

const folderRoutes = require('./routes/folders');
app.use('/api/folders', folderRoutes);

const usageOverviewRoutes = require('./routes/usageOverview');
app.use('/api/usage-overview', usageOverviewRoutes);

const noteRoutes = require('./routes/notes');
app.use('/api/notes', noteRoutes);

const contactFolderRoutes = require('./routes/contactFolderRoutes');
app.use('/api/contact-folders', contactFolderRoutes);

const contactFieldsRoutes = require('./routes/contactFields');
app.use('/api/contact-fields', contactFieldsRoutes);

const companyFolderRoutes = require('./routes/companyFolderRoutes');
app.use('/api/company-folders', companyFolderRoutes);

const kanbanName = require('./routes/kanbanName');
app.use('/api/kanban-name', kanbanName);

const dealFieldsRoutes = require('./routes/dealFields');
app.use('/api/deal-fields', dealFieldsRoutes);

const callLogRoutes = require("./routes/callLogRoutes");
app.use("/api/call-logs", callLogRoutes);

const journalRoutes = require("./routes/journalRoutes");
app.use("/api/journals", journalRoutes);

const vendorRoutes = require("./routes/vendorRoutes");
app.use("/api/vendors", vendorRoutes);

const meetingRoutes = require('./routes/meetings');
app.use('/api/meetings', meetingRoutes);

const vendorFieldsRoutes = require('./routes/vendorFields');
app.use('/api/vendor-fields', vendorFieldsRoutes);

const taskFieldsRoutes = require('./routes/taskFields');
app.use('/api/task-fields', taskFieldsRoutes);

const meetingFieldsRoutes = require('./routes/meetingFields');
app.use('/api/meeting-fields', meetingFieldsRoutes);

const purchaseOrderRoutes = require("./routes/purchaseOrderRoutes");
app.use("/api/purchase-orders", purchaseOrderRoutes);

const purchaseRoutes = require("./routes/purchase");
app.use("/api/purchases", purchaseRoutes);

const purchaseReturnRoutes = require("./routes/purchaseReturn");
app.use("/api/purchase-returns", purchaseReturnRoutes);

const eInvoiceRoutes = require("./routes/eInvoiceRoutes");
app.use("/api/e-invoices", eInvoiceRoutes);

const itemFieldsRoutes = require('./routes/itemFields');
app.use('/api/item-fields', itemFieldsRoutes);

const itemRoutes = require("./routes/itemRoutes");
app.use("/api/items", itemRoutes);

const inventoryRoutes = require("./routes/inventoryRoutes");
app.use("/api/inventory", inventoryRoutes);

const organizationRoutes = require("./routes/organisation");
app.use("/api/organisation", organizationRoutes);

const vendorNotesRoutes = require("./routes/vendorNotes");
app.use("/api/vendor-notes", vendorNotesRoutes);

const emailRoutes = require("./routes/emailRoutes");
app.use("/api/email", emailRoutes);

const notificationRoutes = require("./routes/notificationRoutes");
app.use("/api/notification", notificationRoutes);

const superAdminRoutes = require('./routes/superAdminRoutes');
app.use('/api/super-admin', superAdminRoutes);

const dealSettingsRoutes = require('./routes/dealSettings');
app.use('/api/deal-settings', dealSettingsRoutes);

const emailTemplateRoutes = require("./routes/emailTemplateRoutes");
app.use("/api/email-templates", emailTemplateRoutes);

const companyIndustryRoutes = require("./routes/industryRoutes");
app.use("/api/company-industries", companyIndustryRoutes);

const globalSearch = require("./routes/globalSearch");
// const { Axios } = require('axios');
app.use('/api/search', globalSearch);

app.post("/api/gstin-details", async (req, res) => {
  try {
    const { gstin } = req.body;

    if (!gstin) {
      return res.status(400).json({ error: "gstin is required" });
    }

    const response = await axios.post(
      "https://in.staging.decentro.tech/kyc/public_registry/validate",
      {
        reference_id: "GSTIN-Detailed Document Verification",
        document_type: "GSTIN_DETAILED",
        id_number: gstin,
        consent: "Y",
        consent_purpose: "To verify GSTIN document",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "client-id": process.env.DECENTRO_CLIENT_ID,
          "client-secret": process.env.DECENTRO_CLIENT_SECRET,
          "module-id": process.env.DECENTRO_MODULE_SECRET, // or module-id if that’s what your account uses
          env: "staging",
        },
      }
    );

    // Pass Decentro response back to frontend
    return res.status(200).json(response.data);
  } catch (err) {
    console.error("Decentro GSTIN error:", err.response?.data || err.message);
    return res
      .status(err.response?.status || 500)
      .json(err.response?.data || { error: "Something went wrong" });
  }
});


app.get('/health', (req, res) => {
  res.status(200).json({ message: "server is running..." })
})

// Catch-all error handler — without this, an error passed to next(err)
// anywhere (most commonly multer/multer-s3 failing on a file upload, e.g.
// bad/expired AWS credentials or a file over the size limit) fell through to
// Express's default handler, which renders an HTML stack-trace page instead
// of JSON. The frontend then saw a response with no `.error` field and could
// never show the real reason — every upload failure looked identical
// ("Failed to upload image") no matter what actually broke.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("Unhandled error:", err);
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File is too large." });
  }
  // Raw err.message used to be sent straight to the client — fine for the
  // upload-failure cases this handler was added for (a real, readable
  // reason), but any *unexpected* exception (a TypeError from a bug, a
  // driver error) leaked its raw JS message as if it were a user-facing
  // reason, e.g. "Cannot read properties of undefined (reading 'phone')"
  // showing up as a toast. Known/expected errors set `err.status`; anything
  // without one is treated as a bug and gets a generic message instead,
  // with the real detail still logged above for debugging.
  const message = err.status ? err.message : "Something went wrong. Please try again.";
  res.status(err.status || 500).json({ error: message });
});

// MongoDB connect
// mongoose.connect(process.env.MONGO_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.log(err));

mongoose.connect(process.env.MONGO_URI) 
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// startReminderJob();

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
