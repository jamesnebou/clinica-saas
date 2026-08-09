"use client";

import Link from "next/link";
import { trackMarketingEvent } from "./conversion-tracker";

export function TrackedLink({ eventName, eventData, children, ...props }) {
  return <Link {...props} onClick={() => trackMarketingEvent(eventName, eventData)}>{children}</Link>;
}

export function TrackedAnchor({ eventName, eventData, children, ...props }) {
  return <a {...props} onClick={() => trackMarketingEvent(eventName, eventData)}>{children}</a>;
}
