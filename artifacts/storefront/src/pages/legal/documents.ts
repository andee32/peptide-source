import { brand } from "@/lib/brand";
import { legalDocumentReviewStatus } from "./status";

/**
 * Storefront legal documents.
 *
 * These are the operator-facing baseline. The wording is drafted to match what
 * the platform actually does (RUO attestation per order, crypto/ACH/wire/Zelle
 * rails, per-lot COAs, no card rail) rather than boilerplate copied from a
 * consumer store — but it is NOT counsel-approved. Review status lives in
 * ./status.ts, which renders a visible draft notice here and fails a production
 * build (the same fail-closed posture the server applies to ATTESTATION_TEXT).
 *
 * When counsel returns copy: replace the `sections`, bump `lastUpdated`, and
 * clear the slug's flag in ./status.ts. Do not clear it without the copy.
 */

export type LegalSection = {
  heading: string;
  /** Paragraphs. Rendered in order; no markup is interpreted. */
  body: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
};

export type LegalDocument = {
  slug: string;
  title: string;
  /** Short line under the title, used for SEO and the page lede. */
  summary: string;
  lastUpdated: string;
  sections: LegalSection[];
};

const RUO_LINE =
  "All products are supplied for in-vitro laboratory research use only. They are not drugs, not dietary supplements, and not for human or veterinary diagnostic, therapeutic or personal use.";

const contactSection = (): LegalSection => ({
  heading: "Contact",
  body: [
    `${brand.legalName} operates this store. Questions about this document can be sent to ${brand.supportEmail}.`,
    ...(brand.postalAddress ? [brand.postalAddress] : []),
    ...(brand.supportPhone ? [`Telephone: ${brand.supportPhone}`] : []),
  ],
});

