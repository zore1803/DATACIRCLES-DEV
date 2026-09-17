import DeleteIcon from "../components/common/DeleteIcon";
import { useEffect, useState } from "react";
import API, { configureAxios } from "../services/api";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useSubscription } from "../contexts/SubscriptionContext";
import useRazorpay from "../hooks/useRazorpay";
import { waitForSettlement } from "../utils/waitForSettlement";
import toast from "react-hot-toast";
import {
  UserPlus,
  Mail,
  Shield,
  Copy,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Key,
  Settings,
  EyeOff,
  Loader2,
  User,
  Crown,
} from "lucide-react";
import AppToaster from "../components/AppToaster";
import TeamIcon from "../components/common/TeamIcon";
import EyeIcon from "../components/common/EyeIcon";
import EditIcon from "../components/common/EditIcon";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "default",
}) {
  if (!isOpen) return null;

  const getTypeStyles = () => {
    switch (type) {
      case "danger":
        return {
          icon: <AlertCircle className="w-6 h-6 text-danger-600" />,
          buttonClass: "bg-danger-500 hover:bg-danger-600",
          iconBg: "bg-danger-100",
        };
      case "warning":
        return {
          icon: <AlertCircle className="w-6 h-6 text-warning-600" />,
          buttonClass: "bg-warning-500 hover:bg-warning-600",
          iconBg: "bg-warning-100",
        };
      default:
        return {
          icon: <CheckCircle2 className="w-6 h-6 text-primary-600" />,
          buttonClass: "bg-primary-500 hover:bg-primary-600",
          iconBg: "bg-primary-100",
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex justify-center items-center z-[10000] p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border-2 border-neutral-200 animate-fade-in">
        <div className="flex items-start gap-4 mb-4">
          <div className={`p-3 rounded-xl ${styles.iconBg}`}>{styles.icon}</div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-neutral-900 mb-2">{title}</h3>
            <p className="text-neutral-500 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors font-semibold"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 text-white rounded-xl transition-colors font-semibold shadow-lg ${styles.buttonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserManagement() {
  const { getAccessTokenSilently, user: auth0User } = useAuth0();
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState({ email: "", permissions: {} });
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [showModal, setShowModal] = useState(false);
  useBodyScrollLock(showModal || formVisible);
  const [orgCode, setOrgCode] = useState("");
  // Distinguishes "still fetching" from "the fetch failed" - the card used to
  // render "Loading..." for both.
  const [orgCodeError, setOrgCodeError] = useState("");
  const { subscription, seatStatus, fetchSeatStatus } = useSubscription();
  const { razorpayLoaded, openCheckout } = useRazorpay();
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    confirmText: "Confirm",
    cancelText: "Cancel",
    type: "default",
  });

  const permissionOptions = ["no", "readonly", "read-write", "own-only"];
  const resources = [
    "Companies",
    "Deals",
    "Contacts",
    "Tasks",
    "Invoices",
    "Vendors",
    "purchases",
    "purchase-orders",
    "Items",
    "Meetings",
    "Emails",
    "Quotations",
    "Delivery-Challans",
    "Forms",
  ];

  const getInitialPermissions = (user) => {
    const perms = {};
    resources.forEach((res) => {
      const found = user.permissions?.find(
        (p) => p.name.toLowerCase() === res.toLowerCase()
      );
      perms[res] = found?.permission || "no";
    });
    return perms;
  };

  const savePermissions = async () => {
    const formattedPermissions = Object.entries(permissions)
      .filter(([_, perm]) => perm !== "no")
      .map(([name, permission]) => ({ name, permission }));

    try {
      await API.put(`/auth/permissions/${selectedUser._id}`, {
        permissions: formattedPermissions,
      });
      setShowModal(false);
      toast.success("Permissions updated successfully");
      fetchUsers();
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
      } else {
        toast.error(err.response?.data?.error || "Failed to update permissions");
      }
      console.error(err);
    }
  };

  useEffect(() => {
    configureAxios(getAccessTokenSilently);
    // Gated on the stored user, not on auth0User: phone/password logins never
    // produce an Auth0 user, so on a hard refresh this effect never ran for
    // them - no fetch, no error, just a permanent "Loading..." in the code
    // card. PrivateRoute has already populated localStorage by the time this
    // mounts, for either login method.
    const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
    if (!storedUser.role && !auth0User) return;
    if (storedUser.role !== "admin") {
      navigate("/login");
      return;
    }
    fetchOrgCode();
    fetchUsers();
  }, [navigate, auth0User, getAccessTokenSilently]);

  const resetOrgCode = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Reset Organization Code",
      message:
        "This will invalidate the current code. All existing users will remain, but new invitations will require the new code.",
      type: "warning",
      onConfirm: async () => {
        try {
          const orgId = getOrgId();
          if (!orgId) return;
          const res = await API.post(`/organisation/${orgId}/reset-code`);
          setOrgCode(res.data.code);
          toast.success("Secret code has been reset!");
        } catch (err) {
          if (err.response?.status === 402) {
            toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
          } else {
            toast.error(err.response?.data?.error || "Failed to reset code");
          }
          console.error(err);
        }
        setConfirmModal({ isOpen: false });
      },
      confirmText: "Reset Code",
      cancelText: "Cancel",
    });
  };

  // The stored user comes from two different endpoints: /auth/login returns
  // it with `organization` POPULATED (an object), /auth/me returns it as a
  // bare id. Interpolating the object form produced
  // `/organisation/[object Object]`, which fails - and the failure was
  // silent, so the card sat on "Loading..." and looked like the code had
  // expired, when hitting Reset was the only thing that ever filled it in.
  const getOrgId = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const org = user.organization;
    return typeof org === "object" && org !== null ? org._id : org;
  };

  const fetchOrgCode = async () => {
    const orgId = getOrgId();
    if (!orgId) {
      setOrgCodeError("No organization on this account");
      return;
    }
    try {
      setOrgCodeError("");
      const res = await API.get(`/organisation/${orgId}`);
      setOrgCode(res.data.code);
    } catch (err) {
      console.error("Failed to fetch organization code", err);
      setOrgCode("");
      setOrgCodeError(
        err.response?.data?.error || "Couldn't load the code"
      );
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const [usersRes, invitesRes] = await Promise.all([
        API.get("/auth/all-user-admin"),
        API.get("/auth/invites"),
      ]);
      setUsers(usersRes.data.allUsers);
      setInvites(invitesRes.data.invites);
    } catch (err) {
      toast.error("Failed to fetch users or invites");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      const formattedPermissions = Object.entries(form.permissions)
        .filter(([_, perm]) => perm !== "no")
        .map(([name, permission]) => ({ name, permission }));

      const response = await API.post("/auth/invite", {
        email: form.email,
        permissions: formattedPermissions,
      });

      setForm({ email: "", permissions: {} });
      fetchUsers();
      setFormVisible(false);
      // A failed invite email is not a failed invite - the record is still
      // created and the person can join with the org code - but it must not
      // be reported as a plain success, which is how a silently dropped
      // email used to look.
      if (response.data.emailSent === false) {
        toast.error(
          response.data.message ||
            "Invite created, but the email could not be sent."
        );
      } else {
        toast.success(response.data.message || "User invited successfully");
      }
    } catch (err) {
      if (err.response?.status === 402) {
        const { paymentDetails, message } = err.response.data;
        setConfirmModal({
          isOpen: true,
          title: "Additional Seat Required",
          message: `${message} Proceed with payment?`,
          type: "default",
          onConfirm: () =>
            handleSeatPayment(paymentDetails, form.email, form.permissions),
          confirmText: "Proceed to Payment",
          cancelText: "Cancel",
        });
      } else {
        console.log(err)
        toast.error(err.response?.data?.message || "Failed to send invite");
      }
      console.error(err);
    }
  };

  const handleSeatPayment = (paymentDetails, email, permissions) => {
    if (!razorpayLoaded) {
      toast.error("Payment system not loaded. Please try again.");
      setConfirmModal({ isOpen: false });
      return;
    }

    setPaymentProcessing(true);
    setConfirmModal({ isOpen: false });

    const checkoutOptions = {
      ...paymentDetails,
      handler: async function () {
        toast.success("Payment received! Sending invitation...");
        // The webhook settles the seat purchase and finalizes the invite
        // (sends the email, clears pendingPayment) — wait until it's done.
        try {
          const result = await waitForSettlement({
            fetchLatest: async () => (await API.get("/auth/invites")).data.invites,
            isSettled: (invites) =>
              !!invites && !invites.some((inv) => inv.email === email && inv.pendingPayment),
            intervalMs: 3000,
            timeoutMs: 30000,
          });
          if (result.settled) {
            toast.success("Invitation sent!");
            setForm({ email: "", permissions: {} });
            setFormVisible(false);
          } else {
            toast("Payment confirmed. Invitation will be sent shortly — refresh if it doesn't appear.", { icon: "⏳" });
          }
          fetchUsers();
          fetchSeatStatus(); // seat count just changed — refresh the shared context copy
        } finally {
          setPaymentProcessing(false);
        }
      },
      modal: {
        ondismiss: function () {
          setPaymentProcessing(false);
          toast.error("Payment cancelled. Invitation not sent.");
        },
      },
    };

    openCheckout(checkoutOptions);
  };

  const deleteUser = async (id) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete User",
      message:
        "Are you sure you want to delete this user? This action cannot be undone.",
      type: "danger",
      onConfirm: async () => {
        try {
          await API.delete(`/auth/delete/${id}`);
          toast.success("User deleted successfully");
          fetchUsers();
        } catch (err) {
          if (err.response?.status === 402) {
            toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
          } else {
            toast.error(err.response?.data?.error || "Failed to delete user");
          }
          console.error(err);
        }
        setConfirmModal({ isOpen: false });
      },
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  };

  const revokeInvite = async (id) => {
    setConfirmModal({
      isOpen: true,
      title: "Revoke Invitation",
      message: "Are you sure you want to revoke this invitation?",
      type: "warning",
      onConfirm: async () => {
        try {
          await API.delete(`/auth/invites/${id}`);
          toast.success("Invitation revoked successfully");
          fetchUsers();
        } catch (err) {
          if (err.response?.status === 402) {
            toast.error(err.response?.data?.message || "An active subscription is required to make changes.");
          } else {
            toast.error(err.response?.data?.error || "Failed to revoke invite");
          }
          console.error(err);
        }
        setConfirmModal({ isOpen: false });
      },
      confirmText: "Revoke",
      cancelText: "Cancel",
    });
  };

  const renderSeatInfo = () => {
    if (!subscription?.subscription) return null;
    // Wait for real data instead of flashing a misleading "0 of 1" while
    // seatStatus hasn't loaded yet and the users list (this function's
    // fallback source) is still its initial empty array.
    if (!seatStatus && (loading || users.length === 0)) return null;

    // Admin seats (always exactly 1, the org creator) and staff seats
    // (everyone invited or joined via code) are tracked separately —
    // falls back to the combined legacy fields only if seatStatus hasn't
    // loaded yet.
    const hasSplit = seatStatus?.includedSeats !== undefined && seatStatus?.totalStaffSeats !== undefined;
    const adminLimit = hasSplit ? seatStatus.includedSeats : 1;
    const adminUsed = hasSplit ? seatStatus.occupiedAdminSeats : users.filter((u) => u.role === "admin").length;
    const staffLimit = hasSplit ? seatStatus.totalStaffSeats : (seatStatus?.totalSeats ?? subscription.subscription.userCount);
    const staffUsed = hasSplit
      ? seatStatus.occupiedStaffSeats
      : (seatStatus?.occupiedSeats ?? (users.length + invites.length));

    const renderBar = (label, used, limit) => {
      const isAtLimit = used >= limit;
      const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
      return (
        <div className="flex-1 min-w-[120px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-primary-700">
              {label}
              {isAtLimit && (
                <span className="text-danger-600 ml-1">· at limit</span>
              )}
            </span>
            <span className="text-sm font-bold text-primary-700 tabular-nums">
              {used}/{limit}
            </span>
          </div>
          <div className="mt-1 bg-neutral-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                percentage >= 90 ? "bg-danger-500" : "bg-primary-500"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      );
    };

    const pct = (used, limit) => (limit > 0 ? (used / limit) * 100 : 0);
    const adminPct = pct(adminUsed, adminLimit);
    const staffPct = pct(staffUsed, staffLimit);
    const nearCapacity = adminPct >= 90 || staffPct >= 90;

    return (
      <div className="bg-primary-100 border border-primary-300 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <TeamIcon className="w-4 h-4 text-primary-600" />
          <p className="text-xs font-bold text-primary-700">Seat Usage</p>
          {nearCapacity && (
            <button
              onClick={() => navigate("/settings/subscription")}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 bg-[#0085FF] hover:bg-[#0072db] text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <Crown className="w-3.5 h-3.5" />
              Upgrade Plan
            </button>
          )}
        </div>
        <div className="space-y-2.5">
          {renderBar("Admin", adminUsed, adminLimit)}
          {renderBar("Staff", staffUsed, staffLimit)}
        </div>
      </div>
    );
  };

  // The Quick Preset dropdown is a shortcut for setting every resource to
  // the same permission — but it also needs to REFLECT the actual current
  // state when the modal (re)opens, or it always shows "Custom" even right
  // after saving a preset, making it look like the save didn't take even
  // though the per-resource rows below are correct.
  const derivePreset = (perms) => {
    const values = resources.map((res) => perms[res] || "no");
    if (values.every((v) => v === "readonly")) return "view-only";
    if (values.every((v) => v === "read-write")) return "full-access";
    if (values.every((v) => v === "own-only")) return "own-only";
    return "";
  };

  const handleInvitePresetChange = (e) => {
    const value = e.target.value;
    let newPerms = {};
    if (value === "view-only") {
      resources.forEach((res) => (newPerms[res] = "readonly"));
    } else if (value === "full-access") {
      resources.forEach((res) => (newPerms[res] = "read-write"));
    } else if (value === "own-only") {
      resources.forEach((res) => (newPerms[res] = "own-only"));
    }
    setForm({ ...form, permissions: newPerms });
  };

  const handleModalPresetChange = (e) => {
    const value = e.target.value;
    let newPerms = {};
    if (value === "view-only") {
      resources.forEach((res) => (newPerms[res] = "readonly"));
    } else if (value === "full-access") {
      resources.forEach((res) => (newPerms[res] = "read-write"));
    } else if (value === "own-only") {
      resources.forEach((res) => (newPerms[res] = "own-only"));
    }
    setPermissions(newPerms);
  };

  const getPermissionBadge = (permission) => {
    switch (permission) {
      case "read-write":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-100 text-success-600 rounded-md text-xs font-semibold">
            <EditIcon className="w-3 h-3" />
            Edit
          </span>
        );
      case "readonly":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-md text-xs font-semibold">
            <EyeIcon className="w-3 h-3" />
            View
          </span>
        );
      case "own-only":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-100 text-warning-600 rounded-md text-xs font-semibold">
            <User className="w-3 h-3" />
            Own Only
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded-md text-xs font-semibold">
            <EyeOff className="w-3 h-3" />
            None
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 -mt-10 lg:-mt-12">
      <AppToaster />
      <div className="flex flex-col gap-6">
        {/* TOP ROW: Organization Code / Seat Usage / Pending Invitations */}
        <div className="grid grid-cols-1 md:grid-cols-[0.8fr_1.2fr_1fr] gap-4 mt-4">
          {/* Organization Code */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Key className="w-4 h-4 text-warning-600" />
              <p className="text-xs font-bold text-neutral-900">Organization Code</p>
            </div>
            {orgCode ? (
              <span className="block font-mono text-xl font-bold text-neutral-900 break-all">
                {orgCode}
              </span>
            ) : orgCodeError ? (
              <span className="flex items-center justify-center gap-2 text-xs font-medium text-danger-600">
                {orgCodeError}
                <button
                  onClick={fetchOrgCode}
                  className="text-primary-600 font-semibold hover:underline"
                >
                  Retry
                </button>
              </span>
            ) : (
              <span className="block font-mono text-xl font-bold text-neutral-300">
                Loading...
              </span>
            )}
            <p className="text-xs text-neutral-500 mt-1">
              Share this code with team members to join
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(orgCode);
                  toast.success("Code copied to clipboard!");
                }}
                disabled={!orgCode}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-300 text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
              <button
                onClick={resetOrgCode}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>
          </div>

          {/* Seat Usage */}
          {renderSeatInfo()}

          {/* Pending Invitations */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-warning-600" />
              <p className="text-xs font-bold text-neutral-900">
                Pending Invitations
              </p>
              <span className="ml-auto bg-warning-100 text-warning-600 px-2 py-0.5 rounded-full text-xs font-bold">
                {invites.length}
              </span>
            </div>
            {loading ? (
              <p className="text-xs text-neutral-300 py-2">Loading…</p>
            ) : invites.length === 0 ? (
              <p className="text-xs text-neutral-300 py-2">No pending invites.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {invites.map((invite) => (
                  <li
                    key={invite._id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="flex-1 min-w-0 truncate text-neutral-700">
                      {invite.email}
                    </span>
                    {invite.pendingPayment && (
                      <Loader2
                        className="w-3 h-3 text-warning-500 shrink-0"
                        aria-label="Awaiting seat payment"
                      />
                    )}
                    <button
                      onClick={() => revokeInvite(invite._id)}
                      className="shrink-0 text-danger-600 hover:bg-danger-100 rounded p-1 transition-colors"
                      title="Revoke"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* USERS LIST */}
        <div className="min-w-0 flex flex-col gap-4">

      {/* Header */}
      <div className="flex flex-row justify-between items-center gap-4 shrink-0">
        <p className="text-sm font-semibold text-neutral-700">
          Add your staff. Assign Roles. Multiply your business.
        </p>
        <button
          onClick={() => setFormVisible(!formVisible)}
          disabled={paymentProcessing}
          className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-lg cursor-pointer transition-all ${
            formVisible
              ? "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              : "bg-[#0085FF] hover:bg-[#0072db] text-white"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {paymentProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : formVisible ? (
            <>
              <X className="w-4 h-4" />
              Cancel
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Invite User
            </>
          )}
        </button>
      </div>

      {/* Existing Users */}
      <div className="min-h-0 flex-1 flex flex-col">
        {loading ? (
          <div className="px-6 py-12 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-neutral-500">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-12 text-center text-neutral-500">
            No users found.
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto border border-[#E1E4EA] rounded-xl">
            <table className="min-w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-[#F5F7FA]">
                <tr>
                  <th className="px-4 py-3 align-middle text-center text-sm font-bold text-[#525866] border-b border-r border-[#E1E4EA]">
                    Name
                  </th>
                  <th className="px-4 py-3 align-middle text-center text-sm font-bold text-[#525866] border-b border-r border-[#E1E4EA]">
                    Mobile
                  </th>
                  <th className="px-4 py-3 align-middle text-center text-sm font-bold text-[#525866] border-b border-r border-[#E1E4EA]">
                    Email
                  </th>
                  <th className="px-4 py-3 align-middle text-center text-sm font-bold text-[#525866] border-b border-r border-[#E1E4EA]">
                    Role
                  </th>
                  <th className="px-4 py-3 align-middle text-center text-sm font-bold text-[#525866] border-b border-[#E1E4EA]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E4EA]">
                {users.map((u) => {
                  const storedUser = JSON.parse(
                    localStorage.getItem("user") || "{}"
                  );
                  const isSelf = u._id === storedUser._id;
                  const roleLabel =
                    u.role.charAt(0).toUpperCase() + u.role.slice(1);
                  return (
                    <tr key={u._id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-4 border-r border-[#E1E4EA]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 text-xs font-bold shrink-0">
                            {u.name
                              .split(" ")
                              .map((p) => p.charAt(0))
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-neutral-900">
                            {u.name}
                            {isSelf && (
                              <span className="ml-2 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                                You
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-center text-neutral-700 border-r border-[#E1E4EA]">
                        {u.phone || "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-neutral-700 border-r border-[#E1E4EA]">
                        {u.email || "—"}
                      </td>
                      <td
                        className={`px-4 py-4 text-sm text-center border-r border-[#E1E4EA] ${
                          isSelf ? "text-neutral-300" : "text-neutral-700"
                        }`}
                      >
                        {roleLabel}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {/* The admin seat is the org creator: every permission
                            by definition, and can't be deleted - so no actions. */}
                        {u.role === "admin" ? (
                          <span className="text-xs text-neutral-300">—</span>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedUser(u);
                                setPermissions(getInitialPermissions(u));
                                setShowModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-primary-600 rounded-lg hover:bg-primary-100 text-sm font-semibold transition-colors"
                            >
                              <Shield className="w-4 h-4" />
                              Permissions
                            </button>
                            <button
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-danger-600 rounded-lg hover:bg-danger-100 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={isSelf}
                              onClick={() => !isSelf && deleteUser(u._id)}
                            >
                              <DeleteIcon className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </div>
        {/* END USERS LIST */}
      </div>

      {/* Invite User Modal */}
      {formVisible && (
        <div
          className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex justify-center items-center z-[100009] p-4"
          onClick={() => !paymentProcessing && setFormVisible(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border-2 border-neutral-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b-2 border-neutral-100 px-6 py-5 z-10">
              <div className="flex items-center gap-3">
                <div className="bg-primary-100 p-2.5 rounded-xl">
                  <UserPlus className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="flex-1 text-xl font-bold text-neutral-900">
                  Invite New User
                </h3>
                <button
                  type="button"
                  onClick={() => setFormVisible(false)}
                  className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-neutral-500" />
                </button>
              </div>
            </div>

            <form onSubmit={handleInvite}>
              <div className="p-6 space-y-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </label>
                  <input
                    className="w-full border-2 border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    type="email"
                    placeholder="colleague@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-3">
                    <Shield className="w-4 h-4" />
                    Permissions
                  </label>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-neutral-500 mb-2">
                      Quick Preset
                    </label>
                    <select
                      value={derivePreset(form.permissions)}
                      onChange={handleInvitePresetChange}
                      className="w-full border-2 border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="">Custom (Manual Selection)</option>
                      <option value="view-only">
                        👁️ View Only - Read-only access
                      </option>
                      <option value="own-only">
                        👤 Own Only - Only access what they own
                      </option>
                      <option value="full-access">
                        🔓 Full Access - Edit everything
                      </option>
                    </select>
                  </div>

                  <div className="bg-neutral-50 rounded-xl p-5 border border-neutral-200">
                    <div className="grid md:grid-cols-2 gap-4">
                      {resources.map((resource) => (
                        <div
                          key={resource}
                          className="flex justify-between items-center bg-white p-3 rounded-lg border border-neutral-200"
                        >
                          <span className="font-medium text-neutral-700">
                            {resource}
                          </span>
                          <select
                            value={form.permissions[resource] || "no"}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                permissions: {
                                  ...form.permissions,
                                  [resource]: e.target.value,
                                },
                              })
                            }
                            className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                          >
                            {permissionOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt === "no"
                                  ? "None"
                                  : opt === "readonly"
                                  ? "View"
                                  : opt === "own-only"
                                  ? "Own Only"
                                  : "Edit"}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-neutral-50 border-t-2 border-neutral-100 px-6 py-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormVisible(false)}
                  className="px-6 py-3 bg-neutral-100 text-neutral-700 font-semibold rounded-xl hover:bg-neutral-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentProcessing}
                  className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg"
                >
                  <Mail className="w-4 h-4" />
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showModal && selectedUser && (
        <>
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100009]"
            onClick={() => setShowModal(false)}
          />
          <div className="fixed dc-panel-card dc-panel-w z-[100010] bg-white shadow-2xl flex flex-col overflow-hidden font-inter">
            {/* Sticky header — matches the CompanyForm header spec */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white gap-1">
              <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
                Permissions — {selectedUser.name}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                title="Close"
                className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
                aria-label="Close"
              >
                <X className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6">
              <div>
                <label className="block text-[13px] font-medium text-[#161618] mb-2 tracking-[-0.05em]">
                  Quick Preset
                </label>
                <select
                  value={derivePreset(permissions)}
                  onChange={handleModalPresetChange}
                  className="w-full border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all bg-white"
                >
                  <option value="">Custom (Manual Selection)</option>
                  <option value="view-only">
                    👁️ View Only - Read-only access
                  </option>
                  <option value="own-only">
                    👤 Own Only - Only access what they own
                  </option>
                  <option value="full-access">
                    🔓 Full Access - Edit everything
                  </option>
                </select>
              </div>

              <div className="space-y-3">
                {resources.map((resource) => (
                  <div
                    key={resource}
                    className="flex justify-between items-center gap-3"
                  >
                    <span className="text-[13px] font-medium text-[#161618]">
                      {resource}
                    </span>
                    <select
                      value={permissions[resource] || "no"}
                      onChange={(e) =>
                        setPermissions((prev) => ({
                          ...prev,
                          [resource]: e.target.value,
                        }))
                      }
                      className="border border-[#1F2937]/10 rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all bg-white"
                    >
                      {permissionOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === "no"
                            ? "None"
                            : opt === "readonly"
                            ? "View Only"
                            : "Edit Access"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Sticky footer — compact, matching the note editor card */}
            <div className="flex-shrink-0 py-2.5 px-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-6 py-2 border border-gray-200 text-gray-700 rounded-[25px] text-sm font-bold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={savePermissions}
                className="px-6 py-2 bg-[#158FFF] text-white rounded-[25px] text-sm font-bold hover:opacity-90 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        type={confirmModal.type}
      />
    </div>
  );
}

export default UserManagement;
