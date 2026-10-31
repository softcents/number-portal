/**
 * Subscriber Profile Field Mapper
 *
 * Transforms the platform's raw internal identity lookup profile
 * into a safe, sanitized prefill object for the ICC Add Subscriber form.
 *
 * Rules:
 * - The browser must never receive the full profile (tickets, audit logs,
 *   tenancy, kyc/kyb, etc.).
 * - Each form field takes the first non-empty candidate, checking both
 *   camelCase and snake_case representations.
 * - All strings are trimmed. Null, undefined, and "N/A" become "".
 * - Returns { prefill, filledFields } so the UI can badge auto-filled values.
 */

export interface AddressDetails {
  street: string;
  city: string;
  postalZip: string;
  country: string;
}

export interface SubscriberPrefill {
  subscriberName: string;
  connection: string;
  registrationDate: string;
  prefixA: string;
  prefixB: string;
  prefixC: string;
  subscriberType: string;
  authorizedPersonName: string;
  nationalIdNumber: string;
  passportNumber: string;
  phoneNumber: string;
  birthDate: string;
  gender: string;
  occupation: string;
  presentAddress: AddressDetails;
  permanentAddress: AddressDetails;
  presentStreet: string;
  presentCity: string;
  presentPostalZip: string;
  presentCountry: string;
  permanentStreet: string;
  permanentCity: string;
  permanentPostalZip: string;
  permanentCountry: string;
  billingAddress: string;
  validEmail: string;
  fatherName: string;
  motherName: string;
  spouseName: string;
  photoUrl?: string;
  documentUrl?: string;
  documentType?: "pdf" | "image" | null;
  documentBackUrl?: string;
  documentBackType?: "pdf" | "image" | null;
}

export interface SubscriberMappingResult {
  prefill: SubscriberPrefill;
  filledFields: string[];
}

function cleanValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  const lower = s.toLowerCase();
  if (
    lower === "n/a" ||
    lower === "na" ||
    lower === "none" ||
    lower === "null" ||
    lower === "undefined"
  ) {
    return "";
  }
  return s;
}

function getCandidate(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (k in rec) {
      const cleaned = cleanValue(rec[k]);
      if (cleaned !== "") return cleaned;
    }
  }
  return "";
}

function getDeepCandidate(obj: unknown, paths: string[][]): string {
  if (!obj || typeof obj !== "object") return "";
  for (const path of paths) {
    let curr: unknown = obj;
    for (const seg of path) {
      if (!curr || typeof curr !== "object") {
        curr = undefined;
        break;
      }
      curr = (curr as Record<string, unknown>)[seg];
    }
    const cleaned = cleanValue(curr);
    if (cleaned !== "") return cleaned;
  }
  return "";
}

function normalizeDate(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return "";
}

function normalizeGender(raw: string): "Male" | "Female" | "" {
  if (!raw) return "";
  const lower = raw.trim().toLowerCase();
  if (lower === "male" || lower === "m") return "Male";
  if (lower === "female" || lower === "f") return "Female";
  return "";
}

function normalizeSubscriberType(raw: string): "Individual" | "Company" | "" {
  if (!raw) return "";
  const upper = raw.trim().toUpperCase();
  if (upper === "COMPANY") return "Company";
  if (upper === "INDIVIDUAL") return "Individual";
  return "";
}

