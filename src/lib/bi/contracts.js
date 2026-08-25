/** Future AI integrations must consume authorized aggregates, never unrestricted clinical data. */
export class BIQueryService {
  async getRevenueSummary() { throw new Error("Not implemented"); }
  async getAgendaSummary() { throw new Error("Not implemented"); }
  async getCrmSummary() { throw new Error("Not implemented"); }
  async getRetentionSummary() { throw new Error("Not implemented"); }
  async getProfessionalPerformance() { throw new Error("Not implemented"); }
  async getProcedurePerformance() { throw new Error("Not implemented"); }
}
export class BIInsightService { async getInsights() { throw new Error("Not implemented"); } }
export class AIManagementAssistant { async answer() { throw new Error("AI management assistant is intentionally not enabled."); } }
