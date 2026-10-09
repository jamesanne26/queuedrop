"use client";

import QRCode from "qrcode";
import { useState } from "react";

export function CustomerQueueQrView({ queueNumber }: { queueNumber: string }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function showQr() {
    setOpen(true);
    setImage(null);
    setFailed(false);
    try {
      const privateQueueUrl = new URL(window.location.pathname, window.location.origin).toString();
      setImage(await QRCode.toDataURL(privateQueueUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 280,
        color: { dark: "#12211a", light: "#ffffff" },
      }));
    } catch {
      setFailed(true);
    }
  }

  return <>
    <button className="button button-secondary customer-qr-trigger" type="button" onClick={() => void showQr()}>
      View your queue QR code
    </button>
    {open ? <div className="customer-qr-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="customer-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-qr-title">
        <button className="customer-qr-close" type="button" onClick={() => setOpen(false)} aria-label="Close QR code">×</button>
        <p className="eyebrow">Queue {queueNumber}</p>
        <h2 id="customer-qr-title">Your queue QR code</h2>
        <p>Scan this code to reopen your private live queue status.</p>
        {image ? <img className="customer-qr-image" src={image} alt={`QR code for queue ${queueNumber}`} /> : null}
        {failed ? <p className="customer-qr-error" role="alert">Could not create the QR code. Please try again.</p> : null}
        {!image && !failed ? <p aria-live="polite">Creating QR code…</p> : null}
        <button className="button button-primary" type="button" onClick={() => setOpen(false)}>Close</button>
      </section>
    </div> : null}
  </>;
}
