"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { SubscriberPrefill } from "@/lib/subscriberMapper";

export interface SubscriberFormProps {
  initialData: SubscriberPrefill;
  filledFields: string[];
  onBackToSearch: () => void;
  onSave?: (formValues: SubscriberFormValues) => void;
}

export interface SubscriberFormValues {
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
  provider?: string;
  photo?: Blob | File | null;
  document?: Blob | File | null;
  documentBack?: Blob | File | null;
}

export type FormFileState =
  | { source: "platform"; url: string }
  | { source: "upload"; file: File | Blob; name: string }
  | null;

/**
 * Crop and resize an image file to exactly 300x300 pixels in the browser.
 * Uses a canvas with cover-crop (aspect-fill) centering horizontally at 50%
 * and vertically at 40% from top (favouring the upper face area).
 * Output format: JPEG quality 0.9.
 *
 * @param file - The user-uploaded image file
 * @returns Promise<Blob> - The 300x300 JPEG Blob
 */
export function cropAndResizePhotoTo300(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return reject(new Error("Canvas context is not available"));
      }

      // White background for transparent PNG / WebP
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 300, 300);

      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      const targetAspect = 1.0;
      const origAspect = origW / origH;

      let srcX = 0;
      let srcY = 0;
      let srcW = origW;
      let srcH = origH;

      if (origAspect > targetAspect) {
        // Wider than square: crop width, centered at 50%
        srcW = origH * targetAspect;
        srcX = (origW - srcW) * 0.5;
      } else if (origAspect < targetAspect) {
        // Taller than square: crop height, centered at 40% from top
        srcH = origW / targetAspect;
        srcY = (origH - srcH) * 0.4;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 300, 300);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas failed to create JPEG blob"));
          }
        },
        "image/jpeg",
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for cropping"));
    };
    img.src = objectUrl;
  });
}

function extractFormValues(prefill: SubscriberPrefill): SubscriberFormValues {
  return {
    subscriberName: prefill.subscriberName ?? "",
    connection: prefill.connection ?? "",
    registrationDate: prefill.registrationDate ?? "",
    prefixA: prefill.prefixA ?? "",
    prefixB: prefill.prefixB ?? "",
    prefixC: prefill.prefixC ?? "",
    subscriberType: prefill.subscriberType ?? "",
    authorizedPersonName: prefill.authorizedPersonName ?? "",
    nationalIdNumber: prefill.nationalIdNumber ?? "",
    passportNumber: prefill.passportNumber ?? "",
    phoneNumber: prefill.phoneNumber ?? "",
    birthDate: prefill.birthDate ?? "",
    gender: prefill.gender ?? "",
    occupation: prefill.occupation ?? "",
    presentStreet: prefill.presentStreet ?? prefill.presentAddress?.street ?? "",
    presentCity: prefill.presentCity ?? prefill.presentAddress?.city ?? "",
    presentPostalZip:
      prefill.presentPostalZip ?? prefill.presentAddress?.postalZip ?? "",
    presentCountry:
      prefill.presentCountry ?? prefill.presentAddress?.country ?? "",
    permanentStreet:
      prefill.permanentStreet ?? prefill.permanentAddress?.street ?? "",
    permanentCity:
      prefill.permanentCity ?? prefill.permanentAddress?.city ?? "",
    permanentPostalZip:
      prefill.permanentPostalZip ?? prefill.permanentAddress?.postalZip ?? "",
    permanentCountry:
      prefill.permanentCountry ?? prefill.permanentAddress?.country ?? "",
    billingAddress: prefill.billingAddress || "Present",
    validEmail: prefill.validEmail ?? "",
    fatherName: prefill.fatherName ?? "",
    motherName: prefill.motherName ?? "",
    spouseName: prefill.spouseName ?? "",
    provider: "ICC",
  };
}

// Address group keys — used to route entire sections as one unit
const ADDRESS_PRESENT_KEYS = [
  "presentStreet",
  "presentCity",
  "presentPostalZip",
  "presentCountry",
];
const ADDRESS_PERMANENT_KEYS = [
  "permanentStreet",
  "permanentCity",
  "permanentPostalZip",
  "permanentCountry",
];

