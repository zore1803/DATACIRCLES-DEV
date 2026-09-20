import DownloadIcon from "../common/DownloadIcon";
import React, { useEffect, useRef, useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import QRCode from "qrcode";
import toast from "react-hot-toast";

const PUBLIC_BASE = window.location.origin.replace(/\/$/, "");

// `bare` drops the default bordered-box look for the variant that sits absolutely inside an
// input's own padding (see the Public Link field below) — there it's an icon-only affordance on
// top of the field, not a separate button beside it.
function CopyButton({ text, className = "", bare = false }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied");
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`shrink-0 ${bare ? "p-1 rounded hover:bg-gray-200" : "px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"} ${className}`}
    >
      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
    </button>
  );
}

function QrCodePanel({ url }) {
  const canvasRef = useRef(null);
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 160, margin: 1 }, (err) => {
      if (!err) setDataUrl(canvasRef.current.toDataURL("image/png"));
    });
  }, [url]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "form-qr-code.png";
    a.click();
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <canvas ref={canvasRef} className="border border-gray-200 rounded-lg" />
      <button
        onClick={download}
        disabled={!dataUrl}
        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        <DownloadIcon className="w-4 h-4" />
        Download QR
      </button>
    </div>
  );
}

export default function PublicLinkCard({ publicSlug, published, title }) {
  if (!published || !publicSlug) {
    return <p className="text-sm text-gray-400">Publish this form to get a shareable link.</p>;
  }

  const url = `${PUBLIC_BASE}/f/${publicSlug}`;
  const iframeSnippet = `<iframe src="${url}" width="100%" height="800" frameborder="0"></iframe>`;
  // No JS-embed script exists on the backend today (no /embed.js route) — an iframe is the only
  // embed method that actually works. A "Source URL" tab was removed here: it showed the exact
  // same string as the Public Link field above, with no distinct purpose.

  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const share = async () => {
    try {
      await navigator.share({ title: title || "Form", url });
    } catch {
      // user cancelled the native share sheet — not an error worth surfacing
    }
  };

  return (
    // Two sections: the QR code stands alone on the left (it's the one thing here you'd actually
    // scan, so it doesn't need to compete for width with the text fields), and the link + embed
    // snippet share the right column since both are "copy this text somewhere else" actions.
    <div className="flex flex-col md:flex-row md:items-start gap-6">
      {/* items-start above: without it, flex's default stretch made the right column match the QR
          column's full height (QR image + Download button), leaving dead space below its own
          shorter content instead of the two columns just sitting at their natural heights. */}
      <div className="shrink-0">
        <label className="block text-xs font-medium text-gray-500 mb-1">QR Code</label>
        <QrCodePanel url={url} />
      </div>

      <div className="flex-1 min-w-0 max-w-xl flex flex-col gap-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Public Link</label>
          <div className="flex gap-2">
            {/* Copy sits inside the field itself (absolute, over the input's own padding) rather
                than as a separate button after Open — it's acting on the field's content, not a
                sibling action next to it. */}
            <div className="relative flex-1 min-w-0">
              <input readOnly value={url} className="w-full px-4 py-2 pr-9 border border-gray-200 rounded-full text-sm bg-gray-50 text-gray-600 truncate" />
              <CopyButton text={url} bare className="absolute right-1.5 top-1/2 -translate-y-1/2" />
            </div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 border border-gray-200 rounded-full hover:bg-gray-50 text-xs font-medium text-gray-600 shrink-0 flex items-center"
            >
              Open
            </a>
            {canShare && (
              <button onClick={share} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0" title="Share">
                <Share2 className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Embed (iframe)</label>
          {/* Same treatment as Public Link above: copy sits inside the field's own padding
              instead of as a separate button beside it. */}
          <div className="relative">
            <textarea
              readOnly
              value={iframeSnippet}
              rows={2}
              className="w-full px-3 py-2 pr-9 border border-gray-200 rounded-lg text-xs font-mono bg-gray-50 text-gray-600 resize-none overflow-x-auto"
            />
            <CopyButton text={iframeSnippet} bare className="absolute right-1.5 top-1.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
