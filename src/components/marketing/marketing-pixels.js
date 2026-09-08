"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { CONSENT_EVENT, getTrackingConsent, googleConsentState } from "@/lib/tracking/consent";

export function MarketingPixels() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const metaId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const [consent, setConsent] = useState(null);

  useEffect(() => {
    const update = (event) => setConsent(event?.detail || getTrackingConsent());
    update();
    window.addEventListener(CONSENT_EVENT, update);
    return () => window.removeEventListener(CONSENT_EVENT, update);
  }, []);

  useEffect(() => {
    if (consent && typeof window.gtag === "function") window.gtag("consent", "update", googleConsentState(consent));
  }, [consent]);

  const googleTagId = gaId || googleAdsId;
  const loadGoogle = Boolean(consent?.analytics || consent?.marketing);

  return (
    <>
      <script id="nexawi-consent-default" dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=window.gtag||gtag;gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});` }} />
      {googleTagId && loadGoogle ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`} strategy="afterInteractive" />
          <Script id="nexawi-google-tags" strategy="afterInteractive">
            {`gtag('js',new Date());${gaId ? `gtag('config',${JSON.stringify(gaId)},{send_page_view:false});` : ""}${googleAdsId ? `gtag('config',${JSON.stringify(googleAdsId)});` : ""}`}
          </Script>
        </>
      ) : null}
      {metaId && consent?.marketing ? (
        <Script id="nexawi-meta-pixel" strategy="afterInteractive">
          {`!function(){if(!window.fbq){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js')}if(window.__nexawiMetaPixelId!==${JSON.stringify(metaId)}){fbq('init',${JSON.stringify(metaId)});window.__nexawiMetaPixelId=${JSON.stringify(metaId)}}}();`}
        </Script>
      ) : null}
    </>
  );
}