export function mapProfileToSubscriberForm(profile: unknown): SubscriberMappingResult {
  const p = (profile && typeof profile === "object" ? profile : {}) as Record<
    string,
    unknown
  >;

  const account = p.account as Record<string, unknown> | undefined;
  const personal = p.personalDetails as Record<string, unknown> | undefined;
  const reg = p.customerRegistration as Record<string, unknown> | undefined;

  // 1. Subscriber Type (INDIVIDUAL / COMPANY)
  const rawCustomerType =
    getCandidate(reg, ["customer_type", "customerType"]) ||
    getCandidate(personal, ["customer_type", "customerType"]);
  const subscriberType = normalizeSubscriberType(rawCustomerType);

  // 2. Subscriber Name
  // company_name if customer_type is COMPANY, else personalDetails.fullName, else firstName + lastName
  let subscriberName = "";
  if (subscriberType === "Company") {
    subscriberName =
      getCandidate(reg, ["company_name", "companyName"]) ||
      getCandidate(personal, ["company_name", "companyName"]);
  }
  if (!subscriberName) {
    subscriberName =
      getCandidate(personal, ["fullName", "full_name"]) ||
      getCandidate(reg, ["fullName", "full_name"]);
  }
  if (!subscriberName) {
    const firstName =
      getCandidate(personal, ["firstName", "first_name"]) ||
      getCandidate(reg, ["firstName", "first_name"]) ||
      getDeepCandidate(account, [["profile", "first_name"], ["profile", "firstName"]]);
    const lastName =
      getCandidate(personal, ["lastName", "last_name"]) ||
      getCandidate(reg, ["lastName", "last_name"]) ||
      getDeepCandidate(account, [["profile", "last_name"], ["profile", "lastName"]]);
    const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (combined) {
      subscriberName = combined;
    }
  }

  // 3. Authorized Person Name
  const authorizedPersonName =
    getCandidate(reg, ["authorized_person_name", "authorizedPersonName"]) ||
    getCandidate(personal, ["authorized_person_name", "authorizedPersonName"]);

  // 4. National ID Number & Passport Number
  const rawNidPassport =
    getCandidate(reg, ["nid_passport_number", "nidPassportNumber"]) ||
    getCandidate(personal, ["nidPassportNumber", "nid_passport_number"]);

  let nationalIdNumber = "";
  let passportNumber = "";
  if (rawNidPassport) {
    const stripped = rawNidPassport.replace(/[\s-]/g, "");
    const isDigitsOnly = /^\d+$/.test(stripped);
    const isNidLen =
      stripped.length === 10 || stripped.length === 13 || stripped.length === 17;
    if (isDigitsOnly && isNidLen) {
      nationalIdNumber = stripped;
    } else {
      passportNumber = rawNidPassport;
    }
  }

  // 5. Phone Number
  const phoneNumber =
    getCandidate(personal, ["contactPhone", "contact_phone"]) ||
    getCandidate(personal, ["phoneNumber", "phone_number"]) ||
    getCandidate(personal, ["profilePhoneNumber", "profile_phone_number"]) ||
    getDeepCandidate(account, [["profile", "phone_number"], ["profile", "phoneNumber"]]) ||
    getCandidate(reg, ["contactPhone", "contact_phone", "phoneNumber", "phone_number"]);

  // 6. Birth Date
  const rawDob =
    getCandidate(personal, ["dateOfBirth", "date_of_birth"]) ||
    getCandidate(reg, ["date_of_birth", "dateOfBirth"]);
  const birthDate = normalizeDate(rawDob);

  // 7. Gender
  const rawGender =
    getCandidate(personal, ["gender"]) || getCandidate(reg, ["gender"]);
  const gender = normalizeGender(rawGender);

  // 8. Present Address
  const presentStreet = getCandidate(reg, ["present_street", "presentStreet"]);
  const presentCity = getCandidate(reg, ["present_city", "presentCity"]);
  const presentPostalZip = getCandidate(reg, [
    "present_postal_code",
    "presentPostalCode",
    "present_zip",
    "presentZip",
  ]);
  const presentCountry = getCandidate(reg, ["present_country", "presentCountry"]);

  // 9. Permanent Address (check same_as_present_address)
  const isSameAsPresent =
    reg?.["same_as_present_address"] === true ||
    reg?.["sameAsPresentAddress"] === true ||
    String(reg?.["same_as_present_address"]).toLowerCase() === "true" ||
    String(reg?.["sameAsPresentAddress"]).toLowerCase() === "true";

  let permanentStreet = "";
  let permanentCity = "";
  let permanentPostalZip = "";
  let permanentCountry = "";

  if (isSameAsPresent) {
    permanentStreet = presentStreet;
    permanentCity = presentCity;
    permanentPostalZip = presentPostalZip;
    permanentCountry = presentCountry;
  } else {
    permanentStreet = getCandidate(reg, ["permanent_street", "permanentStreet"]);
    permanentCity = getCandidate(reg, ["permanent_city", "permanentCity"]);
    permanentPostalZip = getCandidate(reg, [
      "permanent_postal_code",
      "permanentPostalCode",
      "permanent_zip",
      "permanentZip",
    ]);
    permanentCountry = getCandidate(reg, ["permanent_country", "permanentCountry"]);
  }

  // 10. Valid Email
  const validEmail =
    getCandidate(personal, ["contactEmail", "contact_email"]) ||
    getCandidate(personal, ["email"]) ||
    getCandidate(personal, ["accountEmail", "account_email"]) ||
    getCandidate(account, ["email"]) ||
    getCandidate(reg, ["contactEmail", "contact_email", "email"]);

  // 11. Parents
  const fatherName =
    getCandidate(personal, ["fatherName", "father_name"]) ||
    getCandidate(reg, ["fatherName", "father_name"]);
  const motherName =
    getCandidate(personal, ["motherName", "mother_name"]) ||
    getCandidate(reg, ["motherName", "mother_name"]);

  // 12. Optional & additional candidate fields
  const connection =
    getCandidate(reg, ["connection", "connectionType", "connection_type"]);
  const prefixA = getCandidate(reg, ["prefix_a", "prefixA"]);
  const prefixB = getCandidate(reg, ["prefix_b", "prefixB"]);
  const prefixC = getCandidate(reg, ["prefix_c", "prefixC"]);
  const rawOccupation =
    getCandidate(personal, ["occupation", "profession"]) ||
    getCandidate(reg, ["occupation", "profession", "company_position"]);
  const rawSpouse =
    getCandidate(personal, ["spouseName", "spouse_name"]) ||
    getCandidate(reg, ["spouseName", "spouse_name"]);

  // 13. Registration Date (only flagged as filled if received from API)
  const rawRegDate =
    getCandidate(reg, ["registration_date", "registrationDate"]) ||
    getCandidate(personal, ["registration_date", "registrationDate"]);
  const registrationDate = rawRegDate
    ? normalizeDate(rawRegDate)
    : new Date().toISOString().split("T")[0];

  // 14. Billing Address (default "Present", only flagged if received from API)
  const rawBilling = getCandidate(reg, ["billing_address", "billingAddress"]);
  const billingAddress = rawBilling || "Present";

  // Build filledFields list — strictly fields brought in with this API call
  const filledFields: string[] = [];
  if (subscriberName) filledFields.push("subscriberName");
  if (subscriberType) filledFields.push("subscriberType");
  if (authorizedPersonName) filledFields.push("authorizedPersonName");
  if (nationalIdNumber) filledFields.push("nationalIdNumber");
  if (passportNumber) filledFields.push("passportNumber");
  if (phoneNumber) filledFields.push("phoneNumber");
  if (birthDate) filledFields.push("birthDate");
  if (gender) filledFields.push("gender");
  if (rawOccupation) filledFields.push("occupation");
  if (connection) filledFields.push("connection");
  if (prefixA || prefixB || prefixC) filledFields.push("prefix");
  if (presentStreet) {
    filledFields.push("presentStreet");
    filledFields.push("presentAddress.street");
  }
  if (presentCity) {
    filledFields.push("presentCity");
    filledFields.push("presentAddress.city");
  }
  if (presentPostalZip) {
    filledFields.push("presentPostalZip");
    filledFields.push("presentAddress.postalZip");
  }
  if (presentCountry) {
    filledFields.push("presentCountry");
    filledFields.push("presentAddress.country");
  }
  if (permanentStreet) {
    filledFields.push("permanentStreet");
    filledFields.push("permanentAddress.street");
  }
  if (permanentCity) {
    filledFields.push("permanentCity");
    filledFields.push("permanentAddress.city");
  }
  if (permanentPostalZip) {
    filledFields.push("permanentPostalZip");
    filledFields.push("permanentAddress.postalZip");
  }
  if (permanentCountry) {
    filledFields.push("permanentCountry");
    filledFields.push("permanentAddress.country");
  }
  if (validEmail) filledFields.push("validEmail");
  if (fatherName) filledFields.push("fatherName");
  if (motherName) filledFields.push("motherName");
  if (rawSpouse) filledFields.push("spouseName");
  if (rawRegDate) filledFields.push("registrationDate");
  if (rawBilling) filledFields.push("billingAddress");

  const prefill: SubscriberPrefill = {
    subscriberName,
    connection,
    registrationDate,
    prefixA,
    prefixB,
    prefixC,
    subscriberType,
    authorizedPersonName,
    nationalIdNumber,
    passportNumber,
    phoneNumber,
    birthDate,
    gender,
    occupation: rawOccupation,
    presentAddress: {
      street: presentStreet,
      city: presentCity,
      postalZip: presentPostalZip,
      country: presentCountry,
    },
    permanentAddress: {
      street: permanentStreet,
      city: permanentCity,
      postalZip: permanentPostalZip,
      country: permanentCountry,
    },
    presentStreet,
    presentCity,
    presentPostalZip,
    presentCountry,
    permanentStreet,
    permanentCity,
    permanentPostalZip,
    permanentCountry,
    billingAddress,
    validEmail,
    fatherName,
    motherName,
    spouseName: rawSpouse,
  };

  return { prefill, filledFields };
}

export function createEmptyPrefill(
  nid: string = "",
  dob: string = ""
): SubscriberPrefill {
  return {
    subscriberName: "",
    connection: "",
    registrationDate: new Date().toISOString().split("T")[0],
    prefixA: "",
    prefixB: "",
    prefixC: "",
    subscriberType: "",
    authorizedPersonName: "",
    nationalIdNumber: nid,
    passportNumber: "",
    phoneNumber: "",
    birthDate: dob,
    gender: "",
    occupation: "",
    presentAddress: {
      street: "",
      city: "",
      postalZip: "",
      country: "",
    },
    permanentAddress: {
      street: "",
      city: "",
      postalZip: "",
      country: "",
    },
    presentStreet: "",
    presentCity: "",
    presentPostalZip: "",
    presentCountry: "",
    permanentStreet: "",
    permanentCity: "",
    permanentPostalZip: "",
    permanentCountry: "",
    billingAddress: "Present",
    validEmail: "",
    fatherName: "",
    motherName: "",
    spouseName: "",
  };
}
