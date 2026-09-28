import DeleteIcon from "../common/DeleteIcon";
import PlusIcon from "../common/PlusIcon";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  LayoutTemplate,
  Hash,
  PenLine,
  CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";
import {
  DOCUMENT_TEMPLATES,
  DEFAULT_TEMPLATE,
  REGISTRY,
  buildDocumentHtml,
} from "../../../../shared/documentTemplates.js";
import SignatureModal from "../settings/SignatureModal";
import EditIcon from "../common/EditIcon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

/*
 * Right-hand drawer that gathers everything that governs how a document type
 * looks and is issued — its template, its numbering (prefix / suffix / next
 * number) and the signatures it can carry — into one place, split across three
 * tabs.
 */

const TEMPLATE_BLURBS = Object.fromEntries(
  Object.entries(REGISTRY).map(([key, mod]) => [key, mod.blurb || ""])
);

/*
 * Per-template preview scenarios. Each entry gives a distinct industry /
 * company / product dataset so the template picker shows how each style
 * looks across real-world verticals. STRICTLY preview-only — these never
 * reach the backend or affect any actual document.
 *
 * Templates (in REGISTRY order):
 *   Classic, Modern, Minimal, Elegant, Compact, Corporate,
 *   Vibrant, Mono, Vintage, Professional, Landscape, Service, Detailed
 */
const _d = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000);