export const legalDocuments: LegalDocument[] = [
  {
    slug: "terms",
    title: "Terms of Use",
    summary: `The agreement between you and ${brand.legalName} when you use this store.`,
    lastUpdated: "Draft",
    sections: [
      {
        heading: "Acceptance",
        body: [
          `By acknowledging the research-use gate, placing an order, or opening a wholesale account with ${brand.legalName}, you agree to these Terms of Use, the Research Use Only Policy, and the Privacy Policy. If you do not agree, do not use this store.`,
        ],
      },
      {
        heading: "Eligibility",
        body: [
          "You must be of legal age in your jurisdiction and able to enter a binding contract. Wholesale accounts are additionally limited to businesses and research organisations that pass our review, and are approved at our discretion.",
        ],
      },
      {
        heading: "Research use only",
        body: [
          RUO_LINE,
          "Every order requires a Research Use Only attestation, which is recorded with your order as the compliance record of that purchase. Submitting an attestation you know to be untrue is a breach of these Terms and grounds for immediate cancellation and refusal of future orders.",
        ],
      },
      {
        heading: "Your responsibilities",
        body: [
          "You are responsible for confirming that your receipt, storage, handling, use and any onward transfer of these materials is lawful where you are, and for holding any licence or registration your activity requires.",
        ],
        bullets: [
          "Provide accurate purchaser, recipient and shipping information",
          "Use and store materials only in a suitable laboratory setting",
          "Do not resell, relabel or redistribute except as expressly permitted for an approved wholesale account",
          "Do not represent these materials as approved, prescribable, or fit for human or animal use",
        ],
      },
      {
        heading: "Pricing, orders and payment",
        body: [
          "All prices are set and calculated by us at order time; a submitted order is an offer that we may accept or decline. Wholesale pricing resolves from the tier assigned to your approved account.",
          "Accepted payment rails are shown at checkout and may include cryptocurrency, ACH, wire and (for approved wholesale accounts) Zelle. We do not accept card payments. Cryptocurrency payment addresses are issued only through the order page — treat any address received by any other channel as fraudulent.",
        ],
      },
      {
        heading: "Certificates of analysis",
        body: [
          "Where a certificate of analysis is published for a lot, it reports the testing performed on that lot and nothing more. It is not a representation of suitability for any particular use, and it is not a statement that the material is safe or effective in humans or animals.",
        ],
      },
      {
        heading: "No advice",
        body: [
          "Nothing on this site or from our team is medical, dosing, clinical, veterinary, legal or regulatory advice, and no part of it should be read as instructions for administering anything to a person or an animal.",
        ],
      },
      {
        heading: "Suspension and termination",
        body: [
          "We may refuse, cancel or reverse any order, and suspend or close any account, where we believe these Terms, the Research Use Only Policy, or applicable law have been or would be breached. We may do so without notice.",
        ],
      },
      {
        heading: "Disclaimers and limitation of liability",
        body: [
          'Materials and this site are provided "as is" without warranties of any kind to the fullest extent permitted by law, including any implied warranty of merchantability or fitness for a particular purpose.',
          "To the fullest extent permitted by law, our total liability arising out of or relating to an order is limited to the amount paid for that order, and we are not liable for indirect, incidental, special or consequential damages. Nothing here limits liability that cannot lawfully be limited.",
        ],
      },
      {
        heading: "Indemnity",
        body: [
          "You agree to indemnify and hold us harmless against claims, losses and expenses arising from your use, handling, resale or onward transfer of materials purchased from us, or from any breach of these Terms.",
        ],
      },
      {
        heading: "Governing law and disputes",
        body: [
          brand.governingLaw
            ? `These Terms are governed by the laws of ${brand.governingLaw}, without regard to its conflict-of-law rules.`
            : "The governing jurisdiction for these Terms has not yet been configured for this deployment.",
        ],
      },
      {
        heading: "Changes",
        body: [
          "We may update these Terms. The revision date appears at the top of this page, and continued use after a change means you accept the updated Terms.",
        ],
      },
      contactSection(),
    ],
  },
  {
    slug: "ruo-policy",
    title: "Research Use Only Policy",
    summary:
      "What research use only means here, and what we require of every purchaser.",
    lastUpdated: "Draft",
    sections: [
      {
        heading: "The rule",
        body: [
          RUO_LINE,
          "This is not a disclaimer bolted onto a consumer store. It is the condition on which we sell, and it is enforced at the point of purchase.",
        ],
      },
      {
        heading: "How we enforce it",
        body: [
          "Access to either channel requires acknowledging the research-use gate. Every order additionally requires a signed Research Use Only attestation, which we store with the order — including the exact text you affirmed, the version of that text, the name you signed, and the time of signing — as the compliance record for that purchase.",
        ],
      },
      {
        heading: "What we do not do",
        body: [
          "We do not publish human dosing, administration or reconstitution instructions, we do not describe expected effects in humans or animals, we do not supply injection or reconstitution consumables alongside research materials, and we do not answer questions about personal use. Requests of that kind are declined rather than answered.",
        ],
      },
      {
        heading: "Prohibited uses",
        body: ["The following are prohibited and will end the relationship:"],
        bullets: [
          "Administration to, or use in or on, any human or animal",
          "Resale or supply to any person you believe intends human or animal use",
          "Relabelling, repackaging or presenting materials as approved, prescribable, compounded or therapeutic",
          "Any use requiring a licence, registration or approval you do not hold",
        ],
      },
      {
        heading: "Reporting a concern",
        body: [
          `If you believe material sold by us is being marketed or used outside this policy, tell us at ${brand.supportEmail}.`,
        ],
      },
      contactSection(),
    ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    summary: "What we collect, why, who we share it with, and your choices.",
    lastUpdated: "Draft",
    sections: [
      {
        heading: "What we collect",
        body: ["We collect what you give us and what your order requires:"],
        bullets: [
          "Contact and identity details: name, email address, and the name signed on your research-use attestation",
          "Order details: items, prices, payment rail, shipping address and order history",
          "Wholesale application details, including business identifiers you submit for review",
          "Account credentials, stored as a hash — never in readable form",
          "Compliance records: the attestation text you affirmed, with the IP address and browser user agent captured at signing",
          "Optional, consent-gated product analytics, which are off until you accept them",
        ],
      },
      {
        heading: "Why we use it",
        body: [
          "To take and fulfil orders, to verify and administer wholesale accounts, to send transactional email about your orders, to keep the compliance record each order requires, to prevent fraud and abuse, and to meet our legal obligations.",
        ],
      },
      {
        heading: "Analytics and cookies",
        body: [
          "Strictly necessary cookies keep your session, cart and gate acknowledgement working. Product analytics load only after you accept them, and you can decline or withdraw at any time — declining leaves the store fully usable. We do not run advertising or social-media tracking pixels on this store.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          "Only the service providers an order needs, each limited to its role: payment processing (cryptocurrency payment infrastructure, and our bank for ACH, wire and Zelle), email delivery, hosting and database infrastructure, fulfilment and carriers, and — where you have consented — product analytics. We do not sell personal information, and we do not share it for cross-context behavioural advertising.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Order and attestation records are kept for as long as needed to meet our legal and record-keeping obligations, because the attestation is the compliance record of the sale. Other data is kept only as long as it serves the purpose it was collected for.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          `Depending on where you live, you may have the right to access, correct, delete or port your personal information, to opt out of its sale or sharing, and not to be discriminated against for exercising those rights. Write to ${brand.supportEmail} and we will verify and respond within the period the applicable law allows. Where a request would require us to delete a compliance record we are obliged to keep, we will tell you which records we are retaining and why.`,
        ],
      },
      {
        heading: "Security",
        body: [
          "Access to personal data is limited to what running the business requires, credentials are stored hashed, and payment credentials are never held by us. No system is perfectly secure and we do not claim otherwise.",
        ],
      },
      {
        heading: "Minors",
        body: [
          "This store is not intended for minors and we do not knowingly collect their information.",
        ],
      },
      contactSection(),
    ],
  },
  {
    slug: "refunds",
    title: "Returns & Refunds",
    summary: "When an order can be changed, cancelled or refunded.",
    lastUpdated: "Draft",
    sections: [
      {
        heading: "Before payment settles",
        body: [
          "An unpaid order can be cancelled at any time — simply do not pay it, or ask us to void it. Unpaid orders expire on their own.",
        ],
      },
      {
        heading: "After payment settles",
        body: [
          "Because these are temperature- and handling-sensitive research materials, we cannot accept returns of shipped product for resale, and opened or unsealed items cannot be returned at all. If an order has not yet shipped, contact us and we will cancel and refund it where we still can.",
        ],
      },
      {
        heading: "If something is wrong with your order",
        body: [
          `Tell us within 7 days of delivery at ${brand.supportEmail} and include your order number and photographs. If we shipped the wrong item, an item is damaged in transit, or a lot does not match its published certificate of analysis, we will replace it or refund it.`,
        ],
      },
      {
        heading: "How refunds are paid",
        body: [
          "Refunds are returned on the rail you paid on wherever possible. Cryptocurrency refunds are sent to an address you confirm with us and are settled at the value of the payment we received, not at the rate on the day of the refund — network fees are deducted. ACH and wire refunds are returned to the originating account.",
        ],
      },
      {
        heading: "Chargebacks",
        body: [
          "We would rather resolve an issue directly than have it disputed. Contact us first; we answer refund requests before we defend them.",
        ],
      },
      contactSection(),
    ],
  },
  {
    slug: "shipping",
    title: "Shipping Policy",
    summary: "Where we ship, how fast, and what we cannot ship.",
    lastUpdated: "Draft",
    sections: [
      {
        heading: "Where we ship",
        body: [
          "We ship to destinations on our current permitted list, which we maintain by state and country and change as legal advice requires. If your destination is not permitted, checkout will tell you before you pay rather than after. We do not ship to destinations we are not permitted to serve, and we cannot make exceptions.",
        ],
      },
      {
        heading: "Processing and transit",
        body: [
          "Orders are released for fulfilment once payment settles. Cryptocurrency payments settle on network confirmation; ACH, wire and Zelle settle when funds arrive. Made-to-order items ship on the lead time shown on the product.",
        ],
      },
      {
        heading: "Packaging and labelling",
        body: [
          "Outer packaging is plain to protect your privacy. Inner labelling is complete and accurate, states research use only, and identifies the lot so it can be matched to its certificate of analysis. We do not misdeclare contents to carriers.",
        ],
      },
      {
        heading: "Title, risk and receipt",
        body: [
          "Risk of loss passes on delivery to the address you gave us. Inspect your shipment on arrival and tell us within 7 days if anything is damaged, missing or incorrect.",
        ],
      },
      {
        heading: "Refused and undeliverable shipments",
        body: [
          "Shipments refused at delivery or returned as undeliverable cannot be restocked and are not refundable, because we cannot verify how the material was handled while it was out of our control.",
        ],
      },
      contactSection(),
    ],
  },
];

export function findLegalDocument(slug: string): LegalDocument | undefined {
  return legalDocuments.find((doc) => doc.slug === slug);
}

export function isPendingReview(slug: string): boolean {
  return legalDocumentReviewStatus[slug] === true;
}

/** Footer/gate navigation order. */
export const legalNav = legalDocuments.map(({ slug, title }) => ({
  href: `/legal/${slug}`,
  label: title,
}));
