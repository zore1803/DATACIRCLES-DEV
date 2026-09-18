const { buildFuzzySearchPattern } = require('../utils/searchRegex');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { getAccessEntitlementEnd } = require('../utils/prorationMath');
const { emitBillingEvent } = require('../utils/billingEvents');
const SubscriptionPayment = require('../models/SubscriptionPayment.js');
const Invoice = require('../models/Invoice');
const Deal = require('../models/Deal');
const Company = require('../models/Company');
const Contact = require('../models/Contact');
const Vendor = require('../models/Vendor');
const Task = require('../models/Task');
const Ticket = require('../models/Ticket');
const ProformaInvoice = require('../models/ProformaInvoice');
const deliveryChallan = require('../models/deliveryChallan');
const quotation = require('../models/quotation');
const Meeting = require('../models/Meeting');
const CallLog = require('../models/CallLog');
const mongoose = require('mongoose');
const UserAuditLog = require('../models/UserAuditLog.js');
const {
  setAppStatus,
  cancelSubscription,
  reconcileSubscriptionPayment,
} = require('./subscriptionController');
const razorpay = require('../config/razorpay');
const {
  sendTrialAdjustedByAdminEmail,
  sendTrialEndedByAdminEmail,
  sendSubscriptionCancelledByAdminEmail,
} = require('../utils/adminActionEmails');
const { sendTrialStartedEmail } = require('../utils/trialEmails');

