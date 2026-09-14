export const productShowcaseTabs = [
  {
    "id": "visao-geral",
    "category": "operacao",
    "label": "Visão geral",
    "icon": "LayoutDashboard",
    "image": "/marketing/odontologia/sistema/visao-geral.png"
  },
  {
    "id": "inteligencia-bi",
    "category": "operacao",
    "label": "Inteligência / BI",
    "icon": "ChartNoAxesCombined",
    "image": "/marketing/odontologia/sistema/inteligencia-bi.png"
  },
  {
    "id": "agenda",
    "category": "operacao",
    "label": "Agenda",
    "icon": "CalendarDays",
    "image": "/marketing/odontologia/sistema/agenda.png"
  },
  {
    "id": "notificacoes",
    "category": "operacao",
    "label": "Notificações",
    "icon": "Bell",
    "image": "/marketing/odontologia/sistema/notificacoes.png"
  },
  {
    "id": "whatsapp",
    "category": "relacionamento",
    "label": "WhatsApp",
    "icon": "MessageCircle",
    "image": "/marketing/odontologia/sistema/whatsapp.png"
  },
  {
    "id": "clientes",
    "category": "relacionamento",
    "label": "Clientes",
    "icon": "Users",
    "image": "/marketing/odontologia/sistema/clientes.png"
  },
  {
    "id": "crm",
    "category": "relacionamento",
    "label": "CRM",
    "icon": "ContactRound",
    "image": "/marketing/odontologia/sistema/crm.png"
  },
  {
    "id": "automacoes",
    "category": "relacionamento",
    "label": "Automações",
    "icon": "Workflow",
    "image": "/marketing/odontologia/sistema/automacoes.png"
  },
  {
    "id": "profissionais",
    "category": "gestao",
    "label": "Profissionais",
    "icon": "Stethoscope",
    "image": "/marketing/odontologia/sistema/profissionais.png"
  },
  {
    "id": "procedimentos",
    "category": "gestao",
    "label": "Procedimentos",
    "icon": "Scissors",
    "image": "/marketing/odontologia/sistema/procedimentos.png"
  },
  {
    "id": "lojinha",
    "category": "administracao",
    "label": "Lojinha",
    "icon": "ShoppingBag",
    "image": "/marketing/odontologia/sistema/lojinha.png"
  },
  {
    "id": "pedidos",
    "category": "administracao",
    "label": "Pedidos",
    "icon": "Package",
    "image": "/marketing/odontologia/sistema/pedidos.png"
  },
  {
    "id": "usuarios",
    "category": "gestao",
    "label": "Usuários",
    "icon": "UserRoundCog",
    "image": "/marketing/odontologia/sistema/usuarios.png"
  },
  {
    "id": "configuracoes",
    "category": "administracao",
    "label": "Configurações",
    "icon": "Settings",
    "image": "/marketing/odontologia/sistema/configuracoes.png"
  },
  {
    "id": "financeiro",
    "category": "gestao",
    "label": "Financeiro",
    "icon": "Wallet",
    "image": "/marketing/odontologia/sistema/financeiro.png"
  },
  {
    "id": "assinatura",
    "category": "administracao",
    "label": "Assinatura",
    "icon": "CreditCard",
    "image": "/marketing/odontologia/sistema/assinatura.png"
  },
  {
    "id": "tutoriais",
    "category": "administracao",
    "label": "Tutoriais",
    "icon": "BookOpen",
    "image": "/marketing/odontologia/sistema/tutoriais.png"
  }
];

export const productShowcaseCategories = Object.freeze([
  { id: "operacao", label: "Operação" },
  { id: "relacionamento", label: "Relacionamento" },
  { id: "gestao", label: "Gestão" },
  { id: "administracao", label: "Administração" },
]);

export function productTabsForCategory(category) {
  return productShowcaseTabs.filter((tab) => tab.category === category);
}

export function nextProductTab(key, index, length) {
  if (key === "ArrowRight") return (index + 1) % length;
  if (key === "ArrowLeft") return (index + length - 1) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}
