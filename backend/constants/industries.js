// constants/industries.js
//
// The built-in industry list every organization gets (seeded into the Industry
// collection by controllers/industryController.js). Each entry may carry
// `subIndustries`: optional suggestions shown in the company form's
// "Sub-industry" field, which is never required.
//
// Order is the order shown in the dropdown: the Indian view first (grouped the
// way the National Industrial Classification divides the economy, plus the
// sectors Indian businesses most often identify with), then the international
// sectors. The original ten names are kept exactly, because existing companies
// store the industry as plain text.

const INDIAN_INDUSTRIES = [
  {
    name: "Information Technology & Services",
    subIndustries: ["IT Services & Consulting", "Software Products & SaaS", "BPO / KPO & Shared Services", "Cybersecurity", "Data Centres & Cloud", "Electronic Manufacturing Services"],
  },
  {
    name: "Finance & Banking",
    subIndustries: ["Public Sector Banks", "Private Banks", "NBFCs", "Microfinance", "Fintech & Payments", "Stock Broking & Wealth Management", "Asset Management & Mutual Funds"],
  },
  {
    name: "Insurance",
    subIndustries: ["Life Insurance", "General Insurance", "Health Insurance", "Reinsurance", "Insurance Brokers & Agents"],
  },
  {
    name: "Healthcare & Pharmaceuticals",
    subIndustries: ["Hospitals & Clinics", "Diagnostics & Pathology", "Pharmaceutical Manufacturing", "Medical Devices", "Biotechnology", "Ayurveda & Traditional Medicine", "Telemedicine & Health-Tech"],
  },
  {
    name: "Education & EdTech",
    subIndustries: ["Schools (K-12)", "Colleges & Universities", "Coaching & Test Prep", "Vocational & Skill Training", "EdTech Platforms", "Publishing & Learning Content"],
  },
  {
    name: "Retail & E-Commerce",
    subIndustries: ["Online Marketplaces", "Fashion & Apparel Retail", "Grocery & Supermarkets", "Consumer Electronics Retail", "Wholesale & Distribution", "Direct-to-Consumer Brands"],
  },
  {
    name: "Manufacturing",
    subIndustries: ["Machinery & Equipment", "Electrical & Electronics", "Plastics & Rubber", "Paper & Packaging", "Furniture & Wood Products", "Industrial Tools & Fabrication"],
  },
  {
    name: "Real Estate",
    subIndustries: ["Residential Development", "Commercial & Office Space", "Real Estate Brokerage", "Property Management", "Co-working & Flex Space"],
  },
  {
    name: "Marketing & Advertising",
    subIndustries: ["Digital Marketing", "Advertising Agencies", "Public Relations", "Market Research", "Media Planning & Buying", "Influencer & Content Marketing"],
  },
  {
    name: "Travel & Hospitality",
    subIndustries: ["Hotels & Resorts", "Restaurants & Cafes", "Travel Agencies & Tour Operators", "Airlines & Aviation Services", "Event & Wedding Management", "Online Travel Platforms"],
  },
  {
    name: "Nonprofit / Government / Public Sector",
    subIndustries: ["NGOs & Charitable Trusts", "Central / State Government Bodies", "Public Sector Undertakings (PSU)", "Municipal & Local Bodies", "Foundations & CSR Programs", "Religious & Community Organisations"],
  },
  {
    name: "Agriculture, Forestry & Fishing",
    subIndustries: ["Crop Farming", "Horticulture & Plantations", "Dairy & Animal Husbandry", "Poultry", "Fisheries & Aquaculture", "Forestry & Timber", "Seeds, Fertilizers & Agri-Inputs", "Agri-Tech"],
  },
  {
    name: "Food Processing & Beverages",
    subIndustries: ["Packaged Foods", "Dairy Products", "Edible Oils", "Spices & Condiments", "Rice, Flour & Grain Milling", "Beverages & Bottling", "Bakery & Confectionery", "Meat, Fish & Frozen Foods"],
  },
  {
    name: "Textiles & Apparel",
    subIndustries: ["Spinning & Weaving", "Garment Manufacturing", "Handloom & Handicraft Textiles", "Technical Textiles", "Home Textiles", "Knitwear & Hosiery"],
  },
  {
    name: "Leather & Footwear",
    subIndustries: ["Tanning & Leather Goods", "Footwear Manufacturing", "Bags & Accessories"],
  },
  {
    name: "Gems, Jewellery & Handicrafts",
    subIndustries: ["Diamond Cutting & Polishing", "Gold & Silver Jewellery", "Artisan Handicrafts", "Watches & Accessories"],
  },
  {
    name: "Automobiles & Auto Components",
    subIndustries: ["Passenger Vehicles", "Two & Three Wheelers", "Commercial Vehicles", "Auto Components & Spares", "Electric Vehicles & Charging", "Auto Dealerships & Service"],
  },
  {
    name: "Chemicals, Fertilizers & Petrochemicals",
    subIndustries: ["Specialty Chemicals", "Agrochemicals & Pesticides", "Fertilizers", "Paints & Coatings", "Petrochemicals & Plastics Raw Material", "Dyes & Pigments"],
  },
  {
    name: "Metals, Steel & Mining",
    subIndustries: ["Iron & Steel", "Non-Ferrous Metals", "Coal Mining", "Minerals & Quarrying", "Foundries & Castings", "Metal Fabrication"],
  },
  {
    name: "Construction & Infrastructure",
    subIndustries: ["Civil & Infrastructure Contracting", "Roads & Highways", "Housing Construction", "Cement", "Building Materials", "Architecture & Interior Design", "Engineering & Project Consulting"],
  },
  {
    name: "Energy, Power & Utilities",
    subIndustries: ["Power Generation", "Power Transmission & Distribution", "Solar", "Wind & Other Renewables", "Oil & Gas", "Water Supply & Sewage", "Waste Management & Recycling"],
  },
  {
    name: "Logistics, Transport & Warehousing",
    subIndustries: ["Freight & Cargo", "Courier & Last-Mile Delivery", "Warehousing & Cold Chain", "Shipping & Ports", "Railways & Rail Services", "Passenger Transport", "Customs & Freight Forwarding"],
  },
  {
    name: "Telecommunications",
    subIndustries: ["Telecom Operators", "Internet Service Providers", "Telecom Equipment", "Tower & Infrastructure"],
  },
  {
    name: "Media, Entertainment & Publishing",
    subIndustries: ["Film & Television", "Music & Audio", "OTT & Streaming", "Gaming & eSports", "Print & Digital Publishing", "Radio & Broadcasting", "Animation, VFX & Production"],
  },
  {
    name: "Professional & Business Services",
    subIndustries: ["Legal Services", "Accounting, Audit & Tax", "Management Consulting", "Recruitment & Staffing", "Engineering & Design Services", "Facility Management", "Security Services"],
  },
  {
    name: "Aerospace & Defence",
    subIndustries: ["Defence Manufacturing", "Aerospace Components", "Drones & UAV", "Defence Services & Training"],
  },
  {
    name: "MSME & Trading",
    subIndustries: ["Wholesale Trading", "Import & Export", "Commission Agents", "Small Workshops & Job Work", "Local Services"],
  },
];

