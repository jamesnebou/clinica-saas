"use client";

import { ConversionTracker } from "./conversion-tracker";
import { MarketingPixels } from "./marketing-pixels";

export function MarketingTracking(props) {
  return (
    <>
      <MarketingPixels />
      <ConversionTracker {...props} />
    </>
  );
}