export default function SubscriberForm({
  initialData,
  filledFields,
  onBackToSearch,
  onSave,
}: SubscriberFormProps) {
  const [formData, setFormData] = useState<SubscriberFormValues>(() =>
    extractFormValues(initialData)
  );

  // Track which fields are still considered auto-filled (badge display)
  const [activeAutoFilled, setActiveAutoFilled] = useState<Set<string>>(
    () => new Set(filledFields)
  );

  // Stable set of auto-filled keys from the current API response
  const filledSet = useMemo(() => new Set(filledFields), [filledFields]);
  const isAutoFilled = (key: string) => filledSet.has(key);

  // Address sections: only route to review step if ALL sub-fields are filled
  const presentAddressAutoFilled = ADDRESS_PRESENT_KEYS.every((k) =>
    filledSet.has(k)
  );
  const permanentAddressAutoFilled = ADDRESS_PERMANENT_KEYS.every((k) =>
    filledSet.has(k)
  );

  // Two-step state: "manual" = first view (fields not auto-filled), "review" = second view (auto-filled)
  const [phase, setPhase] = useState<"manual" | "review">(() => {
    const pAuto = ADDRESS_PRESENT_KEYS.every((k) => filledFields.includes(k));
    const permAuto = ADDRESS_PERMANENT_KEYS.every((k) => filledFields.includes(k));
    const allKeys = [
      "subscriberName",
      "subscriberType",
      "authorizedPersonName",
      "nationalIdNumber",
      "passportNumber",
      "phoneNumber",
      "birthDate",
      "gender",
      "occupation",
      "connection",
      "registrationDate",
      "prefix",
      "validEmail",
      "billingAddress",
      "fatherName",
      "motherName",
      "spouseName",
    ];
    const hasUnfilled =
      allKeys.some((k) => !filledFields.includes(k)) || !pAuto || !permAuto;
    return hasUnfilled ? "manual" : "review";
  });

  const [errors, setErrors] = useState<
    Partial<Record<keyof SubscriberFormValues, string>>
  >({});
  const [isSuccess, setIsSuccess] = useState(false);

  // File state: { source: "platform", url } or { source: "upload", file, name }
  const [photoFile, setPhotoFile] = useState<FormFileState>(() =>
    initialData.photoUrl ? { source: "platform", url: initialData.photoUrl } : null
  );
  const [documentFile, setDocumentFile] = useState<FormFileState>(() =>
    initialData.documentUrl ? { source: "platform", url: initialData.documentUrl } : null
  );
  const [documentType, setDocumentType] = useState<"pdf" | "image" | null>(() =>
    initialData.documentType ?? (initialData.documentUrl ? "pdf" : null)
  );

  const [documentBackFile, setDocumentBackFile] = useState<FormFileState>(() =>
    initialData.documentBackUrl ? { source: "platform", url: initialData.documentBackUrl } : null
  );
  const [documentBackType, setDocumentBackType] = useState<"pdf" | "image" | null>(() =>
    initialData.documentBackType ?? (initialData.documentBackUrl ? "pdf" : null)
  );

  const [photoLoading, setPhotoLoading] = useState<boolean>(() => Boolean(initialData.photoUrl));
  const [photoError, setPhotoError] = useState<boolean>(false);
  const [photoUploadError, setPhotoUploadError] = useState<string>("");

  const [docLoading, setDocLoading] = useState<boolean>(() => Boolean(initialData.documentUrl));
  const [docError, setDocError] = useState<boolean>(false);
  const [docUploadError, setDocUploadError] = useState<string>("");

  const [docBackLoading, setDocBackLoading] = useState<boolean>(() => Boolean(initialData.documentBackUrl));
  const [docBackError, setDocBackError] = useState<boolean>(false);
  const [docBackUploadError, setDocBackUploadError] = useState<string>("");

  const imageInputRef = useRef<HTMLInputElement>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  const idBackInputRef = useRef<HTMLInputElement>(null);

  // Object URLs for uploaded blobs to preview
  const [photoBlobUrl, setPhotoBlobUrl] = useState<string | null>(null);
  const [docBlobUrl, setDocBlobUrl] = useState<string | null>(null);
  const [docBackBlobUrl, setDocBackBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (photoFile && photoFile.source === "upload") {
      const url = URL.createObjectURL(photoFile.file);
      setPhotoBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPhotoBlobUrl(null);
    }
  }, [photoFile]);

  useEffect(() => {
    if (documentFile && documentFile.source === "upload") {
      const url = URL.createObjectURL(documentFile.file);
      setDocBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setDocBlobUrl(null);
    }
  }, [documentFile]);

  useEffect(() => {
    if (documentBackFile && documentBackFile.source === "upload") {
      const url = URL.createObjectURL(documentBackFile.file);
      setDocBackBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setDocBackBlobUrl(null);
    }
  }, [documentBackFile]);

  // Synchronize file state when initialData changes
  useEffect(() => {
    setFormData(extractFormValues(initialData));
    setActiveAutoFilled(new Set(filledFields));
    if (initialData.photoUrl) {
      setPhotoFile({ source: "platform", url: initialData.photoUrl });
      setPhotoLoading(true);
      setPhotoError(false);
    } else {
      setPhotoFile(null);
      setPhotoLoading(false);
      setPhotoError(false);
    }
    if (initialData.documentUrl) {
      setDocumentFile({ source: "platform", url: initialData.documentUrl });
      setDocumentType(initialData.documentType ?? "pdf");
      setDocLoading(false);
      setDocError(false);
    } else {
      setDocumentFile(null);
      setDocumentType(null);
      setDocLoading(false);
      setDocError(false);
    }
    if (initialData.documentBackUrl) {
      setDocumentBackFile({ source: "platform", url: initialData.documentBackUrl });
      setDocumentBackType(initialData.documentBackType ?? "pdf");
      setDocBackLoading(false);
      setDocBackError(false);
    } else {
      setDocumentBackFile(null);
      setDocumentBackType(null);
      setDocBackLoading(false);
      setDocBackError(false);
    }
  }, [initialData, filledFields]);

  const handleChange = (field: keyof SubscriberFormValues, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "phoneNumber") {
        const clean = value.replace(/\D/g, "");
        if (clean.startsWith("09644") || clean.startsWith("8809644")) {
          next.provider = "ICON";
        } else if (clean.startsWith("09617") || clean.startsWith("8809617")) {
          next.provider = "RANKSITT";
        } else if (clean.startsWith("09639") || clean.startsWith("8809639")) {
          next.provider = "ICC";
        }
      }
      return next;
    });
    setActiveAutoFilled((prev) => {
      if (prev.has(field)) {
        const next = new Set(prev);
        next.delete(field);
        return next;
      }
      return prev;
    });
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoUploadError("Please select a valid image file (JPEG, PNG, or WebP).");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setPhotoUploadError("Image file size must be 10 MB or less.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }

    setPhotoUploadError("");
    setPhotoLoading(true);
    setPhotoError(false);

    try {
      const resizedBlob = await cropAndResizePhotoTo300(file);
      // Replacing the photo removes the VERIFIED badge
      setActiveAutoFilled((prev) => {
        const next = new Set(prev);
        next.delete("photo");
        return next;
      });
      setPhotoFile({
        source: "upload",
        file: resizedBlob,
        name: file.name,
      });
      setPhotoLoading(false);
    } catch (err) {
      console.error("Photo processing failed:", err);
      setPhotoLoading(false);
      setPhotoUploadError("Failed to process image. Please try another file.");
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoLoading(false);
    setPhotoError(false);
    setPhotoUploadError("");
    setActiveAutoFilled((prev) => {
      const next = new Set(prev);
      next.delete("photo");
      return next;
    });
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImg = file.type.startsWith("image/");

    if (!isPdf && !isImg) {
      setDocUploadError("Please select a PDF document or image file.");
      if (idInputRef.current) idInputRef.current.value = "";
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setDocUploadError("Document file size must be 15 MB or less.");
      if (idInputRef.current) idInputRef.current.value = "";
      return;
    }

    setDocUploadError("");
    setDocLoading(false);
    setDocError(false);

    // Replacing the document removes the VERIFIED badge
    setActiveAutoFilled((prev) => {
      const next = new Set(prev);
      next.delete("document");
      return next;
    });

    setDocumentFile({
      source: "upload",
      file,
      name: file.name,
    });
    setDocumentType(isPdf ? "pdf" : "image");
  };

  const handleRemoveDocument = () => {
    setDocumentFile(null);
    setDocLoading(false);
    setDocError(false);
    setDocUploadError("");
    setActiveAutoFilled((prev) => {
      const next = new Set(prev);
      next.delete("document");
      return next;
    });
    if (idInputRef.current) idInputRef.current.value = "";
  };

  const handleIdBackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImg = file.type.startsWith("image/");

    if (!isPdf && !isImg) {
      setDocBackUploadError("Please select a PDF document or image file.");
      if (idBackInputRef.current) idBackInputRef.current.value = "";
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setDocBackUploadError("Document file size must be 15 MB or less.");
      if (idBackInputRef.current) idBackInputRef.current.value = "";
      return;
    }

    setDocBackUploadError("");
    setDocBackLoading(false);
    setDocBackError(false);

    // Replacing the back document removes the VERIFIED badge
    setActiveAutoFilled((prev) => {
      const next = new Set(prev);
      next.delete("documentBack");
      return next;
    });

    setDocumentBackFile({
      source: "upload",
      file,
      name: file.name,
    });
    setDocumentBackType(isPdf ? "pdf" : "image");
  };

  const handleRemoveDocumentBack = () => {
    setDocumentBackFile(null);
    setDocBackLoading(false);
    setDocBackError(false);
    setDocBackUploadError("");
    setActiveAutoFilled((prev) => {
      const next = new Set(prev);
      next.delete("documentBack");
      return next;
    });
    if (idBackInputRef.current) idBackInputRef.current.value = "";
  };

  const handleReset = () => {
    setFormData(extractFormValues(initialData));
    setActiveAutoFilled(new Set(filledFields));
    setErrors({});
    setIsSuccess(false);
    setPhotoUploadError("");
    setDocUploadError("");
    setDocBackUploadError("");
    setPhotoError(false);
    setDocError(false);
    setDocBackError(false);

    // RESET restores both auto-filled photo and front/back documents
    if (initialData.photoUrl) {
      setPhotoFile({ source: "platform", url: initialData.photoUrl });
      setPhotoLoading(true);
    } else {
      setPhotoFile(null);
      setPhotoLoading(false);
    }

    if (initialData.documentUrl) {
      setDocumentFile({ source: "platform", url: initialData.documentUrl });
      setDocumentType(initialData.documentType ?? "pdf");
      setDocLoading(false);
    } else {
      setDocumentFile(null);
      setDocumentType(null);
      setDocLoading(false);
    }

    if (initialData.documentBackUrl) {
      setDocumentBackFile({ source: "platform", url: initialData.documentBackUrl });
      setDocumentBackType(initialData.documentBackType ?? "pdf");
      setDocBackLoading(false);
    } else {
      setDocumentBackFile(null);
      setDocumentBackType(null);
      setDocBackLoading(false);
    }

    if (imageInputRef.current) imageInputRef.current.value = "";
    if (idInputRef.current) idInputRef.current.value = "";
    if (idBackInputRef.current) idBackInputRef.current.value = "";

    const pAuto = ADDRESS_PRESENT_KEYS.every((k) => filledFields.includes(k));
    const permAuto = ADDRESS_PERMANENT_KEYS.every((k) => filledFields.includes(k));
    const allKeys = [
      "subscriberName",
      "subscriberType",
      "authorizedPersonName",
      "nationalIdNumber",
      "passportNumber",
      "phoneNumber",
      "birthDate",
      "gender",
      "occupation",
      "connection",
      "registrationDate",
      "prefix",
      "validEmail",
      "billingAddress",
      "fatherName",
      "motherName",
      "spouseName",
    ];
    const hasUnfilled =
      allKeys.some((k) => !filledFields.includes(k)) || !pAuto || !permAuto;
    setPhase(hasUnfilled ? "manual" : "review");
  };

  // ─── Validation helpers ────────────────────────────────────────────────────

  const buildCoreErrors = () => {
    const e: Partial<Record<keyof SubscriberFormValues, string>> = {};
    if (!formData.subscriberName.trim())
      e.subscriberName = "Subscriber Name is required.";
    if (
      !formData.subscriberType ||
      formData.subscriberType === "" ||
      formData.subscriberType === "Please select"
    )
      e.subscriberType = "Please select a Subscriber Type.";
    const nidVal = formData.nationalIdNumber.replace(/[\s-]/g, "");
    const passportVal = formData.passportNumber.trim();
    if (!nidVal && !passportVal) {
      e.nationalIdNumber =
        "Either a National ID Number or a Passport Number is required.";
    } else if (
      nidVal &&
      (!/^\d+$/.test(nidVal) ||
        (nidVal.length !== 10 &&
          nidVal.length !== 13 &&
          nidVal.length !== 17))
    ) {
      e.nationalIdNumber = "National ID must be 10, 13, or 17 digits.";
    }
    const phoneVal = formData.phoneNumber.trim();
    if (!phoneVal) {
      e.phoneNumber = "Phone Number is required.";
    } else if (!/^[0-9+()\ \-]{7,20}$/.test(phoneVal)) {
      e.phoneNumber = "Please enter a valid phone number.";
    }
    if (!formData.birthDate) {
      e.birthDate = "Birth Date is required.";
    } else {
      const d = new Date(formData.birthDate);
      const today = new Date();
      if (isNaN(d.getTime())) {
        e.birthDate = "Please provide a valid date format.";
      } else if (d > today) {
        e.birthDate = "Birth Date cannot be in the future.";
      } else if (d < new Date("1900-01-01")) {
        e.birthDate = "Birth Date cannot precede the year 1900.";
      }
    }
    const emailVal = formData.validEmail.trim();
    if (!emailVal) {
      e.validEmail = "Valid Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      e.validEmail = "Please enter a valid email address.";
    }
    return e;
  };

  // Step 1 → step 2: only validate fields visible in the manual phase
  const handleContinue = (ev: React.FormEvent) => {
    ev.preventDefault();
    setIsSuccess(false);
    const allErrors = buildCoreErrors();
    // Filter to only errors whose field lives in step 1 (not auto-filled)
    const step1Errors: Partial<Record<keyof SubscriberFormValues, string>> = {};
    (Object.keys(allErrors) as Array<keyof SubscriberFormValues>).forEach(
      (k) => {
        if (!isAutoFilled(k as string)) step1Errors[k] = allErrors[k];
      }
    );
    setErrors(step1Errors);
    if (Object.keys(step1Errors).length > 0) {
      const firstKey = Object.keys(step1Errors)[0];
      document
        .getElementById(`field-${firstKey}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setPhase("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [isSaving, setIsSaving] = useState(false);
  const [submitStage, setSubmitStage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitElapsedMs, setSubmitElapsedMs] = useState(0);

  // Map ICC error reasons to user-facing messages
  const _reasonMessage = (reason: string): string => {
    switch (reason) {
      case "login_failed":
        return "Unable to authenticate with the ICC system. Please try again or contact support.";
      case "duplicate":
        return "A subscriber with this National ID or Passport already exists in the ICC system.";
      case "validation_failed":
        return "The ICC system rejected the submission due to a validation error. Please review the form fields and try again.";
      case "site_unavailable":
        return "The ICC system is currently unavailable. Please try again in a few minutes.";
      default:
        return "An unexpected error occurred while submitting to the ICC system. Please try again.";
    }
  };

  // Final submit from step 2
  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (isSaving) return;
    setIsSuccess(false);
    setSubmitError("");
    setSubmitStage("");
    setSubmitElapsedMs(0);
    const allErrors = buildCoreErrors();
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      const firstKey = Object.keys(allErrors)[0] as keyof SubscriberFormValues;
      const isStep1Field =
        firstKey === "presentStreet" ||
        firstKey === "presentCity" ||
        firstKey === "presentPostalZip" ||
        firstKey === "presentCountry"
          ? !presentAddressAutoFilled
          : firstKey === "permanentStreet" ||
            firstKey === "permanentCity" ||
            firstKey === "permanentPostalZip" ||
            firstKey === "permanentCountry"
          ? !permanentAddressAutoFilled
          : !isAutoFilled(firstKey);

      if (isStep1Field) {
        setPhase("manual");
      }
      setTimeout(() => {
        document
          .getElementById(`field-${firstKey}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setIsSaving(true);
    setSubmitStage("Preparing submission…");
    const startTime = Date.now();

    try {
      // ── Resolve file blobs ──────────────────────────────────────────────
      let finalPhotoBlob: Blob | File | null = null;
      let finalDocBlob: Blob | File | null = null;

      if (photoFile) {
        if (photoFile.source === "upload") {
          finalPhotoBlob = photoFile.file;
        } else if (photoFile.source === "platform") {
          try {
            setSubmitStage("Fetching photo…");
            const res = await fetch(photoFile.url);
            if (res.ok) {
              finalPhotoBlob = await res.blob();
            }
          } catch (e) {
            console.error("Failed to fetch platform photo blob:", e);
          }
        }
      }

      if (documentFile) {
        if (documentFile.source === "upload") {
          finalDocBlob = documentFile.file;
        } else if (documentFile.source === "platform") {
          try {
            setSubmitStage("Fetching document…");
            const res = await fetch(documentFile.url);
            if (res.ok) {
              finalDocBlob = await res.blob();
            }
          } catch (e) {
            console.error("Failed to fetch platform document blob:", e);
          }
        }
      }

      let finalDocBackBlob: Blob | File | null = null;
      if (documentBackFile) {
        if (documentBackFile.source === "upload") {
          finalDocBackBlob = documentBackFile.file;
        } else if (documentBackFile.source === "platform") {
          try {
            setSubmitStage("Fetching back document…");
            const res = await fetch(documentBackFile.url);
            if (res.ok) {
              finalDocBackBlob = await res.blob();
            }
          } catch (e) {
            console.error("Failed to fetch platform back document blob:", e);
          }
        }
      }

      // Notify parent callback with resolved real blobs
      onSave?.({
        ...formData,
        photo: finalPhotoBlob,
        document: finalDocBlob,
        documentBack: finalDocBackBlob,
      });

      // ── Build FormData for /api/submit ───────────────────────────────────
      const targetProvider = formData.provider === "ICON" ? "ICON" : "ICC";
      setSubmitStage(`Submitting to ${targetProvider}…`);
      const submitFormData = new FormData();
      submitFormData.append("fields", JSON.stringify(formData));

      if (finalPhotoBlob) {
        submitFormData.append("photo", finalPhotoBlob, "photo.jpg");
      }
      if (finalDocBlob) {
        const isPdf =
          documentType === "pdf" || finalDocBlob.type === "application/pdf";
        const docName = isPdf ? "document.pdf" : "document.jpg";
        submitFormData.append("document", finalDocBlob, docName);
      }
      if (finalDocBackBlob) {
        const isBackPdf =
          documentBackType === "pdf" ||
          finalDocBackBlob.type === "application/pdf";
        const docBackName = isBackPdf ? "document-back.pdf" : "document-back.jpg";
        submitFormData.append("documentBack", finalDocBackBlob, docBackName);
      }

      // ── POST to /api/submit ─────────────────────────────────────────────
      const submitRes = await fetch("/api/submit", {
        method: "POST",
        body: submitFormData,
      });

      if (!submitRes.ok) {
        const errBody = await submitRes.json().catch(() => ({ error: "unknown" }));
        if (submitRes.status === 429) {
          setSubmitError("Too many submissions. Please wait a few minutes before trying again.");
        } else if (errBody.error === "validation_failed") {
          setSubmitError(
            errBody.detail
              ? `Validation error: ${errBody.detail}`
              : "Please check the form fields and try again."
          );
        } else {
          setSubmitError("Failed to submit. The service may be temporarily unavailable.");
        }
        return;
      }

      const { submitJobId } = (await submitRes.json()) as { submitJobId: string };
      if (!submitJobId) {
        setSubmitError("Failed to submit — no job ID returned.");
        return;
      }

      // ── Poll /api/submit/[id] every 400ms for up to 30s ────────────────
      setSubmitStage("Processing…");
      const maxPollMs = 30_000;
      const pollIntervalMs = 400;
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxPollMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));

        let pollData: {
          status: string;
          stage?: string;
          reason?: string;
          durationMs?: number;
        };

        try {
          const pollRes = await fetch(`/api/submit/${submitJobId}`, {
            cache: "no-store",
          });
          pollData = await pollRes.json();
        } catch {
          continue; // Network hiccup, retry
        }

        // Update stage text
        if (pollData.stage) {
          const stageLabels: Record<string, string> = {
            queued: "Queued…",
            submitting: "Submitting to ICC…",
            login: "Authenticating…",
            duplicate_check: "Checking for duplicates…",
            save: "Saving subscriber…",
            done: "Complete!",
            done_verified: "Verified and complete!",
          };
          setSubmitStage(stageLabels[pollData.stage] || `${pollData.stage}…`);
        }

        if (pollData.status === "done") {
          const elapsed = pollData.durationMs ?? (Date.now() - startTime);
          setSubmitElapsedMs(elapsed);
          setIsSuccess(true);
          setSubmitStage("");
          if (onSave) {
            onSave({
              ...formData,
              photo: finalPhotoBlob,
              document: finalDocBlob,
            });
          }
          return;
        }

        if (pollData.status === "error") {
          setSubmitError(_reasonMessage(pollData.reason || "unknown"));
          setSubmitStage("");
          return;
        }
      }

      // Polling timed out
      setSubmitError(`The submission is taking longer than expected. Please check the ${targetProvider} admin panel to confirm.`);
      setSubmitStage("");
    } catch (err) {
      console.error("Failed to finalize submission:", err);
      setSubmitError("An unexpected error occurred. Please try again.");
      setSubmitStage("");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Badge renderer ───────────────────────────────────────────────────────

  const renderBadge = (fieldKey: string) => {
    if (!activeAutoFilled.has(fieldKey)) return null;
    return (
      <span className="autofill-badge" title="Retrieved from data records">
        Verified
      </span>
    );
  };

  const hasErr = (fieldKey: keyof SubscriberFormValues) => !!errors[fieldKey];

  // ─── Field render helpers ─────────────────────────────────────────────────

  const fieldSubscriberName = (
    <div className="s-form-group" id="field-subscriberName">
      <div className="s-label-row">
        <label htmlFor="subscriberName" className="s-label">
          Subscriber Name <span className="req">*</span>
        </label>
        {renderBadge("subscriberName")}
      </div>
      <input
        type="text"
        id="subscriberName"
        value={formData.subscriberName}
        onChange={(e) => handleChange("subscriberName", e.target.value)}
        className={`s-input ${hasErr("subscriberName") ? "s-has-error" : ""}`}
        placeholder="Full Name or Company Name"
      />
      {errors.subscriberName && (
        <p className="s-error-msg">{errors.subscriberName}</p>
      )}
    </div>
  );

  const fieldConnection = (
    <div className="s-form-group">
      <div className="s-label-row">
        <span className="s-label">Connection</span>
      </div>
      <div className="s-radio-group">
        {["Prepaid", "Postpaid"].map((opt) => (
          <label key={opt} className="s-radio-label">
            <input
              type="radio"
              name="connection"
              value={opt}
              checked={formData.connection === opt}
              onChange={(e) => handleChange("connection", e.target.value)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const fieldRegistrationDate = (
    <div className="s-form-group" id="field-registrationDate">
      <div className="s-label-row">
        <label htmlFor="registrationDate" className="s-label">
          Registration Date
        </label>
        {renderBadge("registrationDate")}
      </div>
      <input
        type="date"
        id="registrationDate"
        value={formData.registrationDate}
        onChange={(e) => handleChange("registrationDate", e.target.value)}
        className="s-input"
      />
    </div>
  );

  const fieldPrefix = (
    <div className="s-section-box">
      <div className="s-section-title">Prefix</div>
      <div className="s-grid-3">
        {(["A", "B", "C"] as const).map((letter) => {
          const key = `prefix${letter}` as keyof SubscriberFormValues;
          return (
            <div className="s-form-group" key={letter}>
              <label htmlFor={`prefix${letter}`} className="s-label">
                Prefix {letter}
              </label>
              <input
                type="text"
                id={`prefix${letter}`}
                value={formData[key] as string}
                onChange={(e) => handleChange(key, e.target.value)}
                className="s-input"
                placeholder={`e.g. 0${letter === "A" ? 1 : letter === "B" ? 2 : 3}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  const fieldSubscriberType = (
    <div className="s-form-group" id="field-subscriberType">
      <div className="s-label-row">
        <label htmlFor="subscriberType" className="s-label">
          Subscriber Type <span className="req">*</span>
        </label>
        {renderBadge("subscriberType")}
      </div>
      <select
        id="subscriberType"
        value={formData.subscriberType}
        onChange={(e) => handleChange("subscriberType", e.target.value)}
        className={`s-select ${hasErr("subscriberType") ? "s-has-error" : ""}`}
      >
        <option value="">Please select</option>
        <option value="Individual">Individual</option>
        <option value="Company">Company</option>
      </select>
      {errors.subscriberType && (
        <p className="s-error-msg">{errors.subscriberType}</p>
      )}
    </div>
  );

  const fieldAuthorizedPerson = (
    <div className="s-form-group" id="field-authorizedPersonName">
      <div className="s-label-row">
        <label htmlFor="authorizedPersonName" className="s-label">
          Authorized Person Name
        </label>
        {renderBadge("authorizedPersonName")}
      </div>
      <input
        type="text"
        id="authorizedPersonName"
        value={formData.authorizedPersonName}
        onChange={(e) => handleChange("authorizedPersonName", e.target.value)}
        className="s-input"
        placeholder="Authorized Person (for companies)"
      />
    </div>
  );

  const fieldNationalId = (
    <div className="s-form-group" id="field-nationalIdNumber">
      <div className="s-label-row">
        <label htmlFor="nationalIdNumber" className="s-label">
          National ID Number
        </label>
        {renderBadge("nationalIdNumber")}
      </div>
      <input
        type="text"
        inputMode="numeric"
        id="nationalIdNumber"
        value={formData.nationalIdNumber}
        onChange={(e) =>
          handleChange("nationalIdNumber", e.target.value.replace(/\D/g, ""))
        }
        className={`s-input ${hasErr("nationalIdNumber") ? "s-has-error" : ""}`}
        placeholder="10, 13, or 17 Digits"
      />
      {errors.nationalIdNumber && (
        <p className="s-error-msg">{errors.nationalIdNumber}</p>
      )}
    </div>
  );

  const fieldPassport = (
    <div className="s-form-group" id="field-passportNumber">
      <div className="s-label-row">
        <label htmlFor="passportNumber" className="s-label">
          Passport Number
        </label>
        {renderBadge("passportNumber")}
      </div>
      <input
        type="text"
        id="passportNumber"
        value={formData.passportNumber}
        onChange={(e) => handleChange("passportNumber", e.target.value)}
        className={`s-input ${hasErr("passportNumber") ? "s-has-error" : ""}`}
        placeholder="Passport Number (if applicable)"
      />
      {errors.passportNumber && (
        <p className="s-error-msg">{errors.passportNumber}</p>
      )}
    </div>
  );

  const fieldPhoneNumber = (
    <div className="s-form-group" id="field-phoneNumber">
      <div className="s-label-row">
        <label htmlFor="phoneNumber" className="s-label">
          Phone Number <span className="req">*</span>
        </label>
        {renderBadge("phoneNumber")}
      </div>
      <input
        type="tel"
        id="phoneNumber"
        value={formData.phoneNumber}
        onChange={(e) => handleChange("phoneNumber", e.target.value)}
        className={`s-input ${hasErr("phoneNumber") ? "s-has-error" : ""}`}
        placeholder="e.g. 01712345678"
      />
      {errors.phoneNumber && (
        <p className="s-error-msg">{errors.phoneNumber}</p>
      )}
    </div>
  );

  const fieldBirthDate = (
    <div className="s-form-group" id="field-birthDate">
      <div className="s-label-row">
        <label htmlFor="birthDate" className="s-label">
          Birth Date <span className="req">*</span>
        </label>
        {renderBadge("birthDate")}
      </div>
      <input
        type="date"
        id="birthDate"
        value={formData.birthDate}
        onChange={(e) => handleChange("birthDate", e.target.value)}
        className={`s-input ${hasErr("birthDate") ? "s-has-error" : ""}`}
      />
      {errors.birthDate && <p className="s-error-msg">{errors.birthDate}</p>}
    </div>
  );

  const fieldGender = (
    <div className="s-form-group" id="field-gender">
      <div className="s-label-row">
        <span className="s-label">Gender</span>
        {renderBadge("gender")}
      </div>
      <div className="s-radio-group">
        {["Male", "Female"].map((g) => (
          <label key={g} className="s-radio-label">
            <input
              type="radio"
              name="gender"
              value={g}
              checked={formData.gender === g}
              onChange={(e) => handleChange("gender", e.target.value)}
            />
            <span>{g}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const fieldOccupation = (
    <div className="s-form-group" id="field-occupation">
      <div className="s-label-row">
        <span className="s-label">Occupation</span>
        {renderBadge("occupation")}
      </div>
      <div className="s-radio-group s-radio-wrap">
        {[
          "Government Service",
          "Private Service",
          "Business",
          "Student",
          "Other",
        ].map((occ) => (
          <label key={occ} className="s-radio-label">
            <input
              type="radio"
              name="occupation"
              value={occ}
              checked={formData.occupation === occ}
              onChange={(e) => handleChange("occupation", e.target.value)}
            />
            <span>{occ}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const fieldPresentAddress = (
    <div className="s-section-box">
      <div className="s-section-title">Present Address</div>
      <div className="s-grid-2">
        <div className="s-form-group s-col-span-2">
          <div className="s-label-row">
            <label htmlFor="presentStreet" className="s-label">Street</label>
            {renderBadge("presentStreet")}
          </div>
          <input type="text" id="presentStreet" value={formData.presentStreet}
            onChange={(e) => handleChange("presentStreet", e.target.value)}
            className="s-input" placeholder="Street / Road / Holding" />
        </div>
        <div className="s-form-group">
          <div className="s-label-row">
            <label htmlFor="presentCity" className="s-label">City</label>
            {renderBadge("presentCity")}
          </div>
          <input type="text" id="presentCity" value={formData.presentCity}
            onChange={(e) => handleChange("presentCity", e.target.value)}
            className="s-input" placeholder="City" />
        </div>
        <div className="s-form-group">
          <div className="s-label-row">
            <label htmlFor="presentPostalZip" className="s-label">Postal Zip</label>
            {renderBadge("presentPostalZip")}
          </div>
          <input type="text" id="presentPostalZip" value={formData.presentPostalZip}
            onChange={(e) => handleChange("presentPostalZip", e.target.value)}
            className="s-input" placeholder="Postal Code" />
        </div>
        <div className="s-form-group s-col-span-2">
          <div className="s-label-row">
            <label htmlFor="presentCountry" className="s-label">Country</label>
            {renderBadge("presentCountry")}
          </div>
          <input type="text" id="presentCountry" value={formData.presentCountry}
            onChange={(e) => handleChange("presentCountry", e.target.value)}
            className="s-input" placeholder="Country" />
        </div>
      </div>
    </div>
  );

  const fieldPermanentAddress = (
    <div className="s-section-box">
      <div className="s-section-title">Permanent Address</div>
      <div className="s-grid-2">
        <div className="s-form-group s-col-span-2">
          <div className="s-label-row">
            <label htmlFor="permanentStreet" className="s-label">Street</label>
            {renderBadge("permanentStreet")}
          </div>
          <input type="text" id="permanentStreet" value={formData.permanentStreet}
            onChange={(e) => handleChange("permanentStreet", e.target.value)}
            className="s-input" placeholder="Street / Road / Holding" />
        </div>
        <div className="s-form-group">
          <div className="s-label-row">
            <label htmlFor="permanentCity" className="s-label">City</label>
            {renderBadge("permanentCity")}
          </div>
          <input type="text" id="permanentCity" value={formData.permanentCity}
            onChange={(e) => handleChange("permanentCity", e.target.value)}
            className="s-input" placeholder="City" />
        </div>
        <div className="s-form-group">
          <div className="s-label-row">
            <label htmlFor="permanentPostalZip" className="s-label">Postal Zip</label>
            {renderBadge("permanentPostalZip")}
          </div>
          <input type="text" id="permanentPostalZip" value={formData.permanentPostalZip}
            onChange={(e) => handleChange("permanentPostalZip", e.target.value)}
            className="s-input" placeholder="Postal Code" />
        </div>
        <div className="s-form-group s-col-span-2">
          <div className="s-label-row">
            <label htmlFor="permanentCountry" className="s-label">Country</label>
            {renderBadge("permanentCountry")}
          </div>
          <input type="text" id="permanentCountry" value={formData.permanentCountry}
            onChange={(e) => handleChange("permanentCountry", e.target.value)}
            className="s-input" placeholder="Country" />
        </div>
      </div>
    </div>
  );

  const fieldBillingAddress = (
    <div className="s-form-group">
      <div className="s-label-row">
        <span className="s-label">Billing Address</span>
      </div>
      <div className="s-radio-group">
        {["Present", "Permanent"].map((opt) => (
          <label key={opt} className="s-radio-label">
            <input
              type="radio"
              name="billingAddress"
              value={opt}
              checked={formData.billingAddress === opt}
              onChange={(e) => handleChange("billingAddress", e.target.value)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const fieldEmail = (
    <div className="s-form-group" id="field-validEmail">
      <div className="s-label-row">
        <label htmlFor="validEmail" className="s-label">
          Email Address <span className="req">*</span>
        </label>
        {renderBadge("validEmail")}
      </div>
      <input
        type="email"
        id="validEmail"
        value={formData.validEmail}
        onChange={(e) => handleChange("validEmail", e.target.value)}
        className={`s-input ${hasErr("validEmail") ? "s-has-error" : ""}`}
        placeholder="e.g. subscriber@example.com"
      />
      {errors.validEmail && <p className="s-error-msg">{errors.validEmail}</p>}
    </div>
  );

  const fieldFatherName = (
    <div className="s-form-group" id="field-fatherName">
      <div className="s-label-row">
        <label htmlFor="fatherName" className="s-label">Father&apos;s Name</label>
        {renderBadge("fatherName")}
      </div>
      <input type="text" id="fatherName" value={formData.fatherName}
        onChange={(e) => handleChange("fatherName", e.target.value)}
        className="s-input" placeholder="Father's full name" />
    </div>
  );

  const fieldMotherName = (
    <div className="s-form-group" id="field-motherName">
      <div className="s-label-row">
        <label htmlFor="motherName" className="s-label">Mother&apos;s Name</label>
        {renderBadge("motherName")}
      </div>
      <input type="text" id="motherName" value={formData.motherName}
        onChange={(e) => handleChange("motherName", e.target.value)}
        className="s-input" placeholder="Mother's full name" />
    </div>
  );

  const fieldSpouseName = (
    <div className="s-form-group" id="field-spouseName">
      <div className="s-label-row">
        <label htmlFor="spouseName" className="s-label">Spouse Name</label>
      </div>
      <input type="text" id="spouseName" value={formData.spouseName}
        onChange={(e) => handleChange("spouseName", e.target.value)}
        className="s-input" placeholder="Spouse full name" />
    </div>
  );

  // ─── Upload column ─────────────────────────────────────────────────────────

  const uploadColumn = (
    <div className="subscriber-upload-column">
      {/* ── Photo Card ── */}
      <div className="s-upload-card">
        <div className="s-label-row">
          <div className="s-section-title" style={{ marginBottom: 0 }}>Photo</div>
          {renderBadge("photo")}
        </div>
        <p className="s-upload-hint">Subscriber photo</p>

        {photoUploadError && (
          <p className="s-error-msg" style={{ marginBottom: 10 }}>{photoUploadError}</p>
        )}

        <div className="preview-container">
          {photoFile ? (
            <div className="preview-box photo-box-300" style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
              <div style={{ position: "relative", width: 300, height: 300, maxWidth: "100%", borderRadius: "8px", overflow: "hidden", background: "var(--bg-beige)", border: "1px solid var(--border-subtle)" }}>
                {photoLoading && (
                  <div className="file-skeleton" style={{ position: "absolute", inset: 0, zIndex: 1 }} />
                )}
                {photoError ? (
                  <div className="file-fallback-note" style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="1.5" style={{ marginBottom: 8 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>Photo preview unavailable</span>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photoFile.source === "platform" ? photoFile.url : photoBlobUrl ?? ""}
                    alt="Subscriber photo"
                    width={300}
                    height={300}
                    style={{
                      width: 300,
                      height: 300,
                      maxWidth: "100%",
                      objectFit: "cover",
                      borderRadius: "8px",
                      display: photoLoading ? "none" : "block",
                    }}
                    onLoad={() => setPhotoLoading(false)}
                    onError={() => {
                      setPhotoLoading(false);
                      setPhotoError(true);
                    }}
                  />
                )}
              </div>
              <span className="photo-dimension-caption" style={{ fontSize: "11px", color: "var(--text-dim, #94a3b8)", marginTop: 6, display: "block", textAlign: "center" }}>
                300 x 300 px
              </span>
              <div className="preview-meta" style={{ width: "100%", marginTop: 8 }}>
                <span className="file-name">
                  {photoFile.source === "platform" ? "Verified live photo" : (photoFile as { name?: string }).name || "Uploaded photo"}
                </span>
                <button type="button" onClick={handleRemovePhoto} className="clear-file-btn">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              className="preview-placeholder"
              onClick={() => imageInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") imageInputRef.current?.click();
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <span>Select Photograph</span>
            </div>
          )}
        </div>

        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageChange}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className="upload-trigger-btn"
        >
          Choose Image File
        </button>
      </div>

      {/* ── Document Section: NID Front & NID Back Cards ── */}
      <div className="s-upload-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="s-label-row">
          <div className="s-section-title" style={{ marginBottom: 0 }}>Identity Documents</div>
          <div style={{ display: "flex", gap: 6 }}>
            {renderBadge("document")}
            {renderBadge("documentBack")}
          </div>
        </div>
        <p className="s-upload-hint">National ID or Passport document (Front &amp; Back)</p>

        {/* ── Card 1: NID Front ── */}
        <div style={{ background: "var(--bg-beige)", borderRadius: 8, padding: 14, border: "1px solid var(--border-subtle)" }}>
          <div className="s-label-row" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)" }}>
              {documentType === "pdf" ? "NID Front (PDF)" : "NID Front"}
            </div>
            {renderBadge("document")}
          </div>

          {docUploadError && (
            <p className="s-error-msg" style={{ marginBottom: 10 }}>{docUploadError}</p>
          )}

          <div className="preview-container">
            {documentFile ? (
              <div className="preview-box">
                {docLoading && (
                  <div className="file-skeleton" style={{ height: 120 }} />
                )}
                {docError ? (
                  <div className="file-fallback-note" style={{ padding: 16 }}>
                    <span>Front document preview unavailable</span>
                  </div>
                ) : documentType === "pdf" ? (
                  <div className="pdf-card-container" style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)", wordBreak: "break-word" }}>
                          NID Front (PDF)
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim, #94a3b8)", marginTop: 2 }}>
                          PDF Document
                        </div>
                      </div>
                    </div>

                    {/* Actions: View (new tab) and Download */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                      <a
                        href={documentFile.source === "platform" ? documentFile.url : docBlobUrl ?? ""}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="s-doc-action-link"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--sky-blue)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        View
                      </a>
                      <span style={{ color: "var(--border-medium)" }}>•</span>
                      <a
                        href={documentFile.source === "platform" ? documentFile.url : docBlobUrl ?? ""}
                        download="nid-front.pdf"
                        className="s-doc-action-link"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--emerald)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                      </a>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={documentFile.source === "platform" ? documentFile.url : docBlobUrl ?? ""}
                      alt="NID Front preview"
                      className="image-preview"
                      onError={() => setDocError(true)}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", borderTop: "1px solid var(--border-subtle)" }}>
                      <a
                        href={documentFile.source === "platform" ? documentFile.url : docBlobUrl ?? ""}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="s-doc-action-link"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--sky-blue)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        View
                      </a>
                      <span style={{ color: "var(--border-medium)" }}>•</span>
                      <a
                        href={documentFile.source === "platform" ? documentFile.url : docBlobUrl ?? ""}
                        download="nid-front.jpg"
                        className="s-doc-action-link"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--emerald)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        Download
                      </a>
                    </div>
                  </div>
                )}
                <div className="preview-meta">
                  <span className="file-name">
                    {documentFile.source === "platform"
                      ? "Verified NID Front"
                      : (documentFile as { name?: string }).name || "Uploaded front"}
                  </span>
                  <button type="button" onClick={handleRemoveDocument} className="clear-file-btn">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="preview-placeholder"
                onClick={() => idInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") idInputRef.current?.click();
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                  <circle cx="7" cy="15" r="1" />
                  <line x1="12" x2="18" y1="15" y2="15" />
                </svg>
                <span>Select NID Front (PDF or Image)</span>
              </div>
            )}
          </div>

          <input
            type="file"
            ref={idInputRef}
            accept="application/pdf,image/*"
            style={{ display: "none" }}
            onChange={handleIdChange}
          />
          <button
            type="button"
            onClick={() => idInputRef.current?.click()}
            className="upload-trigger-btn"
            style={{ width: "100%", marginTop: 6 }}
          >
            Choose Front File
          </button>
        </div>

        {/* ── Card 2: NID Back ── */}
        <div style={{ background: "var(--bg-beige)", borderRadius: 8, padding: 14, border: "1px solid var(--border-subtle)" }}>
          <div className="s-label-row" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)" }}>
              {documentBackType === "pdf" ? "NID Back (PDF)" : "NID Back"}
            </div>
            {renderBadge("documentBack")}
          </div>

          {docBackUploadError && (
            <p className="s-error-msg" style={{ marginBottom: 10 }}>{docBackUploadError}</p>
          )}

          <div className="preview-container">
            {documentBackFile ? (
              <div className="preview-box">
                {docBackLoading && (
                  <div className="file-skeleton" style={{ height: 120 }} />
                )}
                {docBackError ? (
                  <div className="file-fallback-note" style={{ padding: 16 }}>
                    <span>Back document preview unavailable</span>
                  </div>
                ) : documentBackType === "pdf" ? (
                  <div className="pdf-card-container" style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-main)", wordBreak: "break-word" }}>
                          NID Back (PDF)
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim, #94a3b8)", marginTop: 2 }}>
                          PDF Document
                        </div>
                      </div>
                    </div>

                    {/* Actions: View (new tab) and Download */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                      <a
                        href={documentBackFile.source === "platform" ? documentBackFile.url : docBackBlobUrl ?? ""}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="s-doc-action-link"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--sky-blue)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        View
                      </a>
                      <span style={{ color: "var(--border-medium)" }}>•</span>
                      <a
                        href={documentBackFile.source === "platform" ? documentBackFile.url : docBackBlobUrl ?? ""}
                        download="nid-back.pdf"
                        className="s-doc-action-link"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--emerald)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                      </a>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={documentBackFile.source === "platform" ? documentBackFile.url : docBackBlobUrl ?? ""}
                      alt="NID Back preview"
                      className="image-preview"
                      onError={() => setDocBackError(true)}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", borderTop: "1px solid var(--border-subtle)" }}>
                      <a
                        href={documentBackFile.source === "platform" ? documentBackFile.url : docBackBlobUrl ?? ""}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="s-doc-action-link"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--sky-blue)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        View
                      </a>
                      <span style={{ color: "var(--border-medium)" }}>•</span>
                      <a
                        href={documentBackFile.source === "platform" ? documentBackFile.url : docBackBlobUrl ?? ""}
                        download="nid-back.jpg"
                        className="s-doc-action-link"
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--emerald)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        Download
                      </a>
                    </div>
                  </div>
                )}
                <div className="preview-meta">
                  <span className="file-name">
                    {documentBackFile.source === "platform"
                      ? "Verified NID Back"
                      : (documentBackFile as { name?: string }).name || "Uploaded back"}
                  </span>
                  <button type="button" onClick={handleRemoveDocumentBack} className="clear-file-btn">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="preview-placeholder"
                onClick={() => idBackInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") idBackInputRef.current?.click();
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                  <circle cx="7" cy="15" r="1" />
                  <line x1="12" x2="18" y1="15" y2="15" />
                </svg>
                <span>Select NID Back (PDF or Image)</span>
              </div>
            )}
          </div>

          <input
            type="file"
            ref={idBackInputRef}
            accept="application/pdf,image/*"
            style={{ display: "none" }}
            onChange={handleIdBackChange}
          />
          <button
            type="button"
            onClick={() => idBackInputRef.current?.click()}
            className="upload-trigger-btn"
            style={{ width: "100%", marginTop: 6 }}
          >
            Choose Back File
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Dynamic routing: auto-filled → step 2, rest → step 1 ────────────────

  const allFieldDefinitions: Array<{
    key: string;
    isFilled: boolean;
    node: React.ReactNode;
  }> = [
    {
      key: "subscriberName",
      isFilled: isAutoFilled("subscriberName"),
      node: fieldSubscriberName,
    },
    {
      key: "subscriberType",
      isFilled: isAutoFilled("subscriberType"),
      node: fieldSubscriberType,
    },
    {
      key: "authorizedPersonName",
      isFilled: isAutoFilled("authorizedPersonName"),
      node: fieldAuthorizedPerson,
    },
    {
      key: "nationalIdNumber",
      isFilled: isAutoFilled("nationalIdNumber"),
      node: fieldNationalId,
    },
    {
      key: "passportNumber",
      isFilled: isAutoFilled("passportNumber"),
      node: fieldPassport,
    },
    {
      key: "phoneNumber",
      isFilled: isAutoFilled("phoneNumber"),
      node: fieldPhoneNumber,
    },
    {
      key: "birthDate",
      isFilled: isAutoFilled("birthDate"),
      node: fieldBirthDate,
    },
    {
      key: "gender",
      isFilled: isAutoFilled("gender"),
      node: fieldGender,
    },
    {
      key: "occupation",
      isFilled: isAutoFilled("occupation"),
      node: fieldOccupation,
    },
    {
      key: "connection",
      isFilled: isAutoFilled("connection"),
      node: fieldConnection,
    },
    {
      key: "registrationDate",
      isFilled: isAutoFilled("registrationDate"),
      node: fieldRegistrationDate,
    },
    {
      key: "prefix",
      isFilled: isAutoFilled("prefix"),
      node: fieldPrefix,
    },
    {
      key: "validEmail",
      isFilled: isAutoFilled("validEmail"),
      node: fieldEmail,
    },
    {
      key: "presentAddress",
      isFilled: presentAddressAutoFilled,
      node: fieldPresentAddress,
    },
    {
      key: "permanentAddress",
      isFilled: permanentAddressAutoFilled,
      node: fieldPermanentAddress,
    },
    {
      key: "billingAddress",
      isFilled: isAutoFilled("billingAddress"),
      node: fieldBillingAddress,
    },
    {
      key: "fatherName",
      isFilled: isAutoFilled("fatherName"),
      node: fieldFatherName,
    },
    {
      key: "motherName",
      isFilled: isAutoFilled("motherName"),
      node: fieldMotherName,
    },
    {
      key: "spouseName",
      isFilled: isAutoFilled("spouseName"),
      node: fieldSpouseName,
    },
  ];

  const step1Nodes: React.ReactNode[] = [];
  const step2Nodes: React.ReactNode[] = [];

  allFieldDefinitions.forEach(({ key, isFilled, node }) => {
    if (isFilled) {
      step2Nodes.push(<React.Fragment key={key}>{node}</React.Fragment>);
    } else {
      step1Nodes.push(<React.Fragment key={key}>{node}</React.Fragment>);
    }
  });

  // ─── Heading copy ──────────────────────────────────────────────────────────

  const headingText = "Data Verification Form";
  const subtitleText =
    phase === "manual"
      ? "Enter required details to proceed."
      : "Review verified data records and upload attachments before submitting.";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="subscriber-form-wrapper">
      <div className="subscriber-header-row">
        <div>
          <h2 className="subscriber-title">{headingText}</h2>
          <p className="subscriber-subtitle">{subtitleText}</p>
        </div>
        <button type="button" onClick={onBackToSearch} className="search-another-link">
          ← New Search
        </button>
      </div>

      {isSuccess && (
        <div className="success-banner" role="status">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <div>
            <strong>Subscriber saved to {formData.provider === "ICON" ? "ICON" : "ICC"} successfully</strong>
            <p style={{ margin: 0, fontSize: "13px", opacity: 0.9 }}>
              {submitElapsedMs > 0
                ? `Completed in ${(submitElapsedMs / 1000).toFixed(1)}s.`
                : "All fields validated and submitted."}
            </p>
          </div>
        </div>
      )}

      {/* ── Provider Selector ── */}
      <div style={{
        marginBottom: 20,
        padding: "16px 20px",
        borderRadius: "12px",
        background: "var(--bg-beige)",
        border: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: 8 }}>
            <span>Target Telecom Provider Network</span>
            <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", background: "rgba(59, 130, 246, 0.2)", color: "var(--sky-blue)" }}>
              Autonomous Dispatch
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
            Select provider portal for live data publication
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: "10px",
            cursor: "pointer",
            background: (formData.provider || "ICC") === "ICC" ? "var(--emerald-light)" : "#ffffff",
            border: (formData.provider || "ICC") === "ICC" ? "1px solid var(--emerald-border)" : "1px solid var(--border-subtle)",
            transition: "all 0.15s ease",
          }}>
            <input
              type="radio"
              name="providerNetworkSelect"
              value="ICC"
              checked={(formData.provider || "ICC") === "ICC"}
              onChange={() => handleChange("provider", "ICC")}
              style={{ accentColor: "var(--emerald)", width: 16, height: 16, cursor: "pointer" }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--text-main)" }}>ICC Telecom</div>
              <div style={{ fontSize: "11.5px", color: "var(--emerald)", marginTop: 2 }}>Prefix Code: 09639</div>
            </div>
          </label>

          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: "10px",
            cursor: "pointer",
            background: formData.provider === "ICON" ? "var(--sky-blue-light)" : "#ffffff",
            border: formData.provider === "ICON" ? "1px solid var(--sky-blue)" : "1px solid var(--border-subtle)",
            transition: "all 0.15s ease",
          }}>
            <input
              type="radio"
              name="providerNetworkSelect"
              value="ICON"
              checked={formData.provider === "ICON"}
              onChange={() => handleChange("provider", "ICON")}
              style={{ accentColor: "#3b82f6", width: 16, height: 16, cursor: "pointer" }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--text-main)" }}>ICON Infotech</div>
              <div style={{ fontSize: "11.5px", color: "var(--sky-blue)", marginTop: 2 }}>Prefix Code: 09644</div>
            </div>
          </label>

          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: "10px",
            cursor: "pointer",
            background: (formData.provider === "RANKSITT" || formData.provider === "RANKS") ? "var(--indigo-light)" : "#ffffff",
            border: (formData.provider === "RANKSITT" || formData.provider === "RANKS") ? "1px solid var(--indigo-border)" : "1px solid var(--border-subtle)",
            transition: "all 0.15s ease",
          }}>
            <input
              type="radio"
              name="providerNetworkSelect"
              value="RANKSITT"
              checked={formData.provider === "RANKSITT" || formData.provider === "RANKS"}
              onChange={() => handleChange("provider", "RANKSITT")}
              style={{ accentColor: "#a855f7", width: 16, height: 16, cursor: "pointer" }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--text-main)" }}>Ranksitt</div>
              <div style={{ fontSize: "11.5px", color: "var(--indigo)", marginTop: 2 }}>Prefix Code: 09617</div>
            </div>
          </label>
        </div>
      </div>

      {submitError && !isSuccess && (
        <div className="success-banner" role="alert" style={{
          background: "rgba(239, 68, 68, 0.12)",
          borderColor: "var(--rose-border)",
          color: "var(--rose)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="var(--rose)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <strong>Submission Failed</strong>
            <p style={{ margin: 0, fontSize: "13px", opacity: 0.95 }}>
              {submitError}
            </p>
          </div>
        </div>
      )}

      {isSaving && submitStage && (
        <div className="success-banner" role="status" style={{
          background: "rgba(56, 189, 248, 0.08)",
          borderColor: "rgba(56, 189, 248, 0.25)",
          color: "#7dd3fc",
        }}>
          <div className="s-spinner" style={{
            width: 18, height: 18,
            border: "2px solid rgba(125, 211, 252, 0.3)",
            borderTopColor: "#7dd3fc",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            flexShrink: 0,
          }} />
          <div>
            <strong>{submitStage}</strong>
          </div>
        </div>
      )}

      {/* ── First View: Non-auto-filled fields ── */}
      {phase === "manual" && (
        <form onSubmit={handleContinue} noValidate className="subscriber-layout subscriber-layout-single">
          <div className="subscriber-fields-column">
            {step1Nodes}
          </div>
          <div className="subscriber-actions-bar">
            <button type="submit" className="s-btn s-btn-primary">Continue</button>
            <button type="button" onClick={handleReset} className="s-btn s-btn-secondary">Reset</button>
          </div>
        </form>
      )}

      {/* ── Second View: Auto-filled fields + document uploads ── */}
      {phase === "review" && (
        <form onSubmit={handleSave} noValidate className="subscriber-layout">
          <div className="subscriber-fields-column">
            {step2Nodes.length > 0 ? (
              step2Nodes
            ) : (
              <p className="subscriber-subtitle" style={{ marginTop: 8 }}>
                All records were entered manually. You may upload documents before submitting.
              </p>
            )}
          </div>

          {uploadColumn}

          <div className="subscriber-actions-bar">
            <button
              type="submit"
              className="s-btn s-btn-primary"
              disabled={isSaving}
              style={isSaving ? { opacity: 0.65, cursor: "not-allowed" } : undefined}
            >
              {isSaving ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    display: "inline-block", width: 14, height: 14,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }} />
                  Submitting…
                </span>
              ) : isSuccess ? "Submitted ✓" : "Submit Records"}
            </button>
            {step1Nodes.length > 0 && !isSaving && (
              <button type="button" onClick={() => setPhase("manual")} className="s-btn s-btn-secondary">← Back</button>
            )}
            {!isSaving && (
              <button type="button" onClick={handleReset} className="s-btn s-btn-secondary" style={{ marginLeft: "auto" }}>Reset</button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
