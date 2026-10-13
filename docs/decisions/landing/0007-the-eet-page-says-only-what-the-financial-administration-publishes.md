# 0007 The EET page says only what the Financial Administration publishes

Status: accepted
Date: 2026-10-13

## Context

The EET page (landing/0006) tells merchants what the law asks of them. A
wrong statement there costs a merchant more than a wrong statement about
Payky: a missed deadline or an unrecorded sale. As of 2026-10-13 the law is
signed (17 September 2026) but its number in the Collection of Laws is not
known, eet.gov.cz is still filling in, and secondary sources (competitors,
consultancies) state things the official pages do not.

The facts used were checked on eet.gov.cz (harmonogram, kdo musí evidovat,
co je vyňato, jak začít, nastavení, evidence v praxi, chyby a jejich řešení,
praktické informace, EET OFF, dokumenty, the press release on the signed
law) and in the Financial Administration's Q&A "Dotazy k EET 2.0" of
5 May 2026.

## Decision

A statement about the law appears on the page only when eet.gov.cz or a
Financial Administration document says it. Where they are silent, the page
is silent too; where they disagree, the page uses the more cautious
wording. A statement about Payky appears only when the code does it, as
`docs/eet.md` describes. The page names its source and the date it was
checked, and says it is not tax advice.

## Open questions

Each item is something the page states loosely, leaves out, or could not
confirm. Settle it, then correct the copy and the date in
`landing.eet.source`.

1. **January 2027.** The press release calls it a "pilotní (dobrovolný)
   režim"; the harmonogram says "půjde však již o standardní evidenci".
   The page uses the harmonogram's wording. Whether January is voluntary,
   and what happens to a sale not recorded then, is open. The competitor's
   "support, not sanctions" is not stated officially and is not used.
2. **Sanctions.** No fine or other sanction is published on eet.gov.cz. The
   page names none. Fill in from the law once it is in the Collection of
   Laws, together with its number.
3. **Tips.** The page (and the app's settings) says a tip that is the
   business's income is part of the sale and a tip that belongs to
   employees need not be, and that a mandatory cover or service charge is
   not a tip. None of this was found on eet.gov.cz; only the related tax
   exemption of employees' tips in catering, up to 7 % of the employer's
   catering revenue, is confirmed (EY tax alert, May 2026). Needs the law's
   text or a tax adviser.
4. **Certificate validity.** The Q&A says "bude 1 rok" and that it may
   change with security recommendations; the developer material speaks of
   366 days. The page says one year.
5. **The certificate's password.** Whether DIS+ lets the merchant choose it
   or generates it is not stated. The page says the file comes "with its
   password".
6. **Tax credit.** Up to CZK 5,000, once, for individuals, in the period
   they start recording, capped by a formula over 15 % of the partial tax
   base. The page gives the maximum and says the rest depends on the law;
   the exact conditions are not on the page.
7. **Receipts under other laws.** eet.gov.cz says other rules (consumer
   protection, VAT) may require a document. The page's "when the customer
   asks for one" is our example, not the Administration's.
8. **Exemptions.** The page lists examples only and links to the full list.
9. **Crypto-assets.** The law counts them when paid in person; Payky
   reports a Lightning payment at its CZK price. Whether EET expects
   another valuation for crypto-assets is not stated.
10. **Response time.** eet.gov.cz describes a "doba odezvy" of at least 2
    seconds that the merchant sets on the device. Payky has no such
    setting and the page does not mention it; whether it is an obligation
    is not clear.
11. **One account, one recording unit.** Payky keeps one establishment id
    per account, so the page tells a merchant with more premises to create
    another account and says the same certificate works there, since a
    certificate is bound to the EIČ (Q&A, question 9). That one certificate
    signs for several units has not been tried against the playground.
12. **Production.** Payky reports to production only in a build with
    `VITE_PAYKY_EET_PRODUCTION_URL` (`resolveEetEnvironment`). Whether the
    deployed build has it could not be checked (no access to the Vercel
    project's environment from here). The page says production records for
    real, which must hold by 1 January 2027.
13. **English and Slovak terms.** DIS+, MOJE daně, "Online finanční úřad"
    and "Chci začít evidovat" are kept in Czech, as they appear on the
    portal; the translated names of the certificate and recording unit are
    ours, not official.

## Alternatives considered

Following the competitor's page where eet.gov.cz is silent: rejected, it
states things (no sanctions in January) that the official pages do not.

## Consequences

The page is less complete than it could be, and goes out of date: the date
in `landing.eet.source` says when it was last true, and each answered open
question means a copy change in all three languages.

## Enforced by

- `src/landing-server.test.tsx > renderLandingDocument > names where the EET page's facts come from`
