export interface EcosystemApp {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  href: string;
  isCurrent?: boolean;
  status: "ACTIVE" | "MAINTENANCE" | "UPCOMING";
}

export const ECOSYSTEM_APPS: EcosystemApp[] = [
  {
    id: "number-sale",
    name: "Number Sale Management",
    category: "Telecom",
    description: "Inventory, numbers, orders, and wallets",
    icon: "📱",
    href: "/portal",
    isCurrent: true,
    status: "ACTIVE",
  },
  {
    id: "sms-mgmt",
    name: "SMS Management",
    category: "Communication",
    description: "Bulk SMS, DLR, sender IDs & routing",
    icon: "📩",
    href: "http://localhost:4001",
    status: "ACTIVE",
  },
  {
    id: "pbx-mgmt",
    name: "PBX Management",
    category: "Voice",
    description: "Cloud PBX extensions, IVR & call center",
    icon: "☎️",
    href: "http://localhost:4002",
    status: "ACTIVE",
  },
  {
    id: "edumax",
    name: "edumaX",
    category: "Education",
    description: "Institutional management & learning portal",
    icon: "🏫",
    href: "http://localhost:4003",
    status: "ACTIVE",
  },
  {
    id: "crm",
    name: "CRM System",
    category: "Customer Relations",
    description: "Leads, pipeline, deals & contact management",
    icon: "👥",
    href: "http://localhost:4004",
    status: "ACTIVE",
  },
  {
    id: "billing",
    name: "Billing & Payment",
    category: "Finance",
    description: "Invoicing, automated collections & wallets",
    icon: "💰",
    href: "http://localhost:4005",
    status: "ACTIVE",
  },
  {
    id: "reports",
    name: "Analytics & Reports",
    category: "Business Intelligence",
    description: "Aggregated reports, profit margins & audit",
    icon: "📊",
    href: "http://localhost:4006",
    status: "ACTIVE",
  },
  {
    id: "identity",
    name: "Central Identity",
    category: "Identity & SSO",
    description: "Master user authentication & account security",
    icon: "🔐",
    href: "http://138.252.124.48:8080",
    status: "ACTIVE",
  },
  {
    id: "other-mgmt",
    name: "Other Management Systems",
    category: "Operations",
    description: "Enterprise modules & operations tooling",
    icon: "⚙️",
    href: "#",
    status: "UPCOMING",
  },
];
