//middlewares/userSync.js
const User = require('../models/User');
const Invited = require('../models/Invited');
const Organization = require('../models/Organization');
const generateUniqueCode = require('../utils/generateUniqueCode');
const { notifyAdminsOfNewStaff } = require('../controllers/authController');

module.exports = async (req, res, next) => {
  if (req.auth && req.auth._id && !req.auth.sub) {
    try {
      const SuperAdmin = require('../models/SuperAdmin');
      const superAdmin = await SuperAdmin.findById(req.auth._id).select('-password');
      if (!superAdmin) {
        return res.status(401).json({ message: 'Super-admin not found' });
      }
      req.superAdmin = superAdmin;
      req.user = superAdmin;
      return next();
    } catch (err) {
      console.error('Super-admin lookup failed:', err);
      return res.status(500).json({ message: 'Server error during super-admin authentication' });
    }
  }
  const auth0User = req.auth;
  const sub = auth0User.sub;
  const namespace = process.env.AUTH0_NAMESPACE;
  let email = auth0User[`${namespace}email`] || auth0User.email;
  // Null rather than an "Unknown" placeholder: the overwrite paths below
  // must be able to tell "provider sent no name" apart from a real one, or
  // a login with a nameless token clobbers the stored name with the
  // placeholder.
  const name = auth0User[`${namespace}name`] || auth0User.name || null;
  const provider = sub.split('|')[0];
  // User.name is required, so creation still needs something when the
  // provider sent no name. The email local part is a recognizable stand-in;
  // "Unknown" rendered as the signed-in user's display name in the nav.
  const nameForCreate = name || (email ? email.split('@')[0] : 'Unknown');
  let updated = false;

  if (provider === 'password') {
    const userId = sub.split('|')[1];
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    return next();
  }

  if (provider === 'phone') {
    const phone = sub.split('|')[1];
    let user = await User.findOne({ phone });
    if (user) {
      if (name && user.name !== name) {
        user.name = name;
        updated = true;
      }
      if (user.profileEmail !== email) {
        user.profileEmail = email;
        updated = true;
      }
      if (updated) await user.save();
      req.user = user;
      return next();
    }

    // For new phone user, should not reach here as registration handles it
    return res.status(401).json({ message: 'User not found' });
  }

  if (provider === 'facebook') {
    let user = await User.findOne({ auth0Id: sub });
    if (user) {
      req.user = user;
      return next();
    }

    // If no email, prompt for it
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        error: 'EMAIL_REQUIRED',
        message: 'Email not available from provider',
        requiresEmail: true,
        provider: 'facebook',
        name,
      });
    }

    // Check if email is already taken by another user
    const emailTaken = await User.findOne({ email, auth0Id: { $ne: sub } });
    if (emailTaken) {
      return res.status(400).json({ message: "This email is already registered" });
    }

    // Check for invitation by email
    const invited = await Invited.findOne({ email });
    if (invited) {
      user = new User({
        auth0Id: sub,
        name: nameForCreate,
        email,
        role: 'staff',
        organization: invited.organization,
        permissions: invited.permissions || [],
      });
      await user.save();
      await Invited.deleteOne({ _id: invited._id });
      notifyAdminsOfNewStaff({ organization: invited.organization, staffUser: user }).catch((err) =>
        console.error('Failed to notify admins of new staff:', err.message)
      );
      req.user = user;
      return next();
    }

    // No user or invitation found, require registration
    return res.status(428).json({
      error: 'REGISTRATION_REQUIRED',
      message: 'Complete registration by providing a company code to join or organization name to create a new one',
      requiresSetup: true,
    });
  }

  // For non-Facebook providers (Google, GitHub)
  // Access tokens don't always carry the email claim. Without it a social
  // login can only match by auth0Id — which Profile's Disconnect Google
  // clears — so an existing account fell through to REGISTRATION_REQUIRED.
  // Ask Auth0 for it with the same bearer token — only when auth0Id alone
  // can't find the user, since /userinfo is rate-limited.
  if (!email && !(await User.exists({ auth0Id: sub }))) {
    try {
      const axios = require('axios');
      const { data } = await axios.get(`https://${process.env.AUTH0_DOMAIN}/userinfo`, {
        headers: { Authorization: req.headers.authorization },
        timeout: 5000,
      });
      if (data?.email) email = data.email.toLowerCase();
    } catch (err) {
      console.error('userSync: /userinfo email lookup failed:', err.message);
    }
  }
  // FIX: only search by email if email is actually defined
  // Without this guard, { email: undefined } matches documents with no email field
  let user = await User.findOne({
    $or: [
      { auth0Id: sub },
      ...(email ? [{ email }] : []),
    ],
  });

  if (user) {
    if (!user.auth0Id) {
      user.auth0Id = sub;
      updated = true;
    }
    if (email && user.email !== email) {
      user.email = email;
      updated = true;
    }
    if (name && user.name !== name) {
      user.name = name;
      updated = true;
    }
    if (updated) await user.save();
    req.user = user;
    return next();
  }

  const invited = await Invited.findOne({ email });
  if (invited) {
    user = new User({
      auth0Id: sub,
      name: nameForCreate,
      email,
      role: 'staff',
      organization: invited.organization,
      permissions: invited.permissions || [],
    });
    await user.save();
    await Invited.deleteOne({ _id: invited._id });
    notifyAdminsOfNewStaff({ organization: invited.organization, staffUser: user }).catch((err) =>
      console.error('Failed to notify admins of new staff:', err.message)
    );
    req.user = user;
    return next();
  }

  console.warn('userSync: REGISTRATION_REQUIRED', { sub, email: email || null });
  return res.status(428).json({
    error: 'REGISTRATION_REQUIRED',
    message: 'Complete registration by providing a company code to join or organization name to create a new one',
    requiresSetup: true,
  });
};