const INTERNATIONAL_INDUSTRIES = [
  {
    name: "Banking & Capital Markets (Global)",
    subIndustries: ["Investment Banking", "Commercial Banking", "Private Equity & Venture Capital", "Hedge Funds & Asset Management", "Cryptocurrency & Digital Assets"],
  },
  {
    name: "Biotechnology & Life Sciences",
    subIndustries: ["Drug Discovery", "Genomics", "Clinical Research (CRO)", "Medical Research & Laboratories", "Contract Manufacturing (CDMO)"],
  },
  {
    name: "Consumer Goods & FMCG",
    subIndustries: ["Personal Care & Cosmetics", "Household Products", "Packaged Consumer Foods", "Tobacco & Alcohol", "Toys & Leisure Products"],
  },
  {
    name: "Electronics & Semiconductors",
    subIndustries: ["Semiconductors", "Consumer Electronics", "Industrial Electronics", "Electronic Components", "Displays & Optoelectronics"],
  },
  {
    name: "Oil, Gas & Mining (Global)",
    subIndustries: ["Upstream Exploration & Production", "Midstream & Pipelines", "Refining & Downstream", "Oilfield Services", "Metals & Minerals Mining"],
  },
  {
    name: "Renewable Energy & Cleantech",
    subIndustries: ["Solar & Photovoltaics", "Wind Power", "Hydrogen & Fuel Cells", "Energy Storage & Batteries", "Carbon Capture & Sustainability Services"],
  },
  {
    name: "Aviation & Aerospace (Global)",
    subIndustries: ["Commercial Airlines", "Aircraft Manufacturing", "Airports & Ground Services", "Space & Satellites", "Aircraft Maintenance (MRO)"],
  },
  {
    name: "Maritime & Shipping",
    subIndustries: ["Container Shipping", "Bulk & Tanker Shipping", "Shipbuilding & Repair", "Ports & Terminals", "Offshore Services"],
  },
  {
    name: "Sports, Fitness & Wellness",
    subIndustries: ["Gyms & Fitness Studios", "Sports Clubs & Leagues", "Sporting Goods", "Spas & Wellness Centres", "Sports Management & Media"],
  },
  {
    name: "Artificial Intelligence & Emerging Tech",
    subIndustries: ["AI / Machine Learning Products", "Robotics & Automation", "IoT & Smart Devices", "Blockchain & Web3", "AR / VR & Metaverse"],
  },
  {
    name: "Public Utilities & Municipal Services",
    subIndustries: ["Electricity & Gas Utilities", "Water Utilities", "Waste & Environmental Services", "Public Transit Authorities"],
  },
  {
    name: "Other",
    subIndustries: [],
  },
];

// Flat, ordered list with a stable sort key and a region tag for each entry.
const DEFAULT_INDUSTRIES = [
  ...INDIAN_INDUSTRIES.map((i) => ({ ...i, region: "IN" })),
  ...INTERNATIONAL_INDUSTRIES.map((i) => ({ ...i, region: "INTL" })),
].map((industry, index) => ({ ...industry, sortOrder: index + 1 }));

module.exports = { DEFAULT_INDUSTRIES };
