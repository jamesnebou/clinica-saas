"use client";

import { ConversionTracker } from "./conversion-tracker";
import { MarketingPixels } from "./marketing-pixels";
import { ConsentManager } from "./consent-manager";

export function MarketingTracking(props) {
  return (
    <>
      <MarketingPixels />
      <ConversionTracker {...props} />
      <ConsentManager />
    </>
  );
}
