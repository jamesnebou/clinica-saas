import "server-only";
import { MetaGraphClient } from "./client";
import { buildTemplateMessage } from "./templates";
export class WhatsAppProvider { async sendTemplate() { throw new Error("sendTemplate não implementado."); } }
export class MetaCloudProvider extends WhatsAppProvider {
  constructor({ client = new MetaGraphClient() } = {}) { super(); this.client = client; }
  sendTemplate({ connection, template, to, variables, buttonUrlSuffix, quickReplyPayload }) { return this.client.sendTemplate(connection.phone_number_id, buildTemplateMessage({ to, template, variables, buttonUrlSuffix, quickReplyPayload })); }
  async healthCheck(connection) {
    const [phone, subscribed] = await Promise.all([this.client.getPhoneNumber(connection.phone_number_id), this.client.listSubscribedApps(connection.waba_id)]);
    const apps = subscribed?.data || []; return { phone, subscribedApps: apps, webhookActive: apps.some((item) => String(item.id) === String(process.env.META_APP_ID || "")) };
  }
  async syncTemplates(connection) {
    const templates = []; let after = null;
    do { const page = await this.client.listTemplates(connection.waba_id, after); templates.push(...(page?.data || [])); after = page?.paging?.next ? page?.paging?.cursors?.after : null; } while (after);
    return templates;
  }
}
