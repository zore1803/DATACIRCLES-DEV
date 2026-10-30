import React, { useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import emailLogo from "../../assets/email-logo.png";
import { createPortal } from "react-dom";
import { MessageSquare, Copy } from "lucide-react";
import toast from "react-hot-toast";

// Reusable "Share via WhatsApp/Email/SMS" flyout, generalized from
// Accounting.jsx's inline share dropdown (row-actions menu -> Share ->
// this) so Purchase/Purchase Order can reuse the exact same behavior:
// WhatsApp opens wa.me client-side, Email/SMS hand off to the caller's
// compose modal (prefilled), Copy Link copies the public /view/:type/:id
// link. Saved org templates ({customerName}/{docType}/{number}/{amount}/
// {link}/{company} placeholders) are used when present, same as Accounting;
// falls back to a sensible built-in message otherwise.
export default function ShareFlyoutMenu({
  x,
  y,
  onClose,
  link,
  docTypeLabel,
  docNumber,
  recipientName,
  recipientEmail,
  recipientPhone,
  amountLabel,
  companyName,
  waTemplates = [],
  emailTemplates = [],
  smsTemplates = [],
  onOpenEmail,
  onOpenSms,
}) {
  const [channel, setChannel] = useState(null);

  const fillTpl = (tpl) =>
    (tpl || "")
      .replace(/{customerName}/g, recipientName || "")
      .replace(/{docType}/g, docTypeLabel)
      .replace(/{number}/g, docNumber || "")
      .replace(/{amount}/g, amountLabel || "")
      .replace(/{link}/g, link)
      .replace(/{company}/g, companyName || "");

  const buildWaMsg = (tpl) => {
    // line1/line2 can carry the same {customerName}/{docType}/… placeholders
    // as the email/SMS templates. Settings' template editor lets the user
    // drop chips into these lines, so we resolve them here on the way out,
    // same as fillTpl does for SMS/email above.
    const l1 = tpl?.line1
      ? fillTpl(tpl.line1)
      : `Your ${docTypeLabel} from ${companyName || "us"} is ready.`;
    const l2 = tpl?.line2 ? fillTpl(tpl.line2) : "";
    return `Hello ${recipientName || ""},\n\n${l1}\n\nDocument: ${docNumber || "n/a"}\nTotal: ${amountLabel || "n/a"}\nView/download: ${link}${l2 ? `\n\n${l2}` : ""}\n\nRegards,\n${companyName || "the sender"}`;
  };
  const buildSmsMsg = (tpl) =>
    tpl?.body
      ? fillTpl(tpl.body)
      : `${companyName || "We"}: your ${docTypeLabel}${docNumber ? ` ${docNumber}` : ""}${amountLabel ? ` for ${amountLabel}` : ""} is ready. View/download: ${link}`;
  const buildEmailSubject = (tpl) =>
    tpl?.subject
      ? fillTpl(tpl.subject)
      : `${docTypeLabel} ${docNumber || ""}${companyName ? ` from ${companyName}` : ""}`.trim();
  const buildEmailBody = (tpl) =>
    tpl?.body
      ? fillTpl(tpl.body)
      : `Dear ${recipientName || "Sir/Madam"},\n\nPlease find attached your ${docTypeLabel}${docNumber ? ` ${docNumber}` : ""}.\n\nYou can also view or download it online: ${link}\n\nRegards,\n${companyName || "the sender"}`;

  const channels = {
    whatsapp: {
      list: waTemplates,
      send: (tpl) => {
        window.open(`https://wa.me/?text=${encodeURIComponent(buildWaMsg(tpl))}`, "_blank");
        onClose();
      },
    },
    email: {
      list: emailTemplates,
      send: (tpl) => {
        onOpenEmail?.({
          to: recipientEmail || "",
          subject: buildEmailSubject(tpl),
          body: buildEmailBody(tpl),
        });
        onClose();
      },
    },
    sms: {
      list: smsTemplates,
      send: (tpl) => {
        onOpenSms?.({
          to: recipientPhone || "",
          body: buildSmsMsg(tpl),
        });
        onClose();
      },
    },
  };

  // 0 or 1 saved template -> send straight away; 2+ -> let the user pick.
  const openChannel = (name) => {
    const { list, send } = channels[name];
    if (list.length <= 1) send(list[0] || null);
    else setChannel(name);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Link copied");
    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100009]" onClick={onClose} />
      <div
        className="fixed z-[100010] bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-52"
        style={{ top: y, left: x }}
      >
        {channel ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setChannel(null);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-600 border-b border-gray-100"
            >
              ← Back
            </button>
            {channels[channel].list.map((tpl) => (
              <button
                key={tpl.id}
                onClick={(e) => {
                  e.stopPropagation();
                  channels[channel].send(tpl);
                }}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="truncate">{tpl.name}</span>
                {tpl.isDefault && (
                  <span className="text-[10px] text-green-600 font-semibold flex-shrink-0">Default</span>
                )}
              </button>
            ))}
          </>
        ) : (
          [
            { label: "WhatsApp", icon: <FaWhatsapp className="w-4 h-4 text-[#25D366]" />, onClick: () => openChannel("whatsapp") },
            { label: "Email", icon: <img src={emailLogo} alt="" className="w-4 h-4 object-contain scale-[1.35]" />, onClick: () => openChannel("email") },
            { label: "SMS", icon: <MessageSquare className="w-4 h-4 text-purple-600" />, onClick: () => openChannel("sms") },
            { label: "Copy Link", icon: <Copy className="w-4 h-4 text-gray-500" />, onClick: copyLink },
          ].map(({ label, icon, onClick }) => (
            <button
              key={label}
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {icon}
              {label}
            </button>
          ))
        )}
      </div>
    </>,
    document.body
  );
}