const getOverview = async (req, res) => {
  try {
    // Calculate date 30 days ago for recent data queries
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalOrganizations,
      totalUsers,
      totalRevenue,
      activeSubscriptions,
      recentOrganizations,
      recentUsers
    ] = await Promise.all([
      Organization.countDocuments(),
      User.countDocuments(),
      SubscriptionPayment.aggregate([
        { $match: { status: 'captured' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Subscription.countDocuments({ status: 'active' }),
      // Fetch organizations created in last 30 days for growth trend
      Organization.find(
        { createdAt: { $gte: thirtyDaysAgo } },
        { _id: 1, name: 1, createdAt: 1 }
      ).sort({ createdAt: 1 }), // Sort ascending for chart data
      // NEW: Fetch users created in last 30 days for user growth trend
      User.find(
        { createdAt: { $gte: thirtyDaysAgo } },
        { _id: 1, email: 1, createdAt: 1 }
      ).sort({ createdAt: 1 }) // Sort ascending for chart data
    ]);

    const revenue = totalRevenue[0]?.total || 0;

    res.json({
      totalOrganizations,
      totalUsers,
      totalRevenue: revenue,
      activeSubscriptions,
      recentOrganizations,
      recentUsers // NEW: Include user growth data
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Failed to fetch overview data', 
      error: error.message 
    });
  }
};

const getTenants = async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const skip = (page - 1) * limit;

    // Filter and sort parameters
    const {
      search = '',
      sortBy = 'name',
      sortOrder = 'asc',
      status = '',
      plan = ''
    } = req.query;

    // Build query object
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { adminEmail: { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute queries in parallel for better performance
    const [organizations, totalCount] = await Promise.all([
      Organization.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sortObj)
        .lean()
        .select('-__v'),
      Organization.countDocuments(query)
    ]);

    // For each organization, get subscription details and user count
    const tenantsWithDetails = await Promise.all(
      organizations.map(async (org) => {
        // Get subscription details
        const subscription = await Subscription.findOne({ organization: org._id })
          .lean()
          .select('planName billingCycle totalAmount status appStatus isTrialActive');

        // Get user count
        const userCount = await User.countDocuments({ organization: org._id });
        const adminEmail = await User.findOne({ organization: org._id, role: 'admin' }).lean().select('email');
        // Determine organization status
        let orgStatus = 'Inactive';
        if (subscription) {
          switch (subscription.appStatus) {
            case 'trial':
              orgStatus = 'Trial';
              break;
            case 'active':
            case 'past_due':
              orgStatus = 'Active';
              break;
            case 'suspended':
              orgStatus = 'Suspended';
              break;
            case 'cancelled':
              orgStatus = 'Cancelled';
              break;
            case 'expired':
              orgStatus = 'Expired';
              break;
            default:
              orgStatus = 'Inactive';
          }
        }

        return {
          ...org,
          adminEmail: adminEmail?.email || '',
          plan: subscription?.planName || 'N/A',
          users: userCount,
          subscriptionAmount: subscription?.totalAmount || 0,
          status: orgStatus,
          billingCycle: subscription?.billingCycle || 'N/A',
          subscriptionStatus: subscription?.appStatus || 'none',
          isTrialActive: subscription?.isTrialActive || false
        };
      })
    );

    // Apply plan filter if provided
    let filteredTenants = tenantsWithDetails;
    if (plan && plan !== 'all') {
      filteredTenants = tenantsWithDetails.filter(t => t.plan?.toLowerCase() === plan.toLowerCase());
    }

    // Apply status filter if provided
    if (status && status !== 'all') {
      filteredTenants = filteredTenants.filter(t => t.status === status);
    }

    // Recalculate pagination if filters were applied
    const filteredCount = filteredTenants.length;
    const totalPages = Math.ceil(filteredCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      tenants: filteredTenants,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      }
    });
  } catch (error) {
    console.error('Tenants fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch tenants', error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const skip = (page - 1) * limit;

    // Filter and sort parameters
    const {
      search = '',
      sortBy = 'name',
      sortOrder = 'asc',
      role = '',
      organization = '' // New: organization filter
    } = req.query;

    // Build query object
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { email: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { profileEmail: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { phone: { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
      ];
    }

    // Filter by role
    if (role) {
      query.role = role;
    }

    // Filter by organization
    if (organization) {
      query.organization = organization;
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute queries in parallel for better performance
    const [users, totalCount] = await Promise.all([
      User.find(query)
        .populate('organization', 'name email') // Only populate needed fields
        .skip(skip)
        .limit(limit)
        .sort(sortObj)
        .lean()
        .select('-__v'),
      User.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
};

// New endpoint to get all organizations for the filter dropdown
const getOrganizationsForFilter = async (req, res) => {
  try {
    const organizations = await Organization.find({})
      .select('_id name')
      .sort({ name: 1 })
      .lean();

    res.json({ organizations });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch organizations', error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate user ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    // Find user first to verify existence
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deletion of super admin users if needed
    if (user.role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot delete super admin users' });
    }

    // Perform the deletion
    await User.findByIdAndDelete(id);

    res.json({ 
      success: true,
      message: 'User deleted successfully',
      deletedUser: {
        id: user._id,
        name: user.name,
        email: user.email || user.profileEmail
      }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
};

const deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate organization ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid organization ID format' });
    }

    // Find organization first to verify existence
    const organization = await Organization.findById(id);
    
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // CASCADE DELETE: Delete all related data
    // This ensures data isolation and prevents orphaned records [web:25][web:28]
    
    // 1. Delete all users belonging to this organization
    const deletedUsers = await User.deleteMany({ organization: id });
    
    // 2. Delete all subscriptions for this organization
    await Subscription.deleteMany({ organization: id });
    
    // 3. Delete any organization-specific data (tickets, payments, etc.)
    await Ticket.deleteMany({ organization: id });
    
    // Add any other collections that reference this organization
    // Example: await Project.deleteMany({ organization: id });
    // Example: await Document.deleteMany({ organization: id });
    
    // 4. Finally, delete the organization itself
    await Organization.findByIdAndDelete(id);

    res.json({ 
      success: true,
      message: 'Organization and all related data deleted successfully',
      deletedOrganization: {
        id: organization._id,
        name: organization.name,
        usersDeleted: deletedUsers.deletedCount
      }
    });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ 
      message: 'Failed to delete organization',
      error: error.message 
    });
  }
};



const getBilling = async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const skip = (page - 1) * limit;

    // Filter and sort parameters
    const {
      search = '',
      sortBy = 'organization',
      sortOrder = 'asc',
      status
    } = req.query;

    // Build query object - Note: For searching populated fields, we need to use aggregation
    const query = {};
    if (status) {
      query.appStatus = status;
    }
    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    let subscriptions, totalCount, summaryResult;

    if (search) {
      // Use aggregation for searching populated fields
      const aggregationPipeline = [
        {
          $lookup: {
            from: 'organizations',
            localField: 'organization',
            foreignField: '_id',
            as: 'organization'
          }
        },
        {
          $unwind: '$organization'
        },
        {
          $match: {
            $or: [
              { 'organization.name': { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
              { planName: { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
            ]
          }
        },
        {
          $sort: sortObj
        },
        {
          $skip: skip
        },
        {
          $limit: limit
        }
      ];

      const countPipeline = [
        {
          $lookup: {
            from: 'organizations',
            localField: 'organization',
            foreignField: '_id',
            as: 'organization'
          }
        },
        {
          $unwind: '$organization'
        },
        {
          $match: {
            $or: [
              { 'organization.name': { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
              { planName: { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
            ]
          }
        },
        {
          $count: 'total'
        }
      ];

      const summaryPipeline = [
        {
          $lookup: {
            from: 'organizations',
            localField: 'organization',
            foreignField: '_id',
            as: 'organization'
          }
        },
        { $unwind: '$organization' },
        {
          $match: {
            $or: [
              { 'organization.name': { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
              { planName: { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
            ]
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            activeSubscriptions: {
              $sum: { $cond: [{ $in: ['$appStatus', ['active', 'past_due']] }, 1, 0] }
            },
            activeTrials: { $sum: { $cond: ['$isTrialActive', 1, 0] } },
            totalSubscriptions: { $sum: 1 }
          }
        }
      ];

      [subscriptions, countResult, summaryResult] = await Promise.all([
        Subscription.aggregate(aggregationPipeline),
        Subscription.aggregate(countPipeline),
        Subscription.aggregate(summaryPipeline)
      ]);

      totalCount = countResult[0]?.total || 0;
    } else {
      // Simple query without search
      [subscriptions, totalCount,summaryResult] = await Promise.all([
        Subscription.find(query)
          .populate('organization')
          .skip(skip)
          .limit(limit)
          .sort(sortObj)
          .lean()
          .select('-__v'),
        Subscription.countDocuments(query),
        Subscription.aggregate([
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        activeSubscriptions: {
          $sum: { $cond: [{ $in: ['$appStatus', ['active', 'past_due']] }, 1, 0] }
        },
        activeTrials: { $sum: { $cond: ['$isTrialActive', 1, 0] } },
        totalSubscriptions: { $sum: 1 }
      }
    }
  ])
      ]);
    }

    const summary = summaryResult[0] || { totalRevenue: 0, activeSubscriptions: 0, activeTrials: 0, totalSubscriptions: 0 };

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      subscriptions,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      },
      summary
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch billing data', error: error.message });
  }
};

const getAnalytics = async (req, res) => {
  try {
    // Get date range for trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Parallel queries for better performance
    const [
      // Invoice Analytics
      invoices,
      invoicesByStatus,
      invoiceMonthlyTrend,
      topInvoices,
      
      // Deal Analytics
      deals,
      dealsByStatus,
      dealMonthlyTrend,
      topDeals,
      
      // Task Analytics (if you have Task model)
      tasks,
      tasksByStatus,
      tasksByPriority,
      
      // Contact Analytics
      contacts,
      contactsByLifecycleStage,
      contactsByStageStatus,
      
      // Company Analytics
      companies,
      companiesByIndustry,
      
      // Vendor Analytics
      vendors,
      vendorBalance
    ] = await Promise.all([
      // Invoices - populate deal, then company through deal
      Invoice.find()
        .populate({
          path: 'deal',
          populate: {
            path: 'company',
            select: 'name'
          }
        })
        .lean()
        .select('amount status date dueDate createdAt items deal'),
      
      Invoice.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }
      ]),
      
      Invoice.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 },
            total: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      
      Invoice.find()
        .sort({ amount: -1 })
        .limit(5)
        .populate({
          path: 'deal',
          populate: {
            path: 'company',
            select: 'name'
          }
        })
        .lean(),
      
      // Deals - populate company and contact
      Deal.find()
        .populate('company', 'name')
        .populate('contact', 'name email')
        .lean()
        .select('title amount status createdAt company contact'),
      
      Deal.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, totalValue: { $sum: '$amount' } } }
      ]),
      
      Deal.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 },
            totalValue: { $sum: '$amount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      
      Deal.find()
        .sort({ amount: -1 })
        .limit(5)
        .populate('company', 'name')
        .populate('contact', 'name')
        .lean(),
      
      // Tasks (if you have Task model, otherwise return empty array)
      Task ? Task.find().lean().select('status priority createdAt') : Promise.resolve([]),
      Task ? Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]) : Promise.resolve([]),
      Task ? Task.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]) : Promise.resolve([]),
      
      // Contacts with lifecycle stages
      Contact.find()
        .populate('company', 'name')
        .lean()
        .select('name email phone lifecycleStage stageStatus company createdAt'),
      
      Contact.aggregate([
        { $group: { _id: '$lifecycleStage', count: { $sum: 1 } } }
      ]),
      
      Contact.aggregate([
        { $group: { _id: '$stageStatus', count: { $sum: 1 } } }
      ]),
      
      // Companies
      Company.find()
        .lean()
        .select('name industry gstin createdAt'),
      
      Company.aggregate([
        { $group: { _id: '$industry', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      // Vendors
      Vendor.find()
        .lean()
        .select('name email phone company balance createdAt'),
      
      Vendor.aggregate([
        { $group: { _id: null, totalBalance: { $sum: '$balance' } } }
      ])
    ]);

    // Calculate metrics
    const totalInvoiceAmount = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const totalDealValue = deals.reduce((sum, deal) => sum + (deal.amount || 0), 0);
    const totalVendorBalance = vendorBalance.length > 0 ? vendorBalance[0].totalBalance : 0;
    
    // Payment conversion rate (based on status)
    const paidInvoices = invoicesByStatus.find(i => i._id === 'paid');
    const paymentConversionRate = invoices.length > 0 
      ? ((paidInvoices?.count || 0) / invoices.length * 100).toFixed(1)
      : 0;
    
    // Deal win rate
    const wonDeals = dealsByStatus.find(d => d._id?.toLowerCase() === 'won');
    const dealWinRate = deals.length > 0
      ? ((wonDeals?.count || 0) / deals.length * 100).toFixed(1)
      : 0;
    
    // Task completion rate (if tasks exist)
    const completedTasks = tasksByStatus.find(t => t._id === 'completed');
    const taskCompletionRate = tasks.length > 0
      ? ((completedTasks?.count || 0) / tasks.length * 100).toFixed(1)
      : 0;
    
    // Customer conversion rate
    const customers = contactsByLifecycleStage.find(c => c._id === 'Customer');
    const customerConversionRate = contacts.length > 0
      ? ((customers?.count || 0) / contacts.length * 100).toFixed(1)
      : 0;

    res.json({
      summary: {
        totalInvoices: invoices.length,
        totalInvoiceAmount,
        totalDeals: deals.length,
        totalDealValue,
        totalTasks: tasks.length,
        totalContacts: contacts.length,
        totalCompanies: companies.length,
        totalVendors: vendors.length,
        totalVendorBalance,
        paymentConversionRate,
        dealWinRate,
        taskCompletionRate,
        customerConversionRate
      },
      invoices: {
        byStatus: invoicesByStatus,
        monthlyTrend: invoiceMonthlyTrend,
        topInvoices: topInvoices.map(inv => ({
          _id: inv._id,
          amount: inv.amount,
          status: inv.status,
          company: inv.deal?.company, // Access company through deal
          deal: inv.deal ? { _id: inv.deal._id, title: inv.deal.title } : null,
          date: inv.date,
          itemCount: inv.items?.length || 0
        })),
        totalAmount: totalInvoiceAmount
      },
      deals: {
        byStatus: dealsByStatus,
        monthlyTrend: dealMonthlyTrend,
        topDeals: topDeals.map(deal => ({
          _id: deal._id,
          title: deal.title,
          amount: deal.amount,
          status: deal.status,
          company: deal.company,
          contact: deal.contact
        })),
        totalValue: totalDealValue
      },
      tasks: {
        byStatus: tasksByStatus,
        byPriority: tasksByPriority
      },
      contacts: {
        byLifecycleStage: contactsByLifecycleStage,
        byStageStatus: contactsByStageStatus,
        customerConversionRate
      },
      companies: {
        byIndustry: companiesByIndustry,
        withGSTIN: companies.filter(c => c.gstin).length
      },
      vendors: {
        totalBalance: totalVendorBalance,
        averageBalance: vendors.length > 0 ? (totalVendorBalance / vendors.length).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics data', error: error.message });
  }
};

const getSupportTickets = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const skip = (page - 1) * limit;

    const {
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status = '',          // <-- NEW
      priority = ''         // <-- NEW
    } = req.query;

    // ---------- 1. BUILD BASE QUERY ----------
    const query = {};

    if (status && status !== 'all') query.status = status;
    if (priority && priority !== 'all') query.priority = priority;

    // ---------- 2. SEARCH (subject OR org name) ----------
    let tickets, totalCount;

    if (search) {
      const aggregation = [
        { $lookup: { from: 'organizations', localField: 'organization', foreignField: '_id', as: 'org' } },
        { $unwind: '$org' },
        {
          $match: {
            $and: [
              query, // status / priority
              {
                $or: [
                  { subject: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
                  { 'org.name': { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
                ]
              }
            ]
          }
        },
        { $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } },
        { $skip: skip },
        { $limit: limit },
        // project only the fields the UI needs
        {
          $project: {
            _id: 1, subject: 1, description: 1, status: 1, priority: 1,
            createdAt: 1, updatedAt: 1,
            organization: { _id: '$org._id', name: '$org.name' },
            user: 1
          }
        }
      ];

      const countAgg = aggregation.slice(0, 3); // up to $match
      countAgg.push({ $count: 'total' });

      [tickets, [{ total: totalCount = 0 } = {}]] = await Promise.all([
        Ticket.aggregate(aggregation),
        Ticket.aggregate(countAgg)
      ]);
    } else {
      // ---------- NO SEARCH ----------
      [tickets, totalCount] = await Promise.all([
        Ticket.find(query)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .select('-__v'),
        Ticket.countDocuments(query)
      ]);
    }

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      tickets,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch support tickets', error: error.message });
  }
};

const getTenantDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch organization
    const organization = await Organization.findById(id).lean();
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Fetch subscription details
    const subscription = await Subscription.findOne({ organization: id })
      .lean()
      .select('-__v');

    // Fetch all document counts in parallel for better performance
    const [
      userCount,
      companyCount,
      contactCount,
      vendorCount,
      dealCount,
      invoiceCount,
      taskCount,
      meetingCount,
      proformaInvoiceCount,
      deliveryChallanCount,
      quotationCount,
      callLogCount,
      ticketCount
    ] = await Promise.all([
      User.countDocuments({ organization: id }),
      Company.countDocuments({ organization: id }),
      Contact.countDocuments({ organization: id }),
      Vendor.countDocuments({ organization: id }),
      Deal.countDocuments({ organization: id }),
      Invoice.countDocuments({ organization: id }),
      Task ? Task.countDocuments({ organization: id }) : Promise.resolve(0),
      Meeting ? Meeting.countDocuments({ organization: id }) : Promise.resolve(0),
      ProformaInvoice ? ProformaInvoice.countDocuments({ organization: id }) : Promise.resolve(0),
      deliveryChallan ? deliveryChallan.countDocuments({ organization: id }) : Promise.resolve(0),
      quotation ? quotation.countDocuments({ organization: id }) : Promise.resolve(0),
      CallLog ? CallLog.countDocuments({ organization: id }) : Promise.resolve(0),
      Ticket ? Ticket.countDocuments({ organization: id }) : Promise.resolve(0)
    ]);

    // Fetch recent support tickets (limit to 10)
    const tickets = Ticket ? await Ticket.find({ organization: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name email')
      .lean()
      .select('subject status priority createdAt user description') : [];

    // Fetch all users for this organization
    const users = await User.find({ organization: id })
      .lean()
      .select('name email role profileUrl createdAt')
      .sort({ createdAt: -1 });

    // Create ObjectId properly - Fix for the error
    const orgObjectId = new mongoose.Types.ObjectId(id);

    // Fetch revenue data with proper ObjectId
    const [totalRevenue, totalDealValue] = await Promise.all([
      Invoice.aggregate([
        { $match: { organization: orgObjectId } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Deal.aggregate([
        { $match: { organization: orgObjectId } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    // Fetch recent invoices
    const recentInvoices = await Invoice.find({ organization: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({
        path: 'deal',
        populate: {
          path: 'company',
          select: 'name'
        }
      })
      .lean()
      .select('amount status date createdAt invoiceNumber');

    // Fetch recent deals
    const recentDeals = await Deal.find({ organization: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('company', 'name')
      .populate('contact', 'name')
      .lean()
      .select('title amount status createdAt company contact');

    // Get activity breakdown by status with proper ObjectId
    const [
      invoicesByStatus,
      dealsByStatus,
      contactsByLifecycle,
      tasksByStatus
    ] = await Promise.all([
      Invoice.aggregate([
        { $match: { organization: orgObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Deal.aggregate([
        { $match: { organization: orgObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Contact.aggregate([
        { $match: { organization: orgObjectId } },
        { $group: { _id: '$lifecycleStage', count: { $sum: 1 } } }
      ]),
      Task ? Task.aggregate([
        { $match: { organization: orgObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]) : Promise.resolve([])
    ]);

    // Determine organization status
    let orgStatus = 'Inactive';
    if (subscription) {
      switch (subscription.appStatus) {
        case 'trial':
          orgStatus = 'Trial';
          break;
        case 'active':
        case 'past_due':
          orgStatus = 'Active';
          break;
        case 'suspended':
          orgStatus = 'Suspended';
          break;
        case 'cancelled':
          orgStatus = 'Cancelled';
          break;
        case 'expired':
          orgStatus = 'Expired';
          break;
        default:
          orgStatus = 'Inactive';
      }
    }

    const auditLogs = await UserAuditLog.find({ organization: id })
  .populate('performedBy', 'name email')
  .sort({ createdAt: -1 })
  .limit(50)
  .lean();

    res.status(200).json({
      organization: {
        _id: organization._id,
        name: organization.name,
        adminEmail: organization.adminEmail,
        status: orgStatus,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt
      },
      subscription: subscription ? {
        _id: subscription._id,
        planName: subscription.planName,
        billingCycle: subscription.billingCycle,
        totalAmount: subscription.totalAmount,
        status: subscription.status,
        appStatus: subscription.appStatus,
        isTrialActive: subscription.isTrialActive,
        trialEnd: subscription.trialEnd,
        nextBillingDate: subscription.nextBillingDate,
        userCount: subscription.userCount,
        pricePerUser: subscription.pricePerUser
      } : null,
      stats: {
        // User Management
        totalUsers: userCount,
        
        // CRM Entities
        totalCompanies: companyCount,
        totalContacts: contactCount,
        totalVendors: vendorCount,
        totalDeals: dealCount,
        
        // Sales Documents
        totalInvoices: invoiceCount,
        totalProformaInvoices: proformaInvoiceCount,
        totalDeliveryChallans: deliveryChallanCount,
        totalQuotations: quotationCount,
        
        // Activities
        totalTasks: taskCount,
        totalMeetings: meetingCount,
        totalCallLogs: callLogCount,
        
        // Support
        totalTickets: ticketCount,
        
        // Financial
        subscriptionAmount: subscription?.totalAmount || 0,
        totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
        totalDealValue: totalDealValue.length > 0 ? totalDealValue[0].total : 0
      },
      breakdown: {
        invoicesByStatus,
        dealsByStatus,
        contactsByLifecycle,
        tasksByStatus
      },
      users,
      auditLogs,
      tickets,
      recentInvoices,
      recentDeals
    });
  } catch (error) {
    console.error('Tenant details fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch tenant details', error: error.message });
  }
};

const createTicket = async (req, res) => {
  try {
    const { organizationName, email, subject, description, priority } = req.body;

    // Create ticket without organization validation
    const ticket = new Ticket({
      organizationName,
      email,
      subject,
      description,
      priority: priority || 'Medium'
    });

    await ticket.save();
    res.status(201).json({ 
      message: 'Ticket created successfully', 
      ticket 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTickets = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      status,
      priority
    } = req.query;

    // Build query with search
    const query = {};
    
    if (search) {
      query.$or = [
        { subject: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { organizationName: { $regex: buildFuzzySearchPattern(search), $options: 'i' } },
        { email: { $regex: buildFuzzySearchPattern(search), $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 },
      populate: 'createdBy'
    };

    const tickets = await Ticket.paginate(query, options);

    res.status(200).json({
      tickets: tickets.docs,
      pagination: {
        currentPage: tickets.page,
        totalPages: tickets.totalPages,
        totalCount: tickets.totalDocs,
        hasNextPage: tickets.hasNextPage,
        hasPrevPage: tickets.hasPrevPage
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id).populate('createdBy');
    
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    res.status(200).json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationName, email, subject, description, status, priority } = req.body;
    
    const ticket = await Ticket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    // Update fields
    if (organizationName) ticket.organizationName = organizationName;
    if (email) ticket.email = email;
    if (subject) ticket.subject = subject;
    if (description) ticket.description = description;
    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    
    await ticket.save();
    
    res.status(200).json({ 
      message: 'Ticket updated successfully', 
      ticket 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['Open', 'Pending', 'In Progress', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    
    // Find and update ticket
    const ticket = await Ticket.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    ).populate('createdBy', 'name email');
    
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    
    res.status(200).json({ 
      message: 'Ticket status updated successfully', 
      ticket 
    });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({ 
      message: 'Failed to update ticket status', 
      error: error.message 
    });
  }
};

const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findByIdAndDelete(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    res.status(200).json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getOrganizationPayments = async (req, res) => {
  try {
    const { orgId } = req.params;
    const payments = await SubscriptionPayment.find({ organization: orgId })
      .sort({ createdAt: -1 })
      .select('amount currency status method paymentFor razorpayPaymentId createdAt')
      .lean();

    res.json({ payments });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch payments' });
  }
}

// Admin tool for the "customer paid but never got a subscription" case —
// same logic as scripts/repairUnacknowledgedPayment.js, exposed over HTTP so
// support doesn't need shell/DB access. `apply: false` (default) only
// reports what would happen; `apply: true` actually reconciles by replaying
// the payment through reconcileSubscriptionPayment (the same path the
// webhook and the 15-min sweep job use), so this never becomes a second,
// drifting copy of settlement logic.
const checkPayment = async (req, res) => {
  try {
    const { paymentId, apply } = req.body;
    if (!paymentId || !paymentId.startsWith('pay_')) {
      return res.status(400).json({ error: 'A valid Razorpay payment id (pay_...) is required.' });
    }

    // Test and live are entirely separate datasets on Razorpay's side: a live
    // payment id fetched with test keys (or vice versa) comes back as "does
    // not exist", which reads like a typo but is really a mode mismatch. Say
    // which mode this server is in so that's obvious from the error itself.
    const keyMode = (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_')
      ? 'live'
      : (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')
        ? 'test'
        : 'unknown';

    let payment;
    try {
      payment = await razorpay.payments.fetch(paymentId);
    } catch (fetchErr) {
      return res.status(404).json({
        error: `Razorpay has no payment with id "${paymentId}" in ${keyMode.toUpperCase()} mode.`,
        keyMode,
        hint: keyMode === 'unknown'
          ? 'This server has no recognisable RAZORPAY_KEY_ID configured.'
          : `This server is using ${keyMode} API keys, and test/live payments are separate on Razorpay. If you can see this payment in the Razorpay dashboard, check whether the dashboard's Test Mode toggle matches — a ${keyMode === 'live' ? 'test' : 'live'}-mode payment is invisible to ${keyMode} keys.`,
        details: fetchErr.message,
      });
    }

    const paymentSummary = {
      id: payment.id,
      status: payment.status,
      amount: payment.amount / 100,
      currency: payment.currency,
      invoiceId: payment.invoice_id,
      organizationId: payment.notes?.organization_id,
      createdAt: new Date(payment.created_at * 1000),
    };

    if (payment.status !== 'captured') {
      return res.json({
        payment: paymentSummary,
        captured: false,
        message: `Payment status is "${payment.status}", not "captured" — no money was taken, nothing to reconcile.`,
      });
    }

    let subscription = payment.invoice_id
      ? await Subscription.findOne({ registrationLinkId: payment.invoice_id })
      : null;
    if (!subscription && payment.notes?.organization_id) {
      subscription = await Subscription.findOne({ organization: payment.notes.organization_id });
    }

    if (!subscription) {
      return res.json({
        payment: paymentSummary,
        captured: true,
        message: 'Payment was captured by Razorpay, but no matching subscription was found (no registrationLinkId or notes.organization_id match). This needs manual investigation.',
      });
    }

    await subscription.populate('organization', 'name email');
    const subscriptionSummary = {
      _id: subscription._id,
      organization: subscription.organization,
      planName: subscription.planName,
      paymentStatus: subscription.paymentStatus,
      isPaymentConfirmed: subscription.isPaymentConfirmed,
    };

    if (subscription.isPaymentConfirmed) {
      return res.json({
        payment: paymentSummary,
        captured: true,
        subscription: subscriptionSummary,
        alreadyReconciled: true,
        message: 'Already reconciled — this subscription is already confirmed. Nothing to do.',
      });
    }

    if (!apply) {
      return res.json({
        payment: paymentSummary,
        captured: true,
        subscription: subscriptionSummary,
        alreadyReconciled: false,
        message: 'Payment was captured but the subscription was never confirmed. Re-submit with apply: true to reconcile it.',
      });
    }

    // Same fix the script applies before reconciling: if "Resume Payment" moved
    // the subscription onto a newer registration link, the old link this
    // payment was made against is otherwise unreachable by the normal path.
    if (payment.invoice_id && subscription.registrationLinkId !== payment.invoice_id) {
      if (!subscription.priorRegistrationLinkIds?.includes(payment.invoice_id)) {
        subscription.priorRegistrationLinkIds = [
          ...(subscription.priorRegistrationLinkIds || []),
          payment.invoice_id,
        ];
        await subscription.save();
      }
    }

    const result = await reconcileSubscriptionPayment(subscription);
    const refreshed = await Subscription.findById(subscription._id).populate('organization', 'name email');

    res.json({
      payment: paymentSummary,
      captured: true,
      reconcileResult: result,
      subscription: {
        _id: refreshed._id,
        organization: refreshed.organization,
        planName: refreshed.planName,
        paymentStatus: refreshed.paymentStatus,
        isPaymentConfirmed: refreshed.isPaymentConfirmed,
        mandateStatus: refreshed.mandateStatus,
      },
      message: result.reconciled
        ? 'Reconciled — subscription is now confirmed.'
        : `Not reconciled: ${result.reason || 'unknown reason'}.`,
    });
  } catch (err) {
    console.error('Super admin payment check/repair error:', err);
    res.status(500).json({ error: 'Failed to check/reconcile payment', details: err.message });
  }
};

// Restarts a trial IN PLACE on the org's existing Subscription document —
// deliberately does NOT delegate to startFreeTrial() anymore. Two reasons,
// both found by tracing rather than assumed:
//
// 1. startFreeTrial() has its own independent `trialUsed` guard that this
//    super-admin action needs to bypass (per spec: only a LIVE paid
//    subscription should ever block a restart, never "this org used a
//    trial before"). Removing that guard from startFreeTrial() itself
//    would also lift it for the ordinary user-facing endpoint, which is
//    not what was asked.
// 2. startFreeTrial() unconditionally does `new Subscription({...})`.
//    Subscription.js's own unique index on `organization` is a PARTIAL
//    index — it only rejects a second document while appStatus is one of
//    {trial, active, past_due}. An 'expired'/'cancelled'/'suspended' doc
//    sits outside that filter, so calling startFreeTrial() again (even
//    with its trialUsed guard removed) would silently succeed in creating
//    a SECOND Subscription for the same organization — breaking the
//    one-canonical-subscription-per-org invariant. Reusing the existing
//    document and only resetting its trial-relevant fields keeps that
//    invariant intact and preserves history (_id, appStatusHistory).
const TRIAL_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // matches startFreeTrial's own trial length

const adminStartTrialForOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;

    const existingSubscription = await Subscription.findOne({
      organization: organizationId,
    });

    // HARD BLOCK — no override possible. Checks BOTH isPaymentConfirmed
    // AND appStatus, since a subscription can have isPaymentConfirmed: true
    // but appStatus already moved to 'cancelled' or 'expired' (meaning the
    // paid period is genuinely over and a new trial should be allowed).
    if (
      existingSubscription &&
      existingSubscription.isPaymentConfirmed &&
      ['active', 'past_due'].includes(existingSubscription.appStatus)
    ) {
      return res.status(409).json({
        error: 'This organization has an active paid subscription. ' +
               'A trial cannot be started while a paid subscription is live. ' +
               'Cancel the subscription first and wait for it to take effect ' +
               '(immediately if outside a paid period, or at period end if ' +
               'still within one), then a trial can be started.',
        code: 'PAID_SUBSCRIPTION_ACTIVE',
      });
    }

    // A currently-running trial isn't something to "restart" — this action
    // is for orgs whose entitlement has already ended (expired/cancelled/
    // suspended) or that never had a subscription at all.
    if (existingSubscription && existingSubscription.appStatus === 'trial') {
      return res.status(409).json({
        error: 'This organization already has an active trial running.',
        code: 'TRIAL_ALREADY_ACTIVE',
      });
    }

    const [adminUser, organization] = await Promise.all([
      User.findOne({ organization: organizationId, role: 'admin' }),
      Organization.findById(organizationId),
    ]);

    if (!adminUser) {
      return res.status(404).json({
        error: 'No admin user found for this organization',
      });
    }
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + TRIAL_DAYS_MS);
    const isRestart = !!existingSubscription;

    // Same trial defaults startFreeTrial() uses (plan_trial / growth /
    // monthly / ₹0) — reused here, not reinvented, just written onto the
    // EXISTING document instead of a new one when there is one.
    const subscription = existingSubscription || new Subscription({ organization: organizationId });
    subscription.razorpayPlanId = 'plan_trial';
    subscription.planName = 'growth';
    subscription.status = 'active';
    subscription.billingCycle = 'monthly';
    subscription.pricePerUser = 0;
    subscription.userCount = 1;
    subscription.totalAmount = 0;
    subscription.trialStart = trialStart;
    subscription.trialEnd = trialEnd;
    subscription.isTrialActive = true;
    subscription.trialUsed = true;
    subscription.currentPeriodStart = trialStart;
    subscription.currentPeriodEnd = trialEnd;
    // Reset checkout/payment residue from whatever this document's PRIOR
    // life carried (a stale mandate, a failed payment, an old add-on set)
    // so the restarted trial looks like a genuinely fresh one, not a
    // continuation of leftover state.
    subscription.isPaymentConfirmed = false;
    subscription.paymentStatus = 'pending_payment';
    subscription.mandateStatus = undefined;
    subscription.registrationLinkId = undefined;
    subscription.cancelAtPeriodEnd = false;
    subscription.pendingUpdate = undefined;
    subscription.activeAddons = [];
    subscription.adminNotice = {
      message: isRestart
        ? 'A free trial was restarted for your organization by our support team.'
        : 'A free trial was started for your organization by our support team.',
      createdAt: new Date(),
    };

    setAppStatus(subscription, 'trial', isRestart ? 'trial restarted by super admin' : 'trial started by super admin');
    await subscription.save();

    await emitBillingEvent({
      organization: organizationId,
      subscription: subscription._id,
      eventType: 'TRIAL_STARTED',
      status: 'completed',
      effectiveAt: trialEnd,
      after: subscription,
      metadata: { restartedByAdmin: isRestart },
    });

    try {
      await sendTrialStartedEmail(adminUser, organization, trialEnd);
    } catch (emailError) {
      console.error('Failed to send trial-started email:', emailError);
    }

    return res.json({
      success: true,
      message: isRestart ? 'Trial restarted' : 'Free trial started successfully',
      subscription,
      adminTriggered: true,
    });
  } catch (error) {
    console.error('Admin start trial error:', error);
    res.status(500).json({ error: 'Failed to start trial for organization' });
  }
};

const adminAdjustTrial = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { adjustmentDays } = req.body; // can be POSITIVE (extend) or NEGATIVE (reduce)

    if (typeof adjustmentDays !== 'number' || adjustmentDays === 0) {
      return res.status(400).json({
        error: 'adjustmentDays must be a non-zero number (positive to extend, negative to reduce)',
      });
    }

    if (Math.abs(adjustmentDays) > 60) {
      return res.status(400).json({
        error: 'adjustmentDays must be between -60 and 60',
      });
    }

    const subscription = await Subscription.findById(subscriptionId)
      .populate('organization', 'name email');

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const hasConvertedToPaid =
      subscription.isPaymentConfirmed &&
      ['active', 'past_due'].includes(subscription.appStatus);

    if (hasConvertedToPaid) {
      return res.status(409).json({
        error: 'This organization has an active paid subscription. Trial adjustment does not apply.',
        code: 'PAID_SUBSCRIPTION_ACTIVE',
      });
    }

    const currentTrialEnd = subscription.trialEnd
      ? new Date(subscription.trialEnd)
      : new Date();

    const newTrialEnd = new Date(
      currentTrialEnd.getTime() + adjustmentDays * 24 * 60 * 60 * 1000
    );

    const now = new Date();
    const resultsInExpiry = newTrialEnd <= now;

    subscription.trialEnd = newTrialEnd;
    subscription.currentPeriodEnd = newTrialEnd;

    if (!subscription.trialStart) {
      subscription.trialStart = new Date();
    }
    if (!subscription.trialUsed) {
      subscription.trialUsed = true;
    }

    if (resultsInExpiry) {
      subscription.isTrialActive = false;
      setAppStatus(
        subscription,
        'expired',
        `trial adjusted by ${adjustmentDays} days by super admin, resulting in immediate expiry`
      );
    } else {
      subscription.isTrialActive = true;
      if (subscription.status !== 'active') {
        subscription.status = 'active';
      }
      setAppStatus(
        subscription,
        'trial',
        `trial adjusted by ${adjustmentDays} days by super admin`
      );
    }

    const direction = adjustmentDays > 0 ? 'extended' : 'reduced';
    subscription.adminNotice = {
      message: `Your trial was ${direction} by ${Math.abs(adjustmentDays)} day${Math.abs(adjustmentDays) === 1 ? '' : 's'} by our support team. It now ${resultsInExpiry ? 'has ended' : `ends on ${newTrialEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}.`,
      createdAt: new Date(),
    };

    await subscription.save();

    // Record what actually happened — every other commercial state change
    // this app makes (upgrades, downgrades, cancellations, add-on changes)
    // gets a BillingEvent the Timeline/Calendar can show; an admin-driven
    // trial change was previously invisible (silently moved trialEnd with
    // no record of why). If the adjustment pushed the trial past "now", the
    // real consequence is that the trial ended — record it as TRIAL_ENDED
    // (attributed to admin), not TRIAL_ADJUSTED, so it reads the same as
    // any other trial ending rather than as a still-ongoing adjustment.
    // previousEnd/newEnd (both already-computed real Dates, not derived
    // client-side) let the Calendar render the actual changed SEGMENT of
    // the trial period — the territory added or removed — instead of a
    // generic "+3D" badge that carries no visual relationship to the
    // timeline itself.
    await emitBillingEvent(
      resultsInExpiry
        ? {
            organization: subscription.organization?._id || subscription.organization,
            subscription: subscription._id,
            eventType: 'TRIAL_ENDED',
            status: 'completed',
            effectiveAt: newTrialEnd,
            metadata: { endedBy: 'admin', adjustmentDays, previousEnd: currentTrialEnd, newEnd: newTrialEnd },
          }
        : {
            organization: subscription.organization?._id || subscription.organization,
            subscription: subscription._id,
            eventType: 'TRIAL_ADJUSTED',
            status: 'completed',
            effectiveAt: newTrialEnd,
            metadata: { adjustmentDays, previousEnd: currentTrialEnd, newEnd: newTrialEnd },
          }
    );

    // Email the org's admin — wrapped so a delivery failure never blocks
    // the actual trial adjustment, which is already saved above. One
    // coherent email per real-world consequence, not one per input: a
    // shortening large enough to push the trial into the past is, from the
    // org's perspective, indistinguishable from adminEndTrialNow — they
    // don't experience "reduced" and then separately "ended", they just
    // find their trial over. Sending both would be confusing/redundant, so
    // resultsInExpiry routes to the exact same "trial has ended" email
    // adminEndTrialNow sends, not the extend/reduce template.
    try {
      const adminUser = await User.findOne({
        organization: subscription.organization?._id || subscription.organization,
        role: 'admin',
      });
      if (adminUser && resultsInExpiry) {
        await sendTrialEndedByAdminEmail(adminUser, subscription.organization);
      } else if (adminUser) {
        await sendTrialAdjustedByAdminEmail(adminUser, subscription.organization, newTrialEnd, adjustmentDays);
      }
    } catch (emailError) {
      console.error('Failed to send trial-adjusted email:', emailError);
    }

    res.json({
      success: true,
      message: `Trial adjusted by ${adjustmentDays} days`,
      subscription: {
        _id: subscription._id,
        organization: subscription.organization,
        isTrialActive: subscription.isTrialActive,
        appStatus: subscription.appStatus,
        trialEnd: subscription.trialEnd,
        adjustmentDays,
      },
    });
  } catch (error) {
    console.error('Admin adjust trial error:', error);
    res.status(500).json({ error: 'Failed to adjust trial', details: error.message });
  }
};

const adminEndTrialNow = async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const subscription = await Subscription.findById(subscriptionId)
      .populate('organization', 'name email');

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (subscription.appStatus !== 'trial') {
      return res.status(400).json({
        error: 'This subscription is not currently in trial — nothing to end.',
      });
    }

    subscription.trialEnd = new Date();
    subscription.currentPeriodEnd = new Date();
    subscription.isTrialActive = false;
    setAppStatus(subscription, 'expired', 'trial ended immediately by super admin');
    subscription.adminNotice = {
      message: 'Your trial was ended by our support team. Subscribe to a plan to keep adding and editing data.',
      createdAt: new Date(),
    };

    await subscription.save();

    await emitBillingEvent({
      organization: subscription.organization?._id || subscription.organization,
      subscription: subscription._id,
      eventType: 'TRIAL_ENDED',
      status: 'completed',
      effectiveAt: subscription.trialEnd,
      metadata: { endedBy: 'admin' },
    });

    try {
      const adminUser = await User.findOne({
        organization: subscription.organization?._id || subscription.organization,
        role: 'admin',
      });
      if (adminUser) {
        await sendTrialEndedByAdminEmail(adminUser, subscription.organization);
      }
    } catch (emailError) {
      console.error('Failed to send trial-ended email:', emailError);
    }

    res.json({
      success: true,
      message: 'Trial ended immediately',
      subscription: {
        _id: subscription._id,
        organization: subscription.organization,
        appStatus: subscription.appStatus,
        trialEnd: subscription.trialEnd,
      },
    });
  } catch (error) {
    console.error('Admin end trial now error:', error);
    res.status(500).json({
      error: 'Failed to end trial',
      details: error.message
    });
  }
};

// Subscription cancellation — super admin gets exactly the same action a
// real user has through the UI, nothing more. Reuses cancelSubscription
// unchanged via the same fake-req pattern as adminStartTrialForOrganization
// above. Plan upgrade/downgrade was deliberately removed: a plan only
// actually changes once the org completes Razorpay checkout themselves,
// so there's no super-admin-only value in triggering it — the org's own
// Plans page already does this correctly.
const adminCancelSubscriptionForOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { cancelAtPeriodEnd = true } = req.body || {};

    const adminUser = await User.findOne({
      organization: organizationId,
      role: 'admin',
    });

    if (!adminUser) {
      return res.status(404).json({
        error: 'No admin user found for this organization',
      });
    }

    // Snapshot whether this was a trial cancellation before calling
    // cancelSubscription, since the function mutates/clears trial fields —
    // the email/notice need to know which message applies.
    const subscriptionBefore = await Subscription.findOne({ organization: organizationId });
    const wasTrial = !!subscriptionBefore?.isTrialActive;

    const fakeReq = {
      body: { cancelAtPeriodEnd },
      user: adminUser,
    };
    let capturedStatus = 200;
    let capturedBody = null;
    const fakeRes = {
      status(code) { capturedStatus = code; return this; },
      json(body) { capturedBody = body; return this; },
    };

    await cancelSubscription(fakeReq, fakeRes);

    if (capturedStatus === 200) {
      const organization = await Organization.findById(organizationId);
      const updatedSubscription = await Subscription.findOne({ organization: organizationId });

      // Hotfix (docs/audit/PHASE3_ENTITLEMENT_WINDOW_SCHEMA_TRACE.md finding
      // #16-17): this used to read currentPeriodEnd directly for the "access
      // until X" claim — the ROLLING invoice-cycle field, not the customer's
      // actual paid-for entitlement. getAccessEntitlementEnd() returns
      // currentPeriodEnd unchanged for monthly (identical wording to before)
      // and the real anchor-relative entitlement window end for yearly.
      const entitlementEnd = updatedSubscription ? getAccessEntitlementEnd(updatedSubscription) : null;

      if (updatedSubscription) {
        updatedSubscription.adminNotice = {
          message: wasTrial
            ? 'Your trial was cancelled by our support team.'
            : `Your subscription was cancelled by our support team. You'll continue to have access until ${entitlementEnd ? new Date(entitlementEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the end of your current billing period'}.`,
          createdAt: new Date(),
        };
        await updatedSubscription.save();
      }

      try {
        await sendSubscriptionCancelledByAdminEmail(
          adminUser,
          organization,
          entitlementEnd,
          wasTrial
        );
      } catch (emailError) {
        console.error('Failed to send cancellation email:', emailError);
      }
    }

    return res.status(capturedStatus).json({
      ...capturedBody,
      adminTriggered: true,
    });
  } catch (error) {
    console.error('Admin cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription for organization' });
  }
};

const PlanConfig = require('../models/PlanConfig');
const restrictByPlan = require('../middlewares/restrictByPlan');

const getPlans = async (req, res) => {
  try {
    const plans = await PlanConfig.find({}).sort({ monthlyPrice: 1 });
    res.json({ plans });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
};

const updatePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { monthlyPrice, yearlyPrice, discount, isActive, features } = req.body;

    const plan = await PlanConfig.findOne({ planId });
    if (!plan) {
      return res.status(404).json({ error: `Plan '${planId}' not found` });
    }

    if (features !== undefined) {
      if (typeof features !== 'object' || features === null) {
        return res.status(400).json({ error: 'features must be an object' });
      }

      const numericFields = ['recordsLimit', 'emailTemplates', 'salesPipelines', 'customFields', 'recordTags', 'websiteForms', 'fileStorage', 'includedSeats', 'staffSeats'];
      for (const field of numericFields) {
        if (features[field] !== undefined && (typeof features[field] !== 'number' || features[field] < 0)) {
          return res.status(400).json({ error: `features.${field} must be a non-negative number` });
        }
      }

      if (features.modules !== undefined) {
        if (typeof features.modules !== 'object' || features.modules === null) {
          return res.status(400).json({ error: 'features.modules must be an object' });
        }
        for (const [moduleName, moduleConfig] of Object.entries(features.modules)) {
          if (typeof moduleConfig !== 'object' || moduleConfig === null) {
            return res.status(400).json({ error: `features.modules.${moduleName} must be an object` });
          }
          if (typeof moduleConfig.read !== 'boolean' || typeof moduleConfig.write !== 'boolean') {
            return res.status(400).json({
              error: `features.modules.${moduleName}.read and .write must both be booleans`,
            });
          }
          if (
            moduleConfig.limit !== undefined &&
            moduleConfig.limit !== 'unlimited' &&
            (typeof moduleConfig.limit !== 'number' || moduleConfig.limit < 0)
          ) {
            return res.status(400).json({
              error: `features.modules.${moduleName}.limit must be "unlimited" or a non-negative number`,
            });
          }
        }
      }

      if (features.extraSeatPrice !== undefined) {
        if (typeof features.extraSeatPrice !== 'object' || features.extraSeatPrice === null) {
          return res.status(400).json({ error: 'features.extraSeatPrice must be an object' });
        }
        for (const cycle of ['monthly', 'yearly']) {
          if (
            features.extraSeatPrice[cycle] !== undefined &&
            (typeof features.extraSeatPrice[cycle] !== 'number' || features.extraSeatPrice[cycle] < 0)
          ) {
            return res.status(400).json({ error: `features.extraSeatPrice.${cycle} must be a non-negative number` });
          }
        }
      }

      if (features.extraSeatRazorpayPlanIds !== undefined) {
        if (typeof features.extraSeatRazorpayPlanIds !== 'object' || features.extraSeatRazorpayPlanIds === null) {
          return res.status(400).json({ error: 'features.extraSeatRazorpayPlanIds must be an object' });
        }
        for (const cycle of ['monthly', 'yearly']) {
          if (
            features.extraSeatRazorpayPlanIds[cycle] !== undefined &&
            features.extraSeatRazorpayPlanIds[cycle] !== null &&
            typeof features.extraSeatRazorpayPlanIds[cycle] !== 'string'
          ) {
            return res.status(400).json({ error: `features.extraSeatRazorpayPlanIds.${cycle} must be a string or null` });
          }
        }
      }
    }

    if (monthlyPrice !== undefined) plan.monthlyPrice = monthlyPrice;
    if (yearlyPrice !== undefined) plan.yearlyPrice = yearlyPrice;
    if (discount !== undefined) plan.discount = discount;
    if (isActive !== undefined) plan.isActive = isActive;
    if (features !== undefined) {
      plan.features = {
        ...plan.features,
        ...features,
        modules: {
          ...plan.features.modules,
          ...(features.modules || {}),
        },
        extraSeatPrice: {
          ...plan.features.extraSeatPrice,
          ...(features.extraSeatPrice || {}),
        },
        extraSeatRazorpayPlanIds: {
          ...plan.features.extraSeatRazorpayPlanIds,
          ...(features.extraSeatRazorpayPlanIds || {}),
        },
      };
    }

    await plan.save();

    // Invalidate restrictByPlan's per-org cache for every affected org so the
    // new limits take effect on their very next request rather than after the 5 min TTL.
    const affectedSubscriptions = await Subscription.find({ planName: planId }).select('organization');
    for (const sub of affectedSubscriptions) {
      restrictByPlan.clearOrgCache(sub.organization.toString());
    }

    res.json({
      message: `Plan '${planId}' updated successfully`,
      plan,
      affectedOrganizations: affectedSubscriptions.length,
    });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
};

// ── Add-on Catalog CRUD ──────────────────────────────────────────────────────

const PlanAddon = require('../models/PlanAddon');

const getAddons = async (req, res) => {
  try {
    const addons = await PlanAddon.find({}).sort({ sortOrder: 1 });
    res.json({ addons });
  } catch (error) {
    console.error('Get addons error:', error);
    res.status(500).json({ error: 'Failed to fetch add-ons' });
  }
};

const createAddon = async (req, res) => {
  try {
    const {
      key, displayName, description, pricingType, price, effectType, targetKey,
      incrementPerUnit, unlockRead, unlockWrite, availableOnPlans, maxQuantityPerOrg, sortOrder, isActive,
    } = req.body;

    if (!key || typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ error: 'key is required' });
    }
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return res.status(400).json({ error: 'displayName is required' });
    }
    if (!['quantity', 'boolean'].includes(pricingType)) {
      return res.status(400).json({ error: 'pricingType must be "quantity" or "boolean"' });
    }
    if (!['limit_boost', 'module_unlock', 'flag_only'].includes(effectType)) {
      return res.status(400).json({ error: 'effectType must be "limit_boost", "module_unlock", or "flag_only"' });
    }
    if ((effectType === 'limit_boost' || effectType === 'module_unlock') && (!targetKey || !String(targetKey).trim())) {
      return res.status(400).json({ error: 'targetKey is required for limit_boost and module_unlock effect types' });
    }
    if (price) {
      if (price.monthly !== undefined && (typeof price.monthly !== 'number' || price.monthly < 0)) {
        return res.status(400).json({ error: 'price.monthly must be a non-negative number' });
      }
      if (price.yearly !== undefined && (typeof price.yearly !== 'number' || price.yearly < 0)) {
        return res.status(400).json({ error: 'price.yearly must be a non-negative number' });
      }
    }

    const existing = await PlanAddon.findOne({ key: key.trim() });
    if (existing) {
      return res.status(400).json({ error: `An add-on with key "${key.trim()}" already exists` });
    }

    const addon = await PlanAddon.create({
      key: key.trim(),
      displayName: displayName.trim(),
      description: description || '',
      pricingType,
      effectType,
      targetKey: targetKey ? String(targetKey).trim() : null,
      incrementPerUnit: incrementPerUnit ?? 1,
      unlockRead: unlockRead ?? true,
      unlockWrite: unlockWrite ?? true,
      price: { monthly: price?.monthly ?? 0, yearly: price?.yearly ?? 0 },
      availableOnPlans: availableOnPlans || [],
      maxQuantityPerOrg: maxQuantityPerOrg ?? null,
      sortOrder: sortOrder ?? 0,
      isActive: isActive ?? false,
    });

    res.status(201).json({ addon });
  } catch (error) {
    console.error('Create addon error:', error);
    res.status(500).json({ error: 'Failed to create add-on' });
  }
};

const updateAddon = async (req, res) => {
  try {
    const { addonId } = req.params;
    const {
      key, displayName, description, pricingType, effectType, targetKey,
      incrementPerUnit, unlockRead, unlockWrite, price, availableOnPlans,
      maxQuantityPerOrg, sortOrder, isActive,
    } = req.body;

    const addon = await PlanAddon.findById(addonId);
    if (!addon) return res.status(404).json({ error: 'Add-on not found' });

    if (key !== undefined && key !== addon.key) {
      return res.status(400).json({ error: 'key cannot be changed after creation' });
    }
    if (pricingType !== undefined && !['quantity', 'boolean'].includes(pricingType)) {
      return res.status(400).json({ error: 'pricingType must be "quantity" or "boolean"' });
    }
    if (effectType !== undefined && !['limit_boost', 'module_unlock', 'flag_only'].includes(effectType)) {
      return res.status(400).json({ error: 'effectType must be "limit_boost", "module_unlock", or "flag_only"' });
    }
    const resolvedEffectType = effectType ?? addon.effectType;
    if (
      (resolvedEffectType === 'limit_boost' || resolvedEffectType === 'module_unlock') &&
      targetKey !== undefined && (!targetKey || !String(targetKey).trim())
    ) {
      return res.status(400).json({ error: 'targetKey is required for limit_boost and module_unlock effect types' });
    }
    if (price) {
      if (price.monthly !== undefined && (typeof price.monthly !== 'number' || price.monthly < 0)) {
        return res.status(400).json({ error: 'price.monthly must be a non-negative number' });
      }
      if (price.yearly !== undefined && (typeof price.yearly !== 'number' || price.yearly < 0)) {
        return res.status(400).json({ error: 'price.yearly must be a non-negative number' });
      }
    }

    if (displayName !== undefined) addon.displayName = displayName.trim();
    if (description !== undefined) addon.description = description;
    if (pricingType !== undefined) addon.pricingType = pricingType;
    if (effectType !== undefined) addon.effectType = effectType;
    if (targetKey !== undefined) addon.targetKey = String(targetKey).trim() || null;
    if (incrementPerUnit !== undefined) addon.incrementPerUnit = incrementPerUnit;
    if (unlockRead !== undefined) addon.unlockRead = unlockRead;
    if (unlockWrite !== undefined) addon.unlockWrite = unlockWrite;
    if (price !== undefined) {
      addon.price = {
        monthly: price.monthly ?? addon.price.monthly,
        yearly: price.yearly ?? addon.price.yearly,
      };
    }
    if (availableOnPlans !== undefined) addon.availableOnPlans = availableOnPlans;
    if (maxQuantityPerOrg !== undefined) addon.maxQuantityPerOrg = maxQuantityPerOrg;
    if (sortOrder !== undefined) addon.sortOrder = sortOrder;
    if (isActive !== undefined) addon.isActive = isActive;

    await addon.save();
    res.json({ addon });
  } catch (error) {
    console.error('Update addon error:', error);
    res.status(500).json({ error: 'Failed to update add-on' });
  }
};

const deleteAddon = async (req, res) => {
  try {
    const { addonId } = req.params;

    const addon = await PlanAddon.findById(addonId);
    if (!addon) return res.status(404).json({ error: 'Add-on not found' });

    const activeCount = await Subscription.countDocuments({
      'activeAddons.addonKey': addon.key,
    });
    if (activeCount > 0) {
      return res.status(400).json({
        error: `Cannot delete — ${activeCount} organization${activeCount === 1 ? '' : 's'} currently ${activeCount === 1 ? 'has' : 'have'} this add-on active. Deactivate it instead to hide it from new purchases without breaking existing subscriptions.`,
      });
    }

    await PlanAddon.findByIdAndDelete(addonId);
    res.json({ message: 'Add-on deleted successfully' });
  } catch (error) {
    console.error('Delete addon error:', error);
    res.status(500).json({ error: 'Failed to delete add-on' });
  }
};

module.exports = {
  getOverview,
  getTenants,
  getUsers,
  getBilling,
  getAnalytics,
  getSupportTickets,
  getTenantDetails,
  createTicket,
  getTickets,
  getTicketById,
  updateTicket,
  deleteTicket,
  getOrganizationsForFilter,
  updateTicketStatus,
  getOrganizationPayments,
  checkPayment,
  adminStartTrialForOrganization,
  adminAdjustTrial,
  adminEndTrialNow,
  adminCancelSubscriptionForOrganization,
  deleteUser,
  deleteOrganization,
  getPlans,
  updatePlan,
  getAddons,
  createAddon,
  updateAddon,
  deleteAddon,
};