const PREVIEW_SCENARIOS = {
  // ── Classic ─ Automotive / Tata Motors style ──────────────────────────────
  Classic: {
    doc: {
      invoiceNumber: "INV-2024-0812",
      date: _d(),
      dueDate: _d(30),
      receiverGSTIN: "27AAACT2727Q1ZL",
      placeOfSupply: "27-MAHARASHTRA",
      transactionType: "intra",
      items: [
        { name: "Tiago EV Battery Module", hsn: "8507", rate: 42000, quantity: 3, gstRate: 28 },
        { name: "Front Suspension Assembly", hsn: "8708", rate: 18500, quantity: 6, gstRate: 28 },
        { name: "Genuine Floor Mats (Set)", hsn: "8708", rate: 2200, quantity: 12, gstRate: 18 },
      ],
    },
    org: {
      companyName: "Tata Motors Limited",
      gstin: "27AAACT2727Q1ZK",
      email: "billing@tatamotors.com",
      phone: "+91-22-6665-8282",
      address: { addressLine1: "Bombay House, 24, Homi Mody St", city: "Mumbai", state: "Maharashtra", pincode: "400001", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 56'%3E%3Cellipse cx='60' cy='28' rx='58' ry='26' fill='%23003087' stroke='%23003087' stroke-width='1'/%3E%3Ctext x='60' y='36' font-family='Arial,sans-serif' font-size='24' font-weight='900' fill='white' text-anchor='middle' letter-spacing='3'%3ETATA%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "State Bank of India", accountHolderName: "Tata Motors Limited", accountNumber: "10987654321", ifscCode: "SBIN0000300", upiId: "tatamotors@sbi" },
    dealName: "Meridian Auto Dealers Pvt Ltd",
  },

  // ── Modern ─ Pharmaceuticals / Sun Pharma style ───────────────────────────
  Modern: {
    doc: {
      invoiceNumber: "SP-INV-6741",
      date: _d(),
      dueDate: _d(21),
      receiverGSTIN: "24AAACS4793D1ZY",
      placeOfSupply: "24-GUJARAT",
      transactionType: "intra",
      items: [
        { name: "Pantoprazole 40mg Tablets (Strip×10)", hsn: "3004", rate: 95, quantity: 500, gstRate: 12 },
        { name: "Amoxicillin 500mg Capsules (Strip×10)", hsn: "3004", rate: 78, quantity: 800, gstRate: 12 },
        { name: "Azithromycin 250mg (Strip×6)", hsn: "3004", rate: 62, quantity: 600, gstRate: 12 },
        { name: "Ondansetron 4mg Injection 2ml", hsn: "3004", rate: 32, quantity: 1200, gstRate: 5 },
      ],
    },
    org: {
      companyName: "Sun Pharmaceutical Industries Ltd",
      gstin: "24AAACS4793D1ZZ",
      email: "sales@sunpharma.com",
      phone: "+91-265-6615-500",
      address: { addressLine1: "Sun House, CTS No. 201 B/1", addressLine2: "Western Express Highway, Goregaon East", city: "Mumbai", state: "Maharashtra", pincode: "400063", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 56'%3E%3Crect width='140' height='56' rx='4' fill='%23FF6600'/%3E%3Ctext x='70' y='26' font-family='Arial,sans-serif' font-size='13' font-weight='bold' fill='white' text-anchor='middle'%3ESUN PHARMA%3C/text%3E%3Ctext x='70' y='44' font-family='Arial,sans-serif' font-size='9' fill='%23FFD0A8' text-anchor='middle'%3EINDUSTRIES LTD%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "HDFC Bank", accountHolderName: "Sun Pharmaceutical Industries Ltd", accountNumber: "50100234567890", ifscCode: "HDFC0000060", upiId: "sunpharma@hdfcbank" },
    dealName: "MedPlus Health Services Ltd",
  },

  // ── Minimal ─ IT Services / LTIMindtree style ─────────────────────────────
  Minimal: {
    doc: {
      invoiceNumber: "LTIM-2024-3318",
      date: _d(),
      dueDate: _d(45),
      receiverGSTIN: "29AAACL1234R1Z5",
      placeOfSupply: "29-KARNATAKA",
      transactionType: "intra",
      items: [
        { name: "SAP S/4HANA Implementation Services", hsn: "9983", rate: 185000, quantity: 1, gstRate: 18 },
        { name: "Cloud Migration — AWS Phase 2", hsn: "9983", rate: 95000, quantity: 1, gstRate: 18 },
        { name: "Managed Support Services (Monthly)", hsn: "9985", rate: 42000, quantity: 2, gstRate: 18 },
      ],
    },
    org: {
      companyName: "LTIMindtree Limited",
      gstin: "27AAACL1234R1Z4",
      email: "invoicing@ltimindtree.com",
      phone: "+91-20-6608-9999",
      address: { addressLine1: "L&T Technology Centre, Saki Vihar Rd", city: "Mumbai", state: "Maharashtra", pincode: "400072", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 56'%3E%3Crect width='150' height='56' rx='4' fill='%23ffffff'/%3E%3Ccircle cx='22' cy='28' r='16' fill='%2300A550'/%3E%3Ctext x='22' y='33' font-family='Arial,sans-serif' font-size='14' font-weight='900' fill='white' text-anchor='middle'%3ELT%3C/text%3E%3Ctext x='90' y='26' font-family='Arial,sans-serif' font-size='14' font-weight='bold' fill='%23003087' text-anchor='middle'%3ELTIMindtree%3C/text%3E%3Ctext x='90' y='43' font-family='Arial,sans-serif' font-size='8' fill='%23666' text-anchor='middle'%3EBreaking Barriers%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "Axis Bank", accountHolderName: "LTIMindtree Limited", accountNumber: "911020048765432", ifscCode: "UTIB0000001", upiId: "ltimindtree@axisbank" },
    dealName: "Ultratech Cement Ltd",
  },

  // ── Elegant ─ Luxury / Titan Company style ────────────────────────────────
  Elegant: {
    doc: {
      invoiceNumber: "TCL-2024-0191",
      date: _d(),
      dueDate: _d(15),
      receiverGSTIN: "33AAACT3331Q1ZP",
      placeOfSupply: "33-TAMIL NADU",
      transactionType: "intra",
      items: [
        { name: "Titan Raga Vanya (White Dial, SS Bracelet)", hsn: "9101", rate: 12995, quantity: 5, gstRate: 18 },
        { name: "Fastrack Limitless FS1 Smart Band", hsn: "8517", rate: 4995, quantity: 10, gstRate: 18 },
        { name: "Tanishq Solitaire Pendant 18Kt", hsn: "7113", rate: 38500, quantity: 2, gstRate: 3 },
        { name: "Titan Edge Slim Watch (Titanium)", hsn: "9101", rate: 18995, quantity: 4, gstRate: 18 },
      ],
    },
    org: {
      companyName: "Titan Company Limited",
      gstin: "33AAACT3331Q1ZQ",
      email: "b2b@titancompany.in",
      phone: "+91-80-6660-9001",
      address: { addressLine1: "3, SIPCOT Industrial Complex", city: "Hosur", state: "Tamil Nadu", pincode: "635126", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 130 56'%3E%3Crect width='130' height='56' rx='4' fill='%23002868'/%3E%3Ctext x='65' y='26' font-family='Georgia,serif' font-size='20' font-weight='bold' fill='%23D4AF37' text-anchor='middle' letter-spacing='2'%3ETITAN%3C/text%3E%3Ctext x='65' y='44' font-family='Arial,sans-serif' font-size='8' fill='%23A0B0D0' text-anchor='middle' letter-spacing='3'%3ECOMPANY LIMITED%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "ICICI Bank", accountHolderName: "Titan Company Limited", accountNumber: "007405003456", ifscCode: "ICIC0000074", upiId: "titan@icici" },
    dealName: "Helios World of Watches",
  },

  // ── Compact ─ FMCG / HUL style ───────────────────────────────────────────
  Compact: {
    doc: {
      invoiceNumber: "HUL-DL-44892",
      date: _d(),
      dueDate: _d(7),
      receiverGSTIN: "07AAACH0269B1ZI",
      placeOfSupply: "07-DELHI",
      transactionType: "inter",
      items: [
        { name: "Surf Excel Matic Liquid 2L", hsn: "3402", rate: 285, quantity: 120, gstRate: 18 },
        { name: "Dove Moisturising Body Wash 500ml", hsn: "3401", rate: 320, quantity: 96, gstRate: 18 },
        { name: "Lipton Green Tea Honey Lemon 25 bags", hsn: "0902", rate: 140, quantity: 200, gstRate: 5 },
        { name: "Rin Bar Detergent 150g×4", hsn: "3402", rate: 58, quantity: 300, gstRate: 18 },
        { name: "Closeup Toothpaste 120g (4-pk)", hsn: "3306", rate: 196, quantity: 180, gstRate: 18 },
      ],
    },
    org: {
      companyName: "Hindustan Unilever Limited",
      gstin: "27AAACH0269B1ZH",
      email: "trade@hul.co.in",
      phone: "+91-22-3983-0000",
      address: { addressLine1: "Unilever House, B. D. Sawant Marg", city: "Mumbai", state: "Maharashtra", pincode: "400099", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 56'%3E%3Crect width='140' height='56' rx='4' fill='%23003087'/%3E%3Ctext x='70' y='26' font-family='Arial,sans-serif' font-size='11' font-weight='bold' fill='white' text-anchor='middle' letter-spacing='1'%3EHINDUSTAN UNILEVER%3C/text%3E%3Ctext x='70' y='43' font-family='Arial,sans-serif' font-size='9' fill='%23A8C8FF' text-anchor='middle' letter-spacing='2'%3ELIMITED%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "Citibank India", accountHolderName: "Hindustan Unilever Limited", accountNumber: "0021300987654", ifscCode: "CITI0000001", upiId: "hul@citi" },
    dealName: "D-Mart (Avenue Supermarts Ltd)",
  },

  // ── Corporate ─ Infrastructure / L&T style ────────────────────────────────
  Corporate: {
    doc: {
      invoiceNumber: "LT-INFRA-2024-0077",
      date: _d(),
      dueDate: _d(60),
      receiverGSTIN: "06AAACL0542A1ZO",
      placeOfSupply: "06-HARYANA",
      transactionType: "inter",
      items: [
        { name: "Structural Steel — IS 2062 Grade A (MT)", hsn: "7216", rate: 72000, quantity: 15, gstRate: 18 },
        { name: "Ready Mix Concrete M30 (CUM)", hsn: "2517", rate: 5800, quantity: 80, gstRate: 18 },
        { name: "TMT Bars Fe-500D 12mm (MT)", hsn: "7214", rate: 68500, quantity: 20, gstRate: 18 },
        { name: "Project Management Consultancy (Month)", hsn: "9983", rate: 350000, quantity: 2, gstRate: 18 },
      ],
    },
    org: {
      companyName: "Larsen & Toubro Limited",
      gstin: "27AAACL0542A1ZP",
      email: "infra.billing@larsentoubro.com",
      phone: "+91-22-6752-5656",
      address: { addressLine1: "L&T House, Ballard Estate", city: "Mumbai", state: "Maharashtra", pincode: "400001", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 56'%3E%3Crect width='120' height='56' rx='4' fill='%23CC0000'/%3E%3Ctext x='60' y='30' font-family='Arial,sans-serif' font-size='26' font-weight='900' fill='white' text-anchor='middle' letter-spacing='4'%3EL%26amp%3BT%3C/text%3E%3Ctext x='60' y='48' font-family='Arial,sans-serif' font-size='7' fill='%23FFB0B0' text-anchor='middle' letter-spacing='1'%3ELARSEN %26amp%3B TOUBRO%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "HDFC Bank", accountHolderName: "Larsen & Toubro Limited", accountNumber: "00600350123456", ifscCode: "HDFC0000006", upiId: "landt@hdfcbank" },
    dealName: "NHAI (National Highways Authority)",
  },

  // ── Vibrant ─ E-commerce Electronics / Flipkart style ────────────────────
  Vibrant: {
    doc: {
      invoiceNumber: "FK-EB-2024-119847",
      date: _d(),
      dueDate: _d(14),
      receiverGSTIN: "29AABCF8402N1ZP",
      placeOfSupply: "29-KARNATAKA",
      transactionType: "intra",
      items: [
        { name: "Samsung Galaxy S24+ 5G (256GB, Titanium)", hsn: "8517", rate: 74999, quantity: 3, gstRate: 18 },
        { name: "Sony WH-1000XM5 Wireless Headphones", hsn: "8518", rate: 27490, quantity: 8, gstRate: 18 },
        { name: "LG 43\" 4K UHD Smart LED TV (43UP7550)", hsn: "8528", rate: 38999, quantity: 5, gstRate: 28 },
        { name: "Apple iPad Air M2 (11\", 256GB WiFi)", hsn: "8471", rate: 74900, quantity: 4, gstRate: 18 },
      ],
    },
    org: {
      companyName: "Flipkart Internet Private Limited",
      gstin: "29AABCF8402N1ZO",
      email: "seller-billing@flipkart.com",
      phone: "+91-80-4922-5500",
      address: { addressLine1: "Flipkart Campus, Embassy Tech Village", city: "Bengaluru", state: "Karnataka", pincode: "560103", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 56'%3E%3Crect width='140' height='56' rx='4' fill='%232874F0'/%3E%3Ctext x='70' y='35' font-family='Arial,sans-serif' font-size='26' font-weight='900' fill='white' text-anchor='middle' letter-spacing='1'%3Eflipkart%3C/text%3E%3Cpolygon points='115,10 122,20 108,20' fill='%23FFD700'/%3E%3C/svg%3E",
    },
    bank: { bankName: "Yes Bank", accountHolderName: "Flipkart Internet Pvt Ltd", accountNumber: "0000123456789", ifscCode: "YESB0000001", upiId: "flipkart@yesbank" },
    dealName: "Reliance Digital Retail Ltd",
  },

  // ── Mono ─ Steel & Metals / JSW style ────────────────────────────────────
  Mono: {
    doc: {
      invoiceNumber: "JSW-STL-2024-3841",
      date: _d(),
      dueDate: _d(30),
      receiverGSTIN: "29AABCJ1234P1ZQ",
      placeOfSupply: "29-KARNATAKA",
      transactionType: "intra",
      items: [
        { name: "HR Coil — 3mm Thickness (MT)", hsn: "7208", rate: 58500, quantity: 25, gstRate: 18 },
        { name: "Cold Rolled GP Sheet 0.6mm (MT)", hsn: "7210", rate: 65000, quantity: 18, gstRate: 18 },
        { name: "Colour Coated PPGI 0.5mm (MT)", hsn: "7210", rate: 82000, quantity: 10, gstRate: 18 },
        { name: "MS Angle 50×50×6 (MT)", hsn: "7216", rate: 56000, quantity: 8, gstRate: 18 },
      ],
    },
    org: {
      companyName: "JSW Steel Limited",
      gstin: "29AABCJ1234P1ZR",
      email: "commercial@jsw.in",
      phone: "+91-22-4286-1000",
      address: { addressLine1: "JSW Centre, Bandra-Kurla Complex", city: "Mumbai", state: "Maharashtra", pincode: "400051", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 56'%3E%3Crect width='120' height='56' rx='4' fill='%23222222'/%3E%3Ctext x='60' y='30' font-family='Arial,sans-serif' font-size='28' font-weight='900' fill='%23E31E24' text-anchor='middle' letter-spacing='2'%3EJSW%3C/text%3E%3Ctext x='60' y='48' font-family='Arial,sans-serif' font-size='8' fill='%23AAAAAA' text-anchor='middle' letter-spacing='2'%3ESTEEL LIMITED%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "Kotak Mahindra Bank", accountHolderName: "JSW Steel Limited", accountNumber: "9876543210123", ifscCode: "KKBK0000022", upiId: "jswsteel@kotak" },
    dealName: "Ashok Leyland Ltd",
  },

  // ── Vintage ─ Textiles / Arvind Mills style ───────────────────────────────
  Vintage: {
    doc: {
      invoiceNumber: "AM-2024-TEX-2271",
      date: _d(),
      dueDate: _d(45),
      receiverGSTIN: "24AAACA2648A1ZW",
      placeOfSupply: "24-GUJARAT",
      transactionType: "intra",
      items: [
        { name: "Pure Cotton Woven Shirting 60s×60s (Mtrs)", hsn: "5208", rate: 185, quantity: 2000, gstRate: 5 },
        { name: "Lycra Denim Fabric (Mtrs)", hsn: "5211", rate: 320, quantity: 1500, gstRate: 5 },
        { name: "Voile Printed Cotton Fabric (Mtrs)", hsn: "5208", rate: 145, quantity: 3000, gstRate: 5 },
        { name: "Stretch Knit Jersey (Mtrs)", hsn: "6006", rate: 275, quantity: 1000, gstRate: 12 },
      ],
    },
    org: {
      companyName: "Arvind Limited",
      gstin: "24AAACA2648A1ZX",
      email: "textile.sales@arvind.com",
      phone: "+91-79-3011-3011",
      address: { addressLine1: "Naroda Road", city: "Ahmedabad", state: "Gujarat", pincode: "380025", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 130 56'%3E%3Crect width='130' height='56' rx='4' fill='%23006341'/%3E%3Ctext x='65' y='28' font-family='Georgia,serif' font-size='20' font-weight='bold' fill='white' text-anchor='middle' letter-spacing='3'%3EARVIND%3C/text%3E%3Ctext x='65' y='46' font-family='Arial,sans-serif' font-size='8' fill='%2390C0A8' text-anchor='middle' letter-spacing='2'%3ELIMITED%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "Bank of Baroda", accountHolderName: "Arvind Limited", accountNumber: "09120200001234", ifscCode: "BARB0NARODA", upiId: "arvindtextile@bob" },
    dealName: "Manyavar Mohey (Vedant Fashions Ltd)",
  },

  // ── Professional ─ Logistics / BlueDart style ─────────────────────────────
  Professional: {
    doc: {
      invoiceNumber: "BD-2024-LOG-5512",
      date: _d(),
      dueDate: _d(30),
      receiverGSTIN: "27AAACB0720K1ZB",
      placeOfSupply: "27-MAHARASHTRA",
      transactionType: "intra",
      items: [
        { name: "Domestic Air Express — Priority (Shipments)", hsn: "9965", rate: 650, quantity: 180, gstRate: 18 },
        { name: "Surface Express — Next Day (Shipments)", hsn: "9965", rate: 280, quantity: 320, gstRate: 18 },
        { name: "Freight Handling & Packing Charges", hsn: "9967", rate: 45, quantity: 500, gstRate: 18 },
        { name: "Warehouse Management — Monthly (Sqft)", hsn: "9967", rate: 28, quantity: 2000, gstRate: 18 },
      ],
    },
    org: {
      companyName: "Blue Dart Express Limited",
      gstin: "27AAACB0720K1ZA",
      email: "corporate.billing@bluedart.com",
      phone: "+91-22-2839-5444",
      address: { addressLine1: "Blue Dart Centre, Sahar Airport Rd", city: "Mumbai", state: "Maharashtra", pincode: "400099", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 56'%3E%3Crect width='140' height='56' rx='4' fill='%23002868'/%3E%3Ccircle cx='20' cy='28' r='14' fill='%23CC0000'/%3E%3Ctext x='20' y='33' font-family='Arial,sans-serif' font-size='12' font-weight='bold' fill='white' text-anchor='middle'%3EBD%3C/text%3E%3Ctext x='86' y='26' font-family='Arial,sans-serif' font-size='14' font-weight='bold' fill='white' text-anchor='middle'%3EBlueDart%3C/text%3E%3Ctext x='86' y='43' font-family='Arial,sans-serif' font-size='8' fill='%2390A8D0' text-anchor='middle'%3EEXPRESS LIMITED%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "Deutsche Bank", accountHolderName: "Blue Dart Express Limited", accountNumber: "0023456789012", ifscCode: "DEUT0784BBY", upiId: "bluedart@deutsche" },
    dealName: "Myntra Designs Pvt Ltd",
  },

  // ── Landscape ─ Agri-Inputs / UPL style ──────────────────────────────────
  Landscape: {
    doc: {
      invoiceNumber: "UPL-AGR-2024-0934",
      date: _d(),
      dueDate: _d(45),
      receiverGSTIN: "24AAACU5401G1ZT",
      placeOfSupply: "24-GUJARAT",
      transactionType: "intra",
      items: [
        { name: "Profex Super Insecticide 500ml", hsn: "3808", rate: 485, quantity: 400, gstRate: 18 },
        { name: "Saaf Fungicide 500g", hsn: "3808", rate: 550, quantity: 300, gstRate: 18 },
        { name: "Nurelle D Insecticide 1L", hsn: "3808", rate: 780, quantity: 250, gstRate: 18 },
        { name: "NPK Fertiliser 19:19:19 (50kg)", hsn: "3105", rate: 1850, quantity: 100, gstRate: 5 },
        { name: "Ulala Insecticide 80g", hsn: "3808", rate: 920, quantity: 200, gstRate: 18 },
      ],
    },
    org: {
      companyName: "UPL Limited",
      gstin: "24AAACU5401G1ZU",
      email: "accounts@upl-ltd.com",
      phone: "+91-22-6695-7000",
      address: { addressLine1: "UPL House, 610 B/2, Bandra Village", city: "Mumbai", state: "Maharashtra", pincode: "400051", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 110 56'%3E%3Crect width='110' height='56' rx='4' fill='%23009A44'/%3E%3Ctext x='55' y='35' font-family='Arial,sans-serif' font-size='30' font-weight='900' fill='white' text-anchor='middle' letter-spacing='3'%3EUPL%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "HSBC India", accountHolderName: "UPL Limited", accountNumber: "0040012345678", ifscCode: "HSBC0110002", upiId: "uplltd@hsbc" },
    dealName: "IFFCO Kisan (Indian Farmers Fertiliser)",
  },

  // ── Service ─ Hospitality / IHCL (Taj Hotels) style ──────────────────────
  Service: {
    doc: {
      invoiceNumber: "TAJ-BLR-2024-7741",
      date: _d(),
      dueDate: _d(15),
      receiverGSTIN: "29AAACI8818B1ZN",
      placeOfSupply: "29-KARNATAKA",
      transactionType: "intra",
      items: [
        { name: "Deluxe Room — Corporate Rate (Night)", hsn: "9963", rate: 12500, quantity: 6, gstRate: 18 },
        { name: "F&B — Corporate Dinner Banquet (Pax)", hsn: "9963", rate: 2800, quantity: 45, gstRate: 5 },
        { name: "Conference Hall Rental — Full Day", hsn: "9963", rate: 85000, quantity: 1, gstRate: 18 },
        { name: "Airport Transfer — Sedan (Trips)", hsn: "9964", rate: 1800, quantity: 8, gstRate: 5 },
      ],
    },
    org: {
      companyName: "Indian Hotels Company Limited",
      gstin: "27AAACI8818B1ZM",
      email: "corporate@tajhotels.com",
      phone: "+91-22-6639-5515",
      address: { addressLine1: "Mandlik House, Mandlik Road", city: "Mumbai", state: "Maharashtra", pincode: "400001", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 56'%3E%3Crect width='140' height='56' rx='4' fill='%23C8A84B'/%3E%3Ctext x='70' y='26' font-family='Georgia,serif' font-size='12' font-weight='bold' fill='%232C1810' text-anchor='middle' letter-spacing='2'%3ETHE TAJ%3C/text%3E%3Ctext x='70' y='43' font-family='Georgia,serif' font-size='9' fill='%232C1810' text-anchor='middle' letter-spacing='1'%3EHOTELS RESORTS %26amp%3B PALACES%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "IDFC First Bank", accountHolderName: "Indian Hotels Company Limited", accountNumber: "10200012345678", ifscCode: "IDFB0040101", upiId: "tajhotels@idfcfirst" },
    dealName: "Infosys Limited (Travel Desk)",
  },

  // ── Detailed ─ CA/Professional Services / Deloitte style ─────────────────
  Detailed: {
    doc: {
      invoiceNumber: "DTT-MH-2024-1087",
      date: _d(),
      dueDate: _d(30),
      receiverGSTIN: "27AAACT6789P1ZA",
      placeOfSupply: "27-MAHARASHTRA",
      transactionType: "intra",
      items: [
        { name: "Statutory Audit — FY 2024-25 (Q2)", hsn: "9982", rate: 225000, quantity: 1, gstRate: 18 },
        { name: "GST Compliance & Filing Services (Month)", hsn: "9982", rate: 45000, quantity: 3, gstRate: 18 },
        { name: "Transfer Pricing Study & Documentation", hsn: "9982", rate: 185000, quantity: 1, gstRate: 18 },
        { name: "Risk Advisory — Internal Audit (Days)", hsn: "9983", rate: 32000, quantity: 4, gstRate: 18 },
      ],
    },
    org: {
      companyName: "Deloitte Touche Tohmatsu India LLP",
      gstin: "27AAACT6789P1ZB",
      email: "invoices.india@deloitte.com",
      phone: "+91-22-6185-4000",
      address: { addressLine1: "One India Bulls Centre, Tower 3", addressLine2: "841 S. B. Marg, Elphinstone Mill Compound", city: "Mumbai", state: "Maharashtra", pincode: "400013", country: "India" },
      logoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 56'%3E%3Crect width='140' height='56' rx='4' fill='%2386BC25'/%3E%3Ctext x='70' y='35' font-family='Arial,sans-serif' font-size='24' font-weight='900' fill='white' text-anchor='middle' letter-spacing='1'%3EDeloitte.%3C/text%3E%3C/svg%3E",
    },
    bank: { bankName: "Citibank India", accountHolderName: "Deloitte Touche Tohmatsu India LLP", accountNumber: "0021987654321", ifscCode: "CITI0000002", upiId: "deloitteindia@citi" },
    dealName: "Mahindra & Mahindra Limited",
  },
};

/* Fallback for any template not listed above */
const DEFAULT_PREVIEW_SCENARIO = {
  doc: {
    invoiceNumber: "INV-2024-0001",
    date: _d(),
    dueDate: _d(30),
    receiverGSTIN: "29AAACI5950L1Z6",
    placeOfSupply: "29-KARNATAKA",
    transactionType: "intra",
    items: [
      { name: "Professional Services", hsn: "9983", rate: 25000, quantity: 1, gstRate: 18 },
      { name: "Implementation Support", hsn: "9983", rate: 8000, quantity: 2, gstRate: 18 },
    ],
  },
  org: null,
  bank: null,
  dealName: "Sample Customer",
};

const THUMB_W = 760; // the design width the templates are authored against
const PAGE_RATIO = 1.414; // A4 — keeps each thumbnail page-shaped

// The drawer speaks the page's document-type vocabulary (tax / performa / …);
// the settings model keys numbering by its own names. Bridge the two here.
const SETTINGS_KEY = {
  tax: "invoice",
  performa: "proformaInvoice",
  quotation: "quote",
  deliveryChallan: "deliveryChallan",
};

const DEFAULT_SECTIONS = {
  invoice: { prefix: "INV-", suffix: "", prefixes: ["INV-"], suffixes: [] },
  quote: { prefix: "QT", suffix: "", prefixes: ["QT", "QTN"], suffixes: [] },
  proformaInvoice: { prefix: "PI", suffix: "", prefixes: ["PI", "PFI"], suffixes: [] },
  deliveryChallan: { prefix: "DC", suffix: "", prefixes: ["DC"], suffixes: [] },
};

const TemplatePreviewCard = ({
  template,
  selected,
  onSelect,
  type,
  defaultSigUrl,
}) => {
  // The sheet is authored at THUMB_W; scale it down to whatever width the card
  // gets so the thumbnail always fills its page, whatever the grid does.
  const frameRef = useRef(null);
  const [frameW, setFrameW] = useState(0);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = frameW ? frameW / THUMB_W : 0;

  // Each template gets its own industry-specific scenario; fall back to the
  // generic scenario for any template not yet in the map.
  const scenario = PREVIEW_SCENARIOS[template] || DEFAULT_PREVIEW_SCENARIO;

  const html = buildDocumentHtml({ ...scenario.doc, signature: defaultSigUrl }, {
    type,
    template,
    orgDetails: scenario.org,
    bankDetails: scenario.bank,
    dealName: scenario.dealName,
    isPreview: true,
  });

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className={`group w-full text-left rounded-xl border-2 transition-colors overflow-hidden ${selected
          ? "border-[#0085FF] bg-[#F5FAFF]"
          : "border-[#E1E4EA] hover:border-[#C9CFD8] bg-white"
        }`}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-[#1F2937] truncate block">
            {template}
          </span>
          <p className="text-[11px] text-[#99A0AE] truncate">
            {TEMPLATE_BLURBS[template]}
          </p>
        </div>
        {selected && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[#0085FF] bg-[#E3F1FF] px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5">
            <Check className="w-3 h-3" />
            In use
          </span>
        )}
      </div>

      {/* The whole document as one page-shaped sheet, scaled to the card's
          width. Pointer events are off so the card stays one click target. */}
      <div className="px-3 pb-3">
        <div
          ref={frameRef}
          style={{ height: (frameW || 0) * PAGE_RATIO }}
          className="bg-white border border-[#E1E4EA] shadow-sm overflow-hidden pointer-events-none select-none"
        >
          <div
            style={{
              width: THUMB_W,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </button>
  );
};

const TemplateDrawer = ({ isOpen, onClose, type = "tax", docLabel = "Invoice", initialTab = "template" }) => {
  useBodyScrollLock(isOpen);
  // Delivery Challan has no selectable style — it always renders its one
  // dedicated, non-priced layout — so it has no "Template" tab to land on.
  const isDeliveryChallan = type === "deliveryChallan";
  const [tab, setTab] = useState(isDeliveryChallan && initialTab === "template" ? "numbering" : initialTab);
  const [templates, setTemplates] = useState(null);
  const [orgDetails, setOrgDetails] = useState(null);
  const [bankDetails, setBankDetails] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Numbering — the full settings doc so a save doesn't clobber other types.
  const settingsKey = SETTINGS_KEY[type] || "invoice";
  const isInvoice = type === "tax";
  const [section, setSection] = useState(DEFAULT_SECTIONS[settingsKey]);
  const [nextNumber, setNextNumber] = useState(1);
  const [allSections, setAllSections] = useState(null);
  const [newPrefix, setNewPrefix] = useState("");
  const [newSuffix, setNewSuffix] = useState("");
  const [savingNumbering, setSavingNumbering] = useState(false);

  // Signatures — org-wide, shared by every document type.
  const [signatures, setSignatures] = useState([]);
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [editingSig, setEditingSig] = useState(null);

  const fetchSignatures = async () => {
    try {
      const res = await API.get("/document-settings/signatures");
      setSignatures(Array.isArray(res.data) ? res.data : res.data?.signatures || []);
    } catch (err) {
      console.error("Failed to load signatures", err);
      setSignatures([]);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [tpl, branding, bank, docSettings] = await Promise.allSettled([
        API.get("/document-templates"),
        API.get("/branding"),
        API.get("/bank-details"),
        API.get("/document-settings"),
      ]);
      if (cancelled) return;

      if (tpl.status === "fulfilled") {
        setTemplates(tpl.value.data?.templates || {});
      } else {
        toast.error("Couldn't load your template choice");
        setTemplates({});
      }
      if (branding.status === "fulfilled") setOrgDetails(branding.value.data);
      if (bank.status === "fulfilled") setBankDetails(bank.value.data);

      if (docSettings.status === "fulfilled") {
        const data = docSettings.value.data || {};
        const incoming = data.documentTypeSettings || {};
        const merged = {};
        Object.keys(DEFAULT_SECTIONS).forEach((key) => {
          const fallback = DEFAULT_SECTIONS[key];
          merged[key] = {
            prefix: incoming?.[key]?.prefix || fallback.prefix,
            suffix: incoming?.[key]?.suffix || fallback.suffix,
            prefixes: incoming?.[key]?.prefixes || fallback.prefixes,
            suffixes: incoming?.[key]?.suffixes || fallback.suffixes,
          };
        });
        setAllSections(merged);
        setSection(merged[settingsKey]);
        setNextNumber(data.nextInvoiceNumber || 1);
      }

      await fetchSignatures();
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, settingsKey]);

  // Close on Escape, like the other overlays on this page.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const selected = templates?.[type] || DEFAULT_TEMPLATE;

  const handleSelectTemplate = async (template) => {
    if (template === selected || saving) return;
    const previous = templates;
    // Optimistic: the choice is a single field, so show it immediately and
    // roll back if the save fails.
    setTemplates((prev) => ({ ...prev, [type]: template }));
    setSaving(true);
    try {
      const res = await API.put("/document-templates", {
        templates: { [type]: template },
      });
      setTemplates(res.data?.templates || { [type]: template });
      toast.success(`${template} applied to ${docLabel.toLowerCase()}s`);
    } catch (err) {
      setTemplates(previous);
      toast.error(
        err.response?.data?.error || "Failed to save your template choice"
      );
    } finally {
      setSaving(false);
    }
  };

  // Adds a typed value to this type's saved list and selects it in one go, so
  // it can be reused later without retyping.
  const addValue = (kind) => {
    const value = (kind === "prefix" ? newPrefix : newSuffix).trim();
    if (!value) return;
    setSection((prev) => {
      const listKey = kind === "prefix" ? "prefixes" : "suffixes";
      const existing = prev[listKey] || [];
      return {
        ...prev,
        [listKey]: existing.includes(value) ? existing : [...existing, value],
        [kind]: value,
      };
    });
    kind === "prefix" ? setNewPrefix("") : setNewSuffix("");
  };

  const handleSaveNumbering = async () => {
    setSavingNumbering(true);
    try {
      const nextAll = { ...(allSections || DEFAULT_SECTIONS), [settingsKey]: section };
      const payload = {
        documentTypeSettings: nextAll,
      };
      // The flat invoice fields and the next number are only meaningful for
      // invoices, which is the type the app actually auto-numbers.
      if (isInvoice) {
        payload.invoicePrefix = (section.prefix || "INV-").trim();
        payload.invoiceSuffix = (section.suffix || "").trim();
        payload.invoicePrefixes = section.prefixes || [];
        payload.invoiceSuffixes = section.suffixes || [];
        payload.nextInvoiceNumber = Number(nextNumber) || 1;
      }
      await API.put("/document-settings", payload);
      setAllSections(nextAll);
      toast.success("Numbering saved");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save numbering");
    } finally {
      setSavingNumbering(false);
    }
  };

  const handleSaveSignature = async (sigData) => {
    try {
      await API.post("/document-settings/signatures", sigData);
      toast.success(editingSig ? "Signature updated" : "Signature added");
      setSigModalOpen(false);
      setEditingSig(null);
      await fetchSignatures();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save signature");
    }
  };

  const handleDeleteSignature = async (id) => {
    try {
      await API.delete(`/document-settings/signatures/${id}`);
      toast.success("Signature deleted");
      await fetchSignatures();
    } catch {
      toast.error("Failed to delete signature");
    }
  };

  const handleSetDefaultSignature = async (id) => {
    try {
      await API.patch(`/document-settings/signatures/${id}/default`);
      toast.success("Default signature updated");
      await fetchSignatures();
    } catch {
      toast.error("Failed to update default signature");
    }
  };

  if (!isOpen) return null;

  const prefixPreview = section?.prefix?.trim();
  const suffixPreview = section?.suffix?.trim();
  const numberPreview = [
    ...(prefixPreview ? [prefixPreview] : []),
    isInvoice ? String(nextNumber || 1) : "0001",
    ...(suffixPreview ? [suffixPreview] : []),
  ].join("");

  const TABS = [
    ...(isDeliveryChallan ? [] : [{ key: "template", label: "Template", Icon: LayoutTemplate }]),
    { key: "numbering", label: "Numbering", Icon: Hash },
    { key: "signatures", label: "Signatures", Icon: PenLine },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100004]">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Same inset rounded-card geometry as the Companies/Contacts panels
          (dc-panel-card), but wider than their dc-panel-w third — the cards
          here are full document renders and need the room. */}
      <aside
        role="dialog"
        aria-label="Document setup"
        className="fixed dc-panel-card w-[calc(100%-3rem)] lg:w-[70vw] bg-white shadow-2xl flex flex-col overflow-hidden animate-slideInRight"
      >
        <header className="flex-shrink-0 flex items-center justify-between gap-3 px-5 pt-4 border-b border-[#E1E4EA]">
          <div className="flex items-center gap-2.5 min-w-0 pb-4">
            <div className="w-9 h-9 rounded-lg bg-[#F0F6FF] flex items-center justify-center flex-shrink-0">
              <LayoutTemplate className="w-4.5 h-4.5 text-[#0085FF]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#1F2937] truncate">
                {docLabel} setup
              </h2>
              <p className="text-xs text-[#99A0AE] truncate">
                Template, numbering and signatures — all in one place
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 mb-4 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Tab bar — one row that switches which control set fills the body.
            Smaller text/padding/icon and tighter gap on mobile so all three
            tabs fit the narrower drawer width without clipping; back to the
            original sizing at lg. */}
        <div className="flex-shrink-0 flex items-center gap-0.5 lg:gap-1 px-2 lg:px-4 pt-3 border-b border-[#E1E4EA]">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1 lg:gap-1.5 px-2 lg:px-3.5 py-2 text-xs lg:text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === key
                  ? "border-[#0085FF] text-[#0085FF]"
                  : "border-transparent text-[#525866] hover:text-[#1F2937]"
                }`}
            >
              <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* ---- TEMPLATE ---- */}
          {tab === "template" && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 content-start">
              {loading || !templates
                ? DOCUMENT_TEMPLATES.map((t) => (
                  <div
                    key={t}
                    className="aspect-[1/1.55] rounded-xl bg-gray-100 animate-pulse"
                  />
                ))
                : DOCUMENT_TEMPLATES.map((t) => (
                  <TemplatePreviewCard
                    key={t}
                    template={t}
                    type={type}
                    selected={selected === t}
                    onSelect={handleSelectTemplate}
                    defaultSigUrl={signatures.find((s) => s.isDefault)?.dataUrl || signatures[0]?.dataUrl}
                  />
                ))}
            </div>
          )}

          {/* ---- NUMBERING ---- */}
          {tab === "numbering" && (
            <div className="p-5 max-w-2xl">
              {loading ? (
                <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />
              ) : (
                <div className="space-y-5">
                  {/* Live number preview */}
                  <div className="rounded-xl border border-[#E1E4EA] bg-[#FAFBFC] p-4">
                    <p className="text-[11px] uppercase tracking-wide text-[#99A0AE] mb-2">
                      Next {docLabel.toLowerCase()} number
                    </p>
                    <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 p-0.5 text-sm">
                      {prefixPreview && (
                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">
                          {prefixPreview}
                        </span>
                      )}
                      <span className="rounded-full bg-[#0085FF] px-2.5 py-1 font-semibold text-white">
                        {isInvoice ? nextNumber || 1 : "0001"}
                      </span>
                      {suffixPreview && (
                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">
                          {suffixPreview}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-[#525866]">
                      Renders as{" "}
                      <span className="font-semibold text-[#1F2937]">
                        {numberPreview}
                      </span>
                    </p>
                  </div>

                  {/* Prefix + Suffix pickers, each with an add-new field */}
                  {[
                    { kind: "prefix", label: "Prefix", listKey: "prefixes", newVal: newPrefix, setNew: setNewPrefix },
                    { kind: "suffix", label: "Suffix", listKey: "suffixes", newVal: newSuffix, setNew: setNewSuffix },
                  ].map(({ kind, label, listKey, newVal, setNew }) => (
                    <div key={kind} className="space-y-2">
                      <label className="block text-sm font-semibold text-[#1F2937]">
                        {label}
                      </label>
                      <div className="relative flex items-center h-10 rounded-lg border border-[#E1E4EA] focus-within:border-[#0085FF] overflow-hidden">
                        <select
                          value={section?.[kind] || ""}
                          onChange={(e) =>
                            setSection((prev) => ({ ...prev, [kind]: e.target.value }))
                          }
                          className="flex-1 min-w-0 h-full px-3 text-[13px] bg-transparent appearance-none focus:outline-none"
                        >
                          {kind === "suffix" && <option value="">None</option>}
                          {(section?.[listKey] || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={newVal}
                          onChange={(e) => setNew(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addValue(kind);
                            }
                          }}
                          placeholder={`Add a new ${label.toLowerCase()}`}
                          className="flex-1 h-10 rounded-lg border border-[#E1E4EA] px-3 text-[13px] focus:outline-none focus:border-[#0085FF]"
                        />
                        <button
                          type="button"
                          onClick={() => addValue(kind)}
                          className="h-10 px-4 rounded-lg border border-[#0085FF]/30 text-sm font-medium text-[#0085FF] hover:bg-blue-50 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Next number — only invoices are auto-numbered by the app */}
                  {isInvoice && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-[#1F2937]">
                        Next number
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={nextNumber}
                        onChange={(e) => setNextNumber(e.target.value)}
                        className="w-40 h-10 rounded-lg border border-[#E1E4EA] px-3 text-[13px] focus:outline-none focus:border-[#0085FF]"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveNumbering}
                    disabled={savingNumbering}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-[#0085FF] text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
                  >
                    {savingNumbering ? "Saving…" : "Save numbering"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---- SIGNATURES ---- */}
          {tab === "signatures" && (
            <div className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#1F2937]">
                    Signatures
                  </h3>
                  <p className="text-xs text-[#99A0AE]">
                    The default is applied to every document unless a specific
                    one is picked on the document.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSig(null);
                    setSigModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#0085FF] text-white text-sm font-medium hover:bg-blue-600 transition-colors flex-shrink-0"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add
                </button>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-44 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : signatures.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E1E4EA] py-10 text-center">
                  <div className="p-3 rounded-full bg-[#F0F6FF] text-[#0085FF] mb-3">
                    <PenLine className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    No signatures yet
                  </p>
                  <p className="text-xs text-[#99A0AE] max-w-sm mt-1">
                    Add one by uploading an image, drawing it, or typing with a
                    stylized font. The first one becomes the default.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {signatures.map((sig) => (
                    <div
                      key={sig.id}
                      className={`relative flex flex-col justify-between rounded-xl border-2 p-4 transition-colors ${sig.isDefault
                          ? "border-[#0085FF] bg-[#F5FAFF]"
                          : "border-[#E1E4EA] bg-white hover:border-[#C9CFD8]"
                        }`}
                    >
                      {sig.isDefault && (
                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[#0085FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          <CheckCircle className="w-3 h-3" /> Default
                        </span>
                      )}
                      <div>
                        <div className="h-24 w-full flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 overflow-hidden">
                          <img
                            src={sig.dataUrl}
                            alt={sig.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="mt-3">
                          <h4 className="font-semibold text-[#1F2937] text-sm truncate">
                            {sig.name}
                          </h4>
                          <p className="text-xs text-[#99A0AE] capitalize mt-0.5">
                            {sig.type === "draw"
                              ? "Drawn"
                              : sig.type === "upload"
                                ? "Uploaded"
                                : "Typed"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-[#E1E4EA] pt-3">
                        {!sig.isDefault ? (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultSignature(sig.id)}
                            className="text-xs font-semibold text-[#0085FF] hover:underline"
                          >
                            Make default
                          </button>
                        ) : (
                          <span className="text-xs text-[#99A0AE]">
                            Current default
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSig(sig);
                              setSigModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-sky-50 hover:text-[#0085FF] transition-colors"
                            title="Edit signature"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSignature(sig.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            title="Delete signature"
                          >
                            <DeleteIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-[#E1E4EA] bg-[#FAFBFC]">
          <p className="text-[11px] text-[#99A0AE]">
            {tab === "signatures"
              ? "Signatures are shared across all document types."
              : `Applies to every ${docLabel.toLowerCase()} — existing and new alike — across preview, download and email.`}
          </p>
        </footer>
      </aside>

      {/* Rendered outside the transformed <aside> so its fixed positioning
          isn't trapped by the drawer's slide-in transform. */}
      <SignatureModal
        isOpen={sigModalOpen}
        initialData={editingSig}
        onClose={() => {
          setSigModalOpen(false);
          setEditingSig(null);
        }}
        onSave={handleSaveSignature}
      />
    </div>,
    document.body
  );
};

export default TemplateDrawer;
