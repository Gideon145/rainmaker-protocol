// ─── Shared domain types across the entire Rainmaker Protocol ────────────────

export type RunStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "budget_exhausted";

export type ProspectStatus =
  | "queued"
  | "enriching"
  | "ofac_scanning"
  | "ofac_blocked"
  | "generating_email"
  | "creating_checkout"
  | "outreach_sent"
  | "awaiting_payment"
  | "paid"
  | "delivered"
  | "failed"
  | "policy_rejected";

export interface Company {
  id: string;
  name: string;
  domain: string;
  industry: string;
  size: string;
  techStack: string[];
  location: string;
  description: string;
}

export interface Contact {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  linkedinUrl?: string;
  emailReputation?: "valid" | "risky" | "invalid" | "unknown";
}

export interface OFACResult {
  clean: boolean;
  matches: Array<{
    name: string;
    score: number;
    list: string;
    reason: string;
  }>;
}

export interface Prospect {
  id: string;
  runId: string;
  company: Company;
  contact: Contact | null;
  ofacResult: OFACResult | null;
  status: ProspectStatus;
  outreachEmail: string | null;
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  agentMailMessageId: string | null;
  paymentTxHash: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  runId: string;
  prospectId: string | null;
  timestamp: string;
  action: string;
  reasoning: string;
  cost: number; // USDC
  txHash: string | null;
  status: "success" | "warning" | "error" | "info";
}

export interface Run {
  id: string;
  skill: string;
  hourlyRate: number;
  status: RunStatus;
  prospects: Prospect[];
  auditLog: AuditEntry[];
  totalSpentUsdc: number;
  totalEarnedUsdc: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  agentInboxId: string | null;
  agentEmail: string | null;
}

// ─── SSE event shapes ──────────────────────────────────────────────────────

export type AgentEventType =
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "prospect_update"
  | "audit_entry"
  | "balance_update"
  | "payment_received"
  | "work_delivered"
  | "budget_exhausted"
  | "heartbeat";

export interface AgentEvent {
  type: AgentEventType;
  runId: string;
  payload: unknown;
  timestamp: string;
}

// ─── Provider interfaces ───────────────────────────────────────────────────

export interface SearchFilters {
  skill: string;
  minEmployees?: number;
  maxEmployees?: number;
  industries?: string[];
}

export interface CompanyProvider {
  searchCompanies(filters: SearchFilters): Promise<Company[]>;
}

export interface ContactProvider {
  enrichContact(company: Company): Promise<Contact | null>;
}

export interface ComplianceProvider {
  screenOFAC(entityName: string, countryCode?: string): Promise<OFACResult>;
}

export interface EmailProvider {
  findEmail(firstName: string, lastName: string, domain: string): Promise<string | null>;
  checkReputation(email: string): Promise<"valid" | "risky" | "invalid" | "unknown">;
}

export interface LLMProvider {
  generateOutreach(params: {
    skill: string;
    hourlyRate: number;
    company: Company;
    contact: Contact;
    checkoutUrl: string;
  }): Promise<{ subject: string; body: string }>;
  generateDeliverable(params: {
    skill: string;
    company: Company;
    contact: Contact;
  }): Promise<string>;
}

export interface MailProvider {
  createInbox(username: string): Promise<{ inboxId: string; email: string }>;
  sendEmail(params: {
    inboxId: string;
    to: string;
    subject: string;
    body: string;
  }): Promise<{ messageId: string }>;
  listMessages(inboxId: string): Promise<Array<{
    id: string;
    from: string;
    subject: string;
    body: string;
    receivedAt: string;
    inReplyTo?: string;
  }>>;
  reply(params: {
    inboxId: string;
    messageId: string;
    body: string;
  }): Promise<void>;
}

// ─── Locus API response types ──────────────────────────────────────────────

export interface LocusResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CheckoutSession {
  id: string;
  amount: string;
  description: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
  checkoutUrl: string;
  webhookUrl?: string;
  expiresAt: string;
  paymentTxHash?: string;
  paidAt?: string;
  metadata?: Record<string, string>;
}

export interface WalletBalance {
  balance: string;
  address: string;
}

export interface TransactionRecord {
  id: string;
  type: string;
  amount: string;
  asset: string;
  status: string;
  txHash: string | null;
  createdAt: string;
  description?: string;
}
