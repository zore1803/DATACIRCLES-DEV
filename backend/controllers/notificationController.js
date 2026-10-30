const NotificationSettings = require("../models/NotificationSettings");
const Notification = require("../models/Notification");
const User = require("../models/User");

// Who may see which feed entry:
//   - a change made by an admin is visible to admins only;
//   - a change made by staff is visible to everyone in the org (the staff
//     member themself, the other staff, and the admins).
// Admins therefore see the whole feed, while a staff viewer sees everything
// except entries whose actor is an admin. Resolved from the actor's *current*
// role, so entries written before this rule existed are covered too.
const feedFilterFor = async (user) => {
  const base = { organization: user.organization };
  if (user.role === "admin") return base;
  const adminIds = await User.find({
    organization: user.organization,
    role: "admin",
  }).distinct("_id");
  return adminIds.length ? { ...base, actor: { $nin: adminIds } } : base;
};

// --- Activity feed (auto-generated create/update/delete notifications) -------

// List recent notifications for the current user's organization, newest first,
// each flagged with whether the current user has read it.
exports.getFeed = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const userId = req.user._id;

    const notifications = await Notification.find(await feedFilterFor(req.user))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const items = notifications.map((n) => ({
      ...n,
      read: (n.readBy || []).some((id) => String(id) === String(userId)),
    }));

    const unreadCount = items.filter((n) => !n.read).length;

    res.json({ items, unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Count of notifications the current user hasn't read yet.
exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      ...(await feedFilterFor(req.user)),
      readBy: { $ne: req.user._id },
    });
    res.json({ unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Mark a single notification read for the current user.
exports.markRead = async (req, res) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id, ...(await feedFilterFor(req.user)) },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ message: "Marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Clear (delete) all notifications for the organization.
exports.clearAll = async (req, res) => {
  try {
    await Notification.deleteMany(await feedFilterFor(req.user));
    res.json({ message: "Notifications cleared" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Mark every notification in the org read for the current user.
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { ...(await feedFilterFor(req.user)), readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ message: "All marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get current user's notification settings (within their organization)
exports.getMySettings = async (req, res) => {
  try {
    const settings = await NotificationSettings.findOne({
      organization: req.user.organization,
      userId: req.user._id
    });

    if (!settings) {
      // Create default settings if none exist
      const newSettings = await NotificationSettings.create({
        organization: req.user.organization,
        userId: req.user._id
      });
      return res.json(newSettings);
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update current user's notification settings
exports.updateMySettings = async (req, res) => {
  try {
    const { tasks, meetings, deals, dealTransitions } = req.body;

    const settings = await NotificationSettings.findOneAndUpdate(
      {
        organization: req.user.organization,
        userId: req.user._id
      },
      { tasks, meetings, deals, dealTransitions },
      { new: true, upsert: true }
    );

    res.json({ message: "Settings updated successfully", settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Get settings of a specific user in an organization
exports.getUserSettings = async (req, res) => {
  try {
    const { orgId, userId } = req.params;

    const settings = await NotificationSettings.findOne({
      organization: orgId,
      userId
    });

    if (!settings) {
      return res.status(404).json({ error: "Notification settings not found" });
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Update settings of a specific user in an organization
exports.updateUserSettings = async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const { tasks, meetings, deals, dealTransitions } = req.body;

    const settings = await NotificationSettings.findOneAndUpdate(
      { organization: orgId, userId },
      { tasks, meetings, deals, dealTransitions },
      { new: true, upsert: true }
    );

    res.json({ message: "User settings updated successfully", settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